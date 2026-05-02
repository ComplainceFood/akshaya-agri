import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getNextNumber } from '../../utils/sequence'

const poSchema = z.object({
  supplierId: z.string(),
  commodityId: z.string(),
  orderDate: z.string(),
  quantityOrdered: z.number().positive(),
  ratePerQuintal: z.number().positive(),
  moistureLimit: z.number().optional(),
  foreignMatterLimit: z.number().optional(),
  notes: z.string().optional(),
})

const purchaseOrderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/', async (request) => {
    const { supplierId, status } = request.query as { supplierId?: string; status?: string }
    return fastify.prisma.purchaseOrder.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { supplier: true, commodity: true },
      orderBy: { orderDate: 'desc' },
    })
  })

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return fastify.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: {
        supplier: true,
        commodity: true,
        deliveries: { orderBy: { deliveryDate: 'desc' } },
      },
    })
  })

  fastify.post('/', async (request) => {
    const data = poSchema.parse(request.body)
    const poNumber = await getNextNumber(fastify.prisma, 'PO')
    return fastify.prisma.purchaseOrder.create({
      data: {
        ...data,
        poNumber,
        orderDate: new Date(data.orderDate),
        status: 'CONFIRMED',
      },
      include: { supplier: true, commodity: true },
    })
  })

  fastify.put('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = poSchema.partial().parse(request.body)
    return fastify.prisma.purchaseOrder.update({
      where: { id },
      data: { ...data, ...(data.orderDate ? { orderDate: new Date(data.orderDate) } : {}) },
      include: { supplier: true, commodity: true },
    })
  })

  fastify.patch('/:id/status', async (request) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    return fastify.prisma.purchaseOrder.update({
      where: { id },
      data: { status: status as any },
    })
  })
}

export default purchaseOrderRoutes
