import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'OPERATIONS', 'ACCOUNTS']).default('OPERATIONS'),
})

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'OPERATIONS', 'ACCOUNTS']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
})

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireRole('ADMIN'))

  fastify.get('/', async () => {
    return fastify.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { name: 'asc' },
    })
  })

  fastify.post('/', async (request, reply) => {
    const data = createUserSchema.parse(request.body)
    const existing = await fastify.prisma.user.findUnique({ where: { email: data.email } })
    if (existing) return reply.status(400).send({ error: 'Email already in use' })
    const hashed = await bcrypt.hash(data.password, 10)
    const user = await fastify.prisma.user.create({
      data: { ...data, password: hashed },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
    return user
  })

  fastify.put('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = updateUserSchema.parse(request.body)
    if (data.password) {
      (data as any).password = await bcrypt.hash(data.password, 10)
    }
    return fastify.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
  })

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await fastify.prisma.user.findUniqueOrThrow({ where: { id } })
    if (user.email === 'admin@akshayaagri.com') {
      return reply.status(400).send({ error: 'Cannot delete the primary admin account' })
    }
    await fastify.prisma.user.update({ where: { id }, data: { isActive: false } })
    return { success: true }
  })
}

export default usersRoutes
