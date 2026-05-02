import { FastifyPluginAsync } from 'fastify'

const reportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/dashboard', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const [todayDeliveries, openPOs, openSOs, recentDeliveries] = await Promise.all([
      fastify.prisma.delivery.findMany({ where: { deliveryDate: { gte: today, lt: tomorrow } } }),
      fastify.prisma.purchaseOrder.count({ where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } }),
      fastify.prisma.salesOrder.count({ where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } }),
      fastify.prisma.delivery.findMany({
        take: 10,
        orderBy: { deliveryDate: 'desc' },
        include: {
          supplier: { select: { name: true } },
          customer: { select: { name: true } },
        },
      }),
    ])

    const todayWeight = todayDeliveries.reduce((s, d) => s + Number(d.adjustedWeight), 0)
    const todayPurchaseValue = todayDeliveries.reduce((s, d) => s + Number(d.purchaseValue), 0)
    const todaySaleValue = todayDeliveries.reduce((s, d) => s + Number(d.saleValue ?? 0), 0)
    const todayMargin = todaySaleValue - todayPurchaseValue

    // Supplier outstanding
    const allDeliveries = await fastify.prisma.delivery.findMany({
      include: { supplierPaymentAllocations: true },
    })
    const totalPayable = allDeliveries.reduce((s, d) => {
      const paid = d.supplierPaymentAllocations.reduce((ps, a) => ps + Number(a.allocatedAmount), 0)
      return s + Math.max(0, Number(d.purchaseValue) - paid)
    }, 0)

    // Customer outstanding
    const allDeliveriesWithReceipts = await fastify.prisma.delivery.findMany({
      include: { customerReceiptAllocations: true },
    })
    const totalReceivable = allDeliveriesWithReceipts.reduce((s, d) => {
      const received = d.customerReceiptAllocations.reduce((rs, a) => rs + Number(a.allocatedAmount), 0)
      return s + Math.max(0, Number(d.saleValue ?? 0) - received)
    }, 0)

    return {
      today: {
        deliveryCount: todayDeliveries.length,
        totalWeightQt: todayWeight,
        purchaseValue: todayPurchaseValue,
        saleValue: todaySaleValue,
        margin: todayMargin,
      },
      openPOs,
      openSOs,
      totalPayable,
      totalReceivable,
      recentDeliveries,
    }
  })

  fastify.get('/pnl', async (request) => {
    const { from, to } = request.query as { from?: string; to?: string }
    const deliveries = await fastify.prisma.delivery.findMany({
      where: {
        ...(from || to
          ? {
              deliveryDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: { supplier: { select: { name: true } }, commodity: { select: { name: true } } },
      orderBy: { deliveryDate: 'asc' },
    })

    const totalPurchase = deliveries.reduce((s, d) => s + Number(d.purchaseValue), 0)
    const totalSale = deliveries.reduce((s, d) => s + Number(d.saleValue ?? 0), 0)
    const totalMargin = deliveries.reduce((s, d) => s + Number(d.grossMargin ?? 0), 0)
    const totalWeight = deliveries.reduce((s, d) => s + Number(d.adjustedWeight), 0)

    return { deliveries, totalPurchase, totalSale, totalMargin, totalWeight }
  })

  fastify.get('/stock', async () => {
    const pos = await fastify.prisma.purchaseOrder.findMany({
      where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } },
      include: { supplier: { select: { name: true } }, commodity: { select: { name: true } }, deliveries: true },
    })
    return pos.map((po) => {
      const delivered = po.deliveries.reduce((s, d) => s + Number(d.adjustedWeight), 0)
      const pending = Number(po.quantityOrdered) - delivered
      return { ...po, deliveredQt: delivered, pendingQt: pending }
    })
  })
}

export default reportRoutes
