import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const user = await fastify.prisma.user.findUnique({ where: { email: body.email } })
    if (!user || !user.isActive) return reply.status(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.password, user.password)
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' })

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      { expiresIn: '8h' }
    )
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
  })

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request) => {
    return request.user
  })
}

export default authRoutes
