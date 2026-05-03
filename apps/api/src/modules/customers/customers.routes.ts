import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const customerSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().min(10).optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  village: z.string().optional(),
  district: z.string().optional(),
  state: z.string().default('Maharashtra'),
  gstNumber: z.string().optional(),
  paymentTerms: z.number().default(30),
})

const customersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/', async () => {
    return fastify.prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
  })

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return fastify.prisma.customer.findUniqueOrThrow({ where: { id } })
  })

  fastify.post('/', async (request) => {
    const data = customerSchema.parse(request.body)
    return fastify.prisma.customer.create({ data })
  })

  fastify.put('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = customerSchema.partial().parse(request.body)
    return fastify.prisma.customer.update({ where: { id }, data })
  })

  fastify.delete('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return fastify.prisma.customer.update({ where: { id }, data: { isActive: false } })
  })
}

export default customersRoutes
