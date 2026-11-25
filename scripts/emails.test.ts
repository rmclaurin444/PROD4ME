/**
 * Prompt 15 tests: transactional email dispatch + the email address check.
 * Run:
 *   node --env-file=.env --test scripts/emails.test.ts
 *
 * No email is ever delivered: RESEND_API_KEY is removed before lib/email.ts
 * loads, so sendEmail() uses its development console fallback, which these
 * tests capture and count. The validator is a local fake HTTP server.
 *
 * Coverage:
 *   1) receipt + sale notice send exactly once, even when called repeatedly
 *      or concurrently (Stripe webhook redelivery)
 *   2) preferences: emailSales=false skips the sale notice (receipt still
 *      sent); emailOffers=false skips offer emails
 *   3) only verified users get transactional emails
 *   4) offer emails (new / expired) send once via EmailLog
 *   5) user-supplied text is HTML-escaped in the email body
 *   6) checkEmail: status mapping, typo suggestions, per-domain cache,
 *      fail-open on errors / timeouts, and skip when unset or "off"
 *
 * Fixtures: zm-email-* users — self-cleaning.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

delete process.env.RESEND_API_KEY // force the console fallback — never send

const { prisma } = await import('../lib/prisma.ts')
const send = await import('../lib/emails/send.ts')
const { templateHtml } = await import('../lib/email.ts')
const { receiptEmail } = await import('../lib/emails/receipt.ts')
const { checkEmail } = await import('../lib/email-check.ts')

// ---- capture "[email:dev] to=… subject=…" lines --------------------------
const sent: { to: string; subject: string }[] = []
const originalInfo = console.info
console.info = (...args: unknown[]) => {
  const line = String(args[0] ?? '')
  const match = /^\[email:dev\] to=(\S+) subject="([^"]*)"/.exec(line)
  if (match) sent.push({ to: match[1]!, subject: match[2]! })
  else originalInfo(...args)
}
const sentTo = (email: string, subjectPart: string) =>
  sent.filter(entry => entry.to === email && entry.subject.includes(subjectPart)).length

// ---- fixtures -------------------------------------------------------------
const stamp = Date.now().toString(36)
const PREFIX = 'zm-email-'

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}
await cleanup()

let n = 0
async function makeUser(role: 'PRODUCER' | 'ARTIST', extra: Record<string, unknown> = {}) {
  n += 1
  return prisma.user.create({
    data: {
      username: `zm_${n}_${stamp}`.slice(0, 20),
      email: `${PREFIX}${n}-${stamp}@test.dev`,
      name: `Email Test ${n}`,
      password: 'x',
      role,
      emailVerifiedAt: new Date(),
      ...extra,
    },
  })
}

async function makeSale(opts: { producerExtra?: Record<string, unknown>; title?: string } = {}) {
  const producer = await makeUser('PRODUCER', opts.producerExtra)
  const artist = await makeUser('ARTIST')
  const beat = await prisma.beat.create({
    data: { title: opts.title ?? `ZM Beat ${stamp}`, audioKey: 'zm/none.mp3', price: 25, producerId: producer.id },
  })
  const payment = await prisma.payment.create({
    data: {
      stripeSessionId: `cs_test_zm_${stamp}_${n}`,
      amountCents: 2500,
      status: 'SUCCEEDED',
      beatId: beat.id,
      artistId: artist.id,
      licenseType: 'NON_EXCLUSIVE',
    },
  })
  return { producer, artist, beat, payment }
}

after(async () => {
  console.info = originalInfo
  await cleanup()
  await prisma.$disconnect()
})

// ---- payments -------------------------------------------------------------
test('1) receipt and sale notice send once despite repeated/concurrent calls', async () => {
  const { producer, artist, payment } = await makeSale()

  await Promise.all([send.sendPaymentEmails(payment.id), send.sendPaymentEmails(payment.id)])
  await send.sendPaymentEmails(payment.id) // a later webhook redelivery

  assert.equal(sentTo(artist.email, 'receipt'), 1, 'exactly one receipt')
  assert.equal(sentTo(producer.email, 'You made a sale'), 1, 'exactly one sale notice')

  const row = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
  assert.ok(row.receiptSentAt, 'receiptSentAt set')
  assert.ok(row.saleNoticeSentAt, 'saleNoticeSentAt set')
})

test('2a) emailSales=false skips the sale notice; the receipt is always sent', async () => {
  const { producer, artist, payment } = await makeSale({ producerExtra: { emailSales: false } })
  await send.sendPaymentEmails(payment.id)
  assert.equal(sentTo(artist.email, 'receipt'), 1)
  assert.equal(sentTo(producer.email, 'You made a sale'), 0)
})

test('3) unverified recipients get nothing; non-SUCCEEDED payments send nothing', async () => {
  const { producer, artist, payment } = await makeSale({ producerExtra: { emailVerifiedAt: null } })
  await send.sendPaymentEmails(payment.id)
  assert.equal(sentTo(producer.email, 'You made a sale'), 0, 'unverified producer skipped')
  assert.equal(sentTo(artist.email, 'receipt'), 1)

  const pending = await makeSale()
  await prisma.payment.update({ where: { id: pending.payment.id }, data: { status: 'PENDING' } })
  await send.sendPaymentEmails(pending.payment.id)
  assert.equal(sentTo(pending.artist.email, 'receipt'), 0)
})

// ---- offers ---------------------------------------------------------------
async function makeOffer(opts: { producerExtra?: Record<string, unknown>; artistExtra?: Record<string, unknown> } = {}) {
  const producer = await makeUser('PRODUCER', opts.producerExtra)
  const artist = await makeUser('ARTIST', opts.artistExtra)
  const beat = await prisma.beat.create({
    data: { title: `ZM Offer Beat ${stamp}`, audioKey: 'zm/none.mp3', price: 40, producerId: producer.id },
  })
  const offer = await prisma.offer.create({
    data: {
      beatId: beat.id,
      artistId: artist.id,
      producerId: producer.id,
      licenseType: 'NON_EXCLUSIVE',
      listingPriceCents: 4000,
      amountCents: 3000,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    },
  })
  return { producer, artist, offer }
}

test('4) offer emails send once (EmailLog), to the right side', async () => {
  const { producer, artist, offer } = await makeOffer()
  await send.sendOfferEmail('NEW', offer.id)
  await send.sendOfferEmail('NEW', offer.id)
  assert.equal(sentTo(producer.email, 'New offer'), 1)
  assert.equal(sentTo(artist.email, 'New offer'), 0)

  await prisma.offer.update({ where: { id: offer.id }, data: { status: 'EXPIRED', expiresAt: null } })
  await send.sendOfferExpiredEmails([offer.id])
  await send.sendOfferExpiredEmails([offer.id]) // lazy expiry + cron overlap
  assert.equal(sentTo(artist.email, 'Offer expired'), 1)
})

test('2b) emailOffers=false skips offer emails', async () => {
  const { producer, offer } = await makeOffer({ producerExtra: { emailOffers: false } })
  await send.sendOfferEmail('NEW', offer.id)
  assert.equal(sentTo(producer.email, 'New offer'), 0)
  assert.equal(await prisma.emailLog.count({ where: { refId: offer.id } }), 0, 'nothing logged when skipped')
})

// ---- templates ------------------------------------------------------------
test('5) user-supplied text is escaped in email HTML', () => {
  const html = templateHtml({
    to: 'x@test.dev',
    ...receiptEmail({
      receiptNumber: 'r1',
      date: new Date(),
      beatTitle: '<script>alert(1)</script>',
      producerName: 'A & B',
      licenseType: 'EXCLUSIVE',
      amountCents: 12345,
      fromOffer: true,
      testMode: true,
    }),
  })
  assert.ok(!html.includes('<script>'), 'no raw script tag')
  assert.ok(html.includes('&lt;script&gt;'), 'escaped title')
  assert.ok(html.includes('A &amp; B'), 'escaped producer')
  assert.ok(html.includes('$123.45'), 'amount')
  assert.ok(html.includes('Test mode: no real money was charged.'), 'test-mode notice')
})

// ---- email check ----------------------------------------------------------
type FakeReply = { status?: number; body?: unknown; delayMs?: number }
const replies = new Map<string, FakeReply>() // keyed by domain
let validatorHits = 0
const server = http.createServer((req, res) => {
  validatorHits += 1
  const email = new URL(req.url ?? '/', 'http://x').searchParams.get('email') ?? ''
  const reply = replies.get(email.split('@')[1] ?? '') ?? { body: { email, status: 'VALID' } }
  setTimeout(() => {
    res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' })
    res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {}))
  }, reply.delayMs ?? 0)
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
after(() => new Promise<void>(resolve => server.close(() => resolve())))
const fakeUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

test('6a) checkEmail maps validator statuses and passes typo suggestions through', async () => {
  process.env.EMAIL_CHECK_URL = fakeUrl
  replies.set('gmial.com', { body: { status: 'NO_MX_RECORDS', typoSuggestion: 'someone@gmail.com' } })
  replies.set('nope-zm.test', { body: { status: 'INVALID_DOMAIN' } })
  replies.set('mailinator.com', { body: { status: 'DISPOSABLE' } })
  replies.set('weird-zm.test', { body: { status: 'SOMETHING_NEW' } })

  assert.deepEqual(await checkEmail('name@gmial.com'), { ok: false, reason: 'domain', suggestion: 'name@gmail.com' })
  assert.deepEqual(await checkEmail('a@nope-zm.test'), { ok: false, reason: 'domain' })
  assert.deepEqual(await checkEmail('a@mailinator.com'), { ok: false, reason: 'disposable' })
  assert.deepEqual(await checkEmail('a@weird-zm.test'), { ok: true }, 'unknown status → ok')
  assert.deepEqual(await checkEmail('not an email'), { ok: false, reason: 'format' })
  // role addresses and plus/dot aliases are fine
  assert.deepEqual(await checkEmail('info@valid-zm.test'), { ok: true })
  assert.deepEqual(await checkEmail('first.last+tag@valid-zm.test'), { ok: true })
})

test('6b) per-domain cache: the second address on a domain makes no call', async () => {
  process.env.EMAIL_CHECK_URL = fakeUrl
  replies.set('cache-zm.test', { body: { status: 'DISPOSABLE' } })
  const before = validatorHits
  await checkEmail('one@cache-zm.test')
  const result = await checkEmail('two@cache-zm.test')
  assert.equal(validatorHits - before, 1)
  assert.deepEqual(result, { ok: false, reason: 'disposable' })
})

test('6c) fails open on HTTP errors, junk responses and timeouts', async () => {
  process.env.EMAIL_CHECK_URL = fakeUrl
  replies.set('err-zm.test', { status: 500, body: { error: 'boom' } })
  replies.set('junk-zm.test', { body: 'not json' })
  replies.set('slow-zm.test', { delayMs: 3500, body: { status: 'DISPOSABLE' } })
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.deepEqual(await checkEmail('a@err-zm.test'), { ok: true })
    assert.deepEqual(await checkEmail('a@junk-zm.test'), { ok: true })
    const started = Date.now()
    assert.deepEqual(await checkEmail('a@slow-zm.test'), { ok: true })
    assert.ok(Date.now() - started < 3400, 'gave up at the 3s timeout')
  } finally {
    console.warn = warn
  }
})

test('6d) unset or "off" skips the check; an unreachable validator fails open', async () => {
  replies.set('skip-zm.test', { body: { status: 'DISPOSABLE' } })
  delete process.env.EMAIL_CHECK_URL
  assert.deepEqual(await checkEmail('a@skip-zm.test'), { ok: true })
  process.env.EMAIL_CHECK_URL = 'off'
  assert.deepEqual(await checkEmail('a@skip-zm.test'), { ok: true })

  process.env.EMAIL_CHECK_URL = 'http://127.0.0.1:1' // nothing listens here
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.deepEqual(await checkEmail('a@down-zm.test'), { ok: true })
  } finally {
    console.warn = warn
  }
})
