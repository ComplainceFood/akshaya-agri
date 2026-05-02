import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import prismaPlugin from './plugins/prisma'
import authPlugin from './plugins/auth'

import authRoutes from './modules/auth/auth.routes'
import userRoutes from './modules/users/users.routes'
import supplierRoutes from './modules/suppliers/suppliers.routes'
import customerRoutes from './modules/customers/customers.routes'
import commodityRoutes from './modules/commodities/commodities.routes'
import purchaseOrderRoutes from './modules/purchase-orders/purchase-orders.routes'
import salesOrderRoutes from './modules/sales-orders/sales-orders.routes'
import deliveryRoutes from './modules/deliveries/deliveries.routes'
import paymentRoutes from './modules/payments/payments.routes'
import reportRoutes from './modules/reports/reports.routes'

const app = Fastify({ logger: true })

async function main() {
  await app.register(cors, { origin: true })
  await app.register(rateLimit, { global: false })
  await app.register(jwt, { secret: process.env.JWT_SECRET || 'changeme-secret-32chars-minimum!!' })
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
  await app.register(prismaPlugin)
  await app.register(authPlugin)

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(userRoutes, { prefix: '/api/users' })
  await app.register(supplierRoutes, { prefix: '/api/suppliers' })
  await app.register(customerRoutes, { prefix: '/api/customers' })
  await app.register(commodityRoutes, { prefix: '/api/commodities' })
  await app.register(purchaseOrderRoutes, { prefix: '/api/purchase-orders' })
  await app.register(salesOrderRoutes, { prefix: '/api/sales-orders' })
  await app.register(deliveryRoutes, { prefix: '/api/deliveries' })
  await app.register(paymentRoutes, { prefix: '/api/payments' })
  await app.register(reportRoutes, { prefix: '/api/reports' })

  app.get('/api/health', async () => ({ status: 'ok', app: 'Akshaya Agri Solutions' }))

  const port = Number(process.env.PORT) || 3001
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`API running on http://localhost:${port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
