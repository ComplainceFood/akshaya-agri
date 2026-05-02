import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getNextNumber } from '../../utils/sequence'

const deliverySchema = z.object({
  deliveryDate: z.string(),
  purchaseOrderId: z.string(),
  salesOrderId: z.string().optional(),
  supplierId: z.string(),
  customerId: z.string().optional(),
  vehicleNumber: z.string().min(1),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  lrNumber: z.string().optional(),
  grossWeight: z.number().positive(),
  tareWeight: z.number().positive(),
  moisturePct: z.number().min(0).max(100).optional(),
  foreignMatterPct: z.number().min(0).max(100).optional(),
  qualityDeductionPct: z.number().min(0).max(100).default(0),
  purchaseRate: z.number().positive(),
  saleRate: z.number().positive().optional(),
  notes: z.string().optional(),
})

function calcDelivery(data: {
  grossWeight: number
  tareWeight: number
  qualityDeductionPct: number
  purchaseRate: number
  saleRate?: number
}) {
  const netWeight = data.grossWeight - data.tareWeight
  const adjustedWeight = netWeight * (1 - data.qualityDeductionPct / 100)
  const purchaseValue = adjustedWeight * data.purchaseRate
  const saleValue = data.saleRate ? adjustedWeight * data.saleRate : null
  const grossMargin = saleValue !== null ? saleValue - purchaseValue : null
  return { netWeight, adjustedWeight, purchaseValue, saleValue, grossMargin }
}

const deliveryRoutes: FastifyPluginAsync = async (fastify) => {
  const adminOnly = fastify.requireRole('ADMIN')
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/', async (request) => {
    const { supplierId, customerId, from, to, status } = request.query as Record<string, string>
    return fastify.prisma.delivery.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(customerId ? { customerId } : {}),
        ...(status ? { status: status as any } : {}),
        ...(from || to
          ? {
              deliveryDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
        salesOrder: { select: { id: true, soNumber: true } },
      },
      orderBy: { deliveryDate: 'desc' },
    })
  })

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return fastify.prisma.delivery.findUniqueOrThrow({
      where: { id },
      include: {
        supplier: true,
        customer: true,
        purchaseOrder: true,
        salesOrder: true,
        supplierPaymentAllocations: { include: { payment: true } },
        customerReceiptAllocations: { include: { receipt: true } },
      },
    })
  })

  fastify.post('/', async (request) => {
    const data = deliverySchema.parse(request.body)
    const deliveryNumber = await getNextNumber(fastify.prisma, 'LR')
    const calc = calcDelivery(data)
    return fastify.prisma.delivery.create({
      data: {
        ...data,
        deliveryNumber,
        deliveryDate: new Date(data.deliveryDate),
        ...calc,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
      },
    })
  })

  fastify.put('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = deliverySchema.partial().parse(request.body)
    const existing = await fastify.prisma.delivery.findUniqueOrThrow({ where: { id } })
    const merged = { ...existing, ...data }
    const calc = calcDelivery({
      grossWeight: Number(merged.grossWeight),
      tareWeight: Number(merged.tareWeight),
      qualityDeductionPct: Number(merged.qualityDeductionPct),
      purchaseRate: Number(merged.purchaseRate),
      saleRate: merged.saleRate ? Number(merged.saleRate) : undefined,
    })
    return fastify.prisma.delivery.update({
      where: { id },
      data: { ...data, ...(data.deliveryDate ? { deliveryDate: new Date(data.deliveryDate) } : {}), ...calc },
      include: { supplier: true, customer: true, purchaseOrder: true },
    })
  })

  fastify.patch('/:id/status', async (request) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    return fastify.prisma.delivery.update({ where: { id }, data: { status: status as any } })
  })

  fastify.delete('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const delivery = await fastify.prisma.delivery.findUniqueOrThrow({
      where: { id },
      include: { supplierPaymentAllocations: true, customerReceiptAllocations: true },
    })
    if (delivery.supplierPaymentAllocations.length > 0 || delivery.customerReceiptAllocations.length > 0) {
      return reply.status(400).send({ error: 'Cannot delete a delivery that has payment allocations' })
    }
    await fastify.prisma.delivery.delete({ where: { id } })
    return { success: true }
  })

  fastify.get('/supplier/:supplierId/outstanding', async (request) => {
    const { supplierId } = request.params as { supplierId: string }
    const deliveries = await fastify.prisma.delivery.findMany({
      where: { supplierId },
      include: { supplierPaymentAllocations: true },
    })
    return deliveries.map((d) => {
      const paid = d.supplierPaymentAllocations.reduce((s, a) => s + Number(a.allocatedAmount), 0)
      const outstanding = Number(d.purchaseValue) - paid
      return { ...d, paidAmount: paid, outstandingAmount: outstanding }
    })
  })
}

export default deliveryRoutes
