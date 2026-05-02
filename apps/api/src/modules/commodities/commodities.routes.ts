import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const commoditySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

const commoditiesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/', async () => {
    return fastify.prisma.commodity.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
  })

  fastify.post('/', async (request) => {
    const data = commoditySchema.parse(request.body)
    return fastify.prisma.commodity.create({ data })
  })

  fastify.put('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = commoditySchema.partial().parse(request.body)
    return fastify.prisma.commodity.update({ where: { id }, data })
  })
}

export default commoditiesRoutes
