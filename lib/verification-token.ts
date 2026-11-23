import { createHash, randomBytes } from 'crypto'
import { prisma } from './prisma.ts'

/**
 * Single-use verification tokens for EMAIL_VERIFY / EMAIL_CHANGE /
 * PHONE_VERIFY, hashed with SHA-256 like lib/reset-token.ts.
 */

export type VerificationKind = 'EMAIL_VERIFY' | 'EMAIL_CHANGE' | 'PHONE_VERIFY'

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueVerificationToken(
  userId: string,
  kind: VerificationKind,
  target: string,
  ttlMs: number
): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await prisma.verificationToken.create({
    data: {
      userId,
      kind,
      tokenHash: hashVerificationToken(token),
      target,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  })
  return token
}

/** Marks a matching unused token used; returns its target or null. */
export async function consumeVerificationToken(
  token: string,
  kind: VerificationKind
): Promise<{ userId: string; target: string } | null> {
  const row = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashVerificationToken(token) },
    select: { id: true, userId: true, target: true, kind: true, expiresAt: true, usedAt: true },
  })
  if (!row || row.kind !== kind || row.usedAt || row.expiresAt < new Date()) return null
  await prisma.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
  return { userId: row.userId, target: row.target }
}

export async function countRecentVerifications(
  userId: string,
  kind: VerificationKind,
  windowMs: number
): Promise<number> {
  return prisma.verificationToken.count({
    where: { userId, kind, createdAt: { gte: new Date(Date.now() - windowMs) } },
  })
}
