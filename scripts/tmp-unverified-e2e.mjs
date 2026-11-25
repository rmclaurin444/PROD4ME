/** Throwaway e2e: unverified accounts browse freely but can't purchase. */
const BASE = 'http://localhost:3000'

// An UNVERIFIED account: sign up a throwaway user (signup marks emailVerifiedAt
// null — the identity migration backfilled old users as verified, so sign up fresh)
async function signupUnverified() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  const csrf = await csrfRes.json()
  const csrfCookies = csrfRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const stamp = Date.now().toString(36)
  const email = `unverified-${stamp}@test.dev`
  const signupRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookies },
    body: JSON.stringify({
      email,
      password: 'password123',
      name: `Unverified ${stamp}`,
      role: 'ARTIST',
      username: `unv_${stamp}`,
    }),
  })
  const body = await signupRes.json()
  return { email, ok: signupRes.ok, body }
}

async function login(email) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  const csrf = await csrfRes.json()
  const csrfCookies = csrfRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, identifier: email, password: 'password123', callbackUrl: `${BASE}/`, json: 'true' }),
    redirect: 'manual',
  })
  return loginRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
}

const results = []
const ok = (cond, label) => results.push(`${cond ? 'PASS' : 'FAIL'} ${label}`)

const signup = await signupUnverified()
ok(signup.ok, `unverified account created (${signup.email})`)

const cookies = await login(signup.email)

// browsing APIs work for unverified users
const feed = await (await fetch(`${BASE}/api/feed`, { headers: { Cookie: cookies } })).json()
ok(feed.beats?.length > 0, `For You feed loads (${feed.beats?.length} beats)`)

const beats = (await (await fetch(`${BASE}/api/beats`)).json()).beats
const beat = beats.find(b => b.producer !== 'Unverified')
const like = await fetch(`${BASE}/api/events`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookies },
  body: JSON.stringify({ beatId: beat.id, type: 'LIKE', metadata: { feed: 'foryou' } }),
})
ok(like.status === 200, `engagement (LIKE) recorded (${like.status})`)

const stream = await fetch(`${BASE}/api/events`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookies },
  body: JSON.stringify({ beatId: beat.id, type: 'STREAM', metadata: { feed: 'foryou' } }),
})
ok(stream.status === 200, `engagement (STREAM) recorded (${stream.status})`)

// follow works
const producerUser = await (await fetch(`${BASE}/api/users/search?q=Dummy`, { headers: { Cookie: cookies } })).json()
const follow = await fetch(`${BASE}/api/follows/${producerUser.users[0].id}`, { method: 'POST', headers: { Cookie: cookies } })
ok(follow.status === 200, `follow works (${follow.status})`)

const following = await (await fetch(`${BASE}/api/feed?mode=following`, { headers: { Cookie: cookies } })).json()
ok(following.beats?.length > 0, `Following feed works (${following.beats?.length} beats)`)

// notifications load
const notif = await (await fetch(`${BASE}/api/notifications`, { headers: { Cookie: cookies } })).json()
ok(Array.isArray(notif.items), 'notifications load')

// PURCHASE blocked: checkout
const checkout = await fetch(`${BASE}/api/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookies },
  body: JSON.stringify({ beatId: beat.id, licenseType: 'NON_EXCLUSIVE' }),
})
const checkoutData = await checkout.json()
ok(checkout.status === 403 && /verify/i.test(checkoutData.error), `checkout blocked with verify message (${checkout.status}: ${checkoutData.error})`)

// PURCHASE blocked: free claim
const free = await fetch(`${BASE}/api/licenses/free`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookies },
  body: JSON.stringify({ beatId: beats.find(b => b.price === 0)?.id ?? beat.id }),
})
ok(free.status === 403, `free claim blocked (${free.status})`)

// PURCHASE blocked: offer creation
const offer = await fetch(`${BASE}/api/offers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookies },
  body: JSON.stringify({ beatId: beat.id, licenseType: 'NON_EXCLUSIVE', amount: 5 }),
})
ok(offer.status === 403, `offer creation blocked (${offer.status})`)

// verified account still can purchase (regression — use artist@test.com)
const artist = await login('artist@test.com')
const offerVerified = await fetch(`${BASE}/api/offers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: artist },
  body: JSON.stringify({ beatId: beat.id, licenseType: 'NON_EXCLUSIVE', amount: 5 }),
})
const offerVerifiedData = await offerVerified.json()
if (offerVerified.ok) {
  await fetch(`${BASE}/api/offers/${offerVerifiedData.offer.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: artist },
  }).catch(() => {})
}
ok(offerVerified.status === 201 || offerVerified.status === 400, `verified users can still offer (${offerVerified.status})`)

console.log(results.join('\n'))
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} checks passed`)
console.log('unverified account for browser checks:', signup.email)
