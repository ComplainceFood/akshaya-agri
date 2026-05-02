import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getNextNumber } from '../../utils/sequence'

const supplierPaymentSchema = z.object({
  supplierId: z.string(),
  paymentDate: z.string(),
  amount: z.number().positive(),
  paymentMode: z.enum(['NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH']),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(z.object({ deliveryId: z.string(), allocatedAmount: z.number().positive() })).optional(),
})

const customerReceiptSchema = z.object({
  customerId: z.string(),
  receiptDate: z.string(),
  amount: z.number().positive(),
  paymentMode: z.enum(['NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH']),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(z.object({ deliveryId: z.string(), allocatedAmount: z.number().positive() })).optional(),
})

const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  // Supplier Payments
  fastify.get('/supplier', async (request) => {
    const { supplierId } = request.query as { supplierId?: string }
    return fastify.prisma.supplierPayment.findMany({
      where: supplierId ? { supplierId } : {},
      include: { supplier: { select: { id: true, name: true } }, allocations: true },
      orderBy: { paymentDate: 'desc' },
    })
  })

  fastify.post('/supplier', async (request) => {
    const data = supplierPaymentSchema.parse(request.body)
    const paymentNumber = await getNextNumber(fastify.prisma, 'SPAY')
    const { allocations, ...paymentData } = data
    return fastify.prisma.supplierPayment.create({
      data: {
        ...paymentData,
        paymentNumber,
        paymentDate: new Date(data.paymentDate),
        allocations: allocations?.length
          ? { create: allocations }
          : undefined,
      },
      include: { supplier: true, allocations: true },
    })
  })

  // Supplier ledger: all deliveries vs payments for a supplier
  fastify.get('/supplier/:supplierId/ledger', async (request) => {
    const { supplierId } = request.params as { supplierId: string }
    const deliveries = await fastify.prisma.delivery.findMany({
      where: { supplierId },
      orderBy: { deliveryDate: 'asc' },
    })
    const payments = await fastify.prisma.supplierPayment.findMany({
      where: { supplierId },
      orderBy: { paymentDate: 'asc' },
    })
    const totalPurchase = deliveries.reduce((s, d) => s + Number(d.purchaseValue), 0)
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
    return { deliveries, payments, totalPurchase, totalPaid, outstanding: totalPurchase - totalPaid }
  })

  // Customer Receipts
  fastify.get('/customer', async (request) => {
    const { customerId } = request.query as { customerId?: string }
    return fastify.prisma.customerReceipt.findMany({
      where: customerId ? { customerId } : {},
      include: { customer: { select: { id: true, name: true } }, allocations: true },
      orderBy: { receiptDate: 'desc' },
    })
  })

  fastify.post('/customer', async (request) => {
    const data = customerReceiptSchema.parse(request.body)
    const receiptNumber = await getNextNumber(fastify.prisma, 'CREC')
    const { allocations, ...receiptData } = data
    return fastify.prisma.customerReceipt.create({
      data: {
        ...receiptData,
        receiptNumber,
        receiptDate: new Date(data.receiptDate),
        allocations: allocations?.length
          ? { create: allocations }
          : undefined,
      },
      include: { customer: true, allocations: true },
    })
  })

  fastify.get('/customer/:customerId/ledger', async (request) => {
    const { customerId } = request.params as { customerId: string }
    const deliveries = await fastify.prisma.delivery.findMany({
      where: { customerId },
      orderBy: { deliveryDate: 'asc' },
    })
    const receipts = await fastify.prisma.customerReceipt.findMany({
      where: { customerId },
      orderBy: { receiptDate: 'asc' },
    })
    const totalSale = deliveries.reduce((s, d) => s + Number(d.saleValue ?? 0), 0)
    const totalReceived = receipts.reduce((s, r) => s + Number(r.amount), 0)
    return { deliveries, receipts, totalSale, totalReceived, outstanding: totalSale - totalReceived }
  })
}

export default paymentRoutes
