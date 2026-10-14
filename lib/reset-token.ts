import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

const RESET_TTL_MS = 60 * 60 * 1000

export function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueResetToken(email: string) {
  const token = randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: {
      resetTokenHash: hashResetToken(token),
      resetTokenExpiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
    select: { id: true },
  })
  return token
}

export async function consumeResetToken(token: string) {
  const user = await prisma.user.findFirst({
    where: {
      resetTokenHash: hashResetToken(token),
      resetTokenExpiresAt: { gt: new Date() },
    },
    select: { id: true },
  })
  return user?.id ?? null
}

export async function clearResetToken(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { resetTokenHash: null, resetTokenExpiresAt: null },
    select: { id: true },
  })
}
