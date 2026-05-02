import { PrismaClient } from '@prisma/client'

export async function getNextNumber(prisma: PrismaClient, prefix: string): Promise<string> {
  const now = new Date()
  const month = now.getMonth()
  const calYear = now.getFullYear()
  // Indian financial year: April (month 3) starts new FY
  const fyStart = month >= 3 ? calYear : calYear - 1
  const year = `${String(fyStart).slice(-2)}${String(fyStart + 1).slice(-2)}`
  const id = `${prefix}-${year}`

  const seq = await prisma.sequence.upsert({
    where: { id },
    update: { count: { increment: 1 } },
    create: { id, prefix, year, count: 1 },
  })

  return `${prefix}-${year}-${String(seq.count).padStart(4, '0')}`
}
