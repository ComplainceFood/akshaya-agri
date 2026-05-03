import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const supplierSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().min(10).optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  village: z.string().optional(),
  district: z.string().optional(),
  state: z.string().default('Maharashtra'),
  bankAccount: z.string().optional(),
  bankIfsc: z.string().optional(),
  bankName: z.string().optional(),
  panNumber: z.string().optional(),
})

const suppliersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/', async (request) => {
    const { search } = request.query as { search?: string }
    return fastify.prisma.supplier.findMany({
      where: {
        isActive: true,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    })
  })

  fastify.get('/all', async () => {
    return fastify.prisma.supplier.findMany({ orderBy: { name: 'asc' } })
  })

  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return fastify.prisma.supplier.findUniqueOrThrow({ where: { id } })
  })

  fastify.post('/', async (request) => {
    const data = supplierSchema.parse(request.body)
    return fastify.prisma.supplier.create({ data })
  })

  fastify.put('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const data = supplierSchema.partial().parse(request.body)
    return fastify.prisma.supplier.update({ where: { id }, data })
  })

  fastify.delete('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return fastify.prisma.supplier.update({ where: { id }, data: { isActive: false } })
  })
}

export default suppliersRoutes
