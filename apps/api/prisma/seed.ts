import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminPassword = await bcrypt.hash('Admin@123', 10)
  await prisma.user.upsert({
    where: { email: 'admin@akshayaagri.com' },
    update: {},
    create: {
      name: 'Administrator',
      email: 'admin@akshayaagri.com',
      password: adminPassword,
      role: Role.ADMIN,
    },
  })

  await prisma.commodity.upsert({
    where: { id: 'corn-001' },
    update: {},
    create: {
      id: 'corn-001',
      name: 'Maize (Corn)',
      description: 'Yellow Maize / Corn',
    },
  })

  console.log('Seed complete. Admin login: admin@akshayaagri.com / Admin@123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
