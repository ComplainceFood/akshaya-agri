import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getNextNumber } from '../../utils/sequence'

const soSchema = z.object({
  customerId: z.string(),
  commodityId: z.string(),
  orderDate: z.string(),
  quantityOrdered: z.number().positive(),
  ratePerQuintal: z.number().positive(),
  notes: z.string().optional(),
})

const salesOrderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/', async (request) => {
    const { customerId, status } = request.query as { customerId?: string; status?: string }
    return fastify.prisma.salesOrder.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { customer: true, commodity: true },
      orderBy: { orderDate: 'desc' },
    })
  })

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return fastify.prisma.salesOrder.findUniqueOrThrow({
      where: { id },
      include: { customer: true, commodity: true, deliveries: true },
    })
  })

  fastify.post('/', async (request) => {
    const data = soSchema.parse(request.body)
    const soNumber = await getNextNumber(fastify.prisma, 'SO')
    return fastify.prisma.salesOrder.create({
      data: {
        ...data,
        soNumber,
        orderDate: new Date(data.orderDate),
        status: 'CONFIRMED',
      },
      include: { customer: true, commodity: true },
    })
  })

  fastify.put('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = soSchema.partial().parse(request.body)
    return fastify.prisma.salesOrder.update({
      where: { id },
      data: { ...data, ...(data.orderDate ? { orderDate: new Date(data.orderDate) } : {}) },
      include: { customer: true, commodity: true },
    })
  })

  fastify.patch('/:id/status', async (request) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    return fastify.prisma.salesOrder.update({ where: { id }, data: { status: status as any } })
  })
}

export default salesOrderRoutes
