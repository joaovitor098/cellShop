import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { swaggerTags } from '@/config/swagger/index.js'
import { TypeOrmOrdersRepository } from '@/database/repositories/typeorm-orders-repository.js'
import { dataSource } from '@/database/typeorm/data-source.js'
import { orderNotFoundSchema, orderStatusParamsSchema, orderStatusResponseSchema } from '@/dtos/order-status.dto.js'

import { GetOrderStatusService } from './get-order-status.service.js'

import type { OrdersRepository } from '@/database/repositories/orders-repository.js'

export function getOrderStatusController(
  app: FastifyInstance,
  repository: OrdersRepository = new TypeOrmOrdersRepository(dataSource),
): void {
  const service = new GetOrderStatusService(repository)

  app.withTypeProvider<ZodTypeProvider>().get(
    '/v1/orders/:idOrder/status',
    {
      schema: {
        tags: [swaggerTags.ORDERS],
        summary: 'Get order status',
        params: orderStatusParamsSchema,
        response: {
          200: orderStatusResponseSchema,
          404: orderNotFoundSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await service.getStatus(request.params.idOrder)

      if (!result) {
        return reply.status(404).send({ message: 'Order not found' })
      }

      return result
    },
  )
}
