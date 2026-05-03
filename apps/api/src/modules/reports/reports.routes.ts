import { FastifyPluginAsync } from 'fastify'

const reportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/dashboard', async () => {
    const now = new Date()
    const today = new Date(now); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [todayDeliveries, monthDeliveries, openPOs, openSOs, recentDeliveries, allDeliveries] = await Promise.all([
      fastify.prisma.delivery.findMany({ where: { deliveryDate: { gte: today, lt: tomorrow } } }),
      fastify.prisma.delivery.findMany({ where: { deliveryDate: { gte: monthStart, lt: tomorrow } } }),
      fastify.prisma.purchaseOrder.count({ where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } }),
      fastify.prisma.salesOrder.count({ where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } }),
      fastify.prisma.delivery.findMany({
        take: 10,
        orderBy: { deliveryDate: 'desc' },
        include: { supplier: { select: { name: true } } },
      }),
      fastify.prisma.delivery.findMany({
        include: {
          supplier: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          supplierPaymentAllocations: true,
          customerReceiptAllocations: true,
        },
      }),
    ])

    const sum = (arr: any[], key: string) => arr.reduce((s, d) => s + Number(d[key] ?? 0), 0)

    // Today stats
    const todayPurchaseValue = sum(todayDeliveries, 'purchaseValue')
    const todaySaleValue = sum(todayDeliveries, 'saleValue')

    // Month stats
    const monthPurchaseValue = sum(monthDeliveries, 'purchaseValue')
    const monthSaleValue = sum(monthDeliveries, 'saleValue')

    // Outstanding per supplier
    const supplierMap = new Map<string, { supplierId: string; name: string; totalPurchase: number; outstanding: number }>()
    const customerMap = new Map<string, { customerId: string; name: string; totalSale: number; outstanding: number }>()

    let totalPayable = 0
    let totalReceivable = 0

    for (const d of allDeliveries) {
      if (d.supplier) {
        const paid = d.supplierPaymentAllocations.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0)
        const owed = Math.max(0, Number(d.purchaseValue) - paid)
        totalPayable += owed
        const entry = supplierMap.get(d.supplier.id) ?? { supplierId: d.supplier.id, name: d.supplier.name, totalPurchase: 0, outstanding: 0 }
        entry.totalPurchase += Number(d.purchaseValue)
        entry.outstanding += owed
        supplierMap.set(d.supplier.id, entry)
      }
      if (d.customer && d.saleValue) {
        const received = d.customerReceiptAllocations.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0)
        const owed = Math.max(0, Number(d.saleValue) - received)
        totalReceivable += owed
        const entry = customerMap.get(d.customer.id) ?? { customerId: d.customer.id, name: d.customer.name, totalSale: 0, outstanding: 0 }
        entry.totalSale += Number(d.saleValue)
        entry.outstanding += owed
        customerMap.set(d.customer.id, entry)
      }
    }

    const topSupplierPayables = [...supplierMap.values()]
      .filter(s => s.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5)

    const topCustomerReceivables = [...customerMap.values()]
      .filter(c => c.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5)

    return {
      today: {
        deliveryCount: todayDeliveries.length,
        totalWeightQt: sum(todayDeliveries, 'adjustedWeight'),
        purchaseValue: todayPurchaseValue,
        saleValue: todaySaleValue,
        margin: todaySaleValue - todayPurchaseValue,
      },
      thisMonth: {
        deliveryCount: monthDeliveries.length,
        totalWeightQt: sum(monthDeliveries, 'adjustedWeight'),
        purchaseValue: monthPurchaseValue,
        saleValue: monthSaleValue,
        margin: monthSaleValue - monthPurchaseValue,
      },
      openPOs,
      openSOs,
      totalPayable,
      totalReceivable,
      recentDeliveries,
      topSupplierPayables,
      topCustomerReceivables,
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
