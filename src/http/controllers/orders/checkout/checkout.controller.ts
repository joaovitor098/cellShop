import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { env } from '@/config/env/index.js'
import { Logger } from '@/config/logger/logger.js'
import { redisClient } from '@/config/redis/index.js'
import { swaggerTags } from '@/config/swagger/index.js'
import { RedisIdempotencyStore } from '@/database/idempotency/redis-idempotency-store.js'
import { TypeOrmOrdersRepository } from '@/database/repositories/typeorm-orders-repository.js'
import { TypeOrmStocksRepository } from '@/database/repositories/typeorm-stocks-repository.js'
import { dataSource } from '@/database/typeorm/data-source.js'

import { checkoutBodySchema, checkoutConflictSchema, checkoutHeadersSchema, checkoutResponseSchema } from './checkout.dto.js'
import { CheckoutService } from './checkout.service.js'

import type { CheckoutPublisher } from '@/messaging/checkout-queue.js'

export function registerCheckoutController(app: FastifyInstance, publisher: CheckoutPublisher): void {
  const service = new CheckoutService(
    new TypeOrmStocksRepository(dataSource),
    new TypeOrmOrdersRepository(dataSource),
    new RedisIdempotencyStore(redisClient, env.IDEMPOTENCY_TTL_MS),
    publisher,
    fn => dataSource.transaction(fn),
  )

  app.withTypeProvider<ZodTypeProvider>().post(
    '/v1/orders/checkout',
    {
      schema: {
        tags: [swaggerTags.ORDERS],
        summary: 'Async checkout',
        headers: checkoutHeadersSchema,
        body: checkoutBodySchema,
        response: {
          202: checkoutResponseSchema,
          409: checkoutConflictSchema,
        },
      },
    },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'] as string
      const { productId, quantity } = request.body
      const logger = Logger.fromRequest(request, { idempotencyKey, productId })

      logger.info('checkout received', { quantity })

      const result = await service.checkout({ idempotencyKey, productId, quantity, correlationId: request.id }, logger)

      if (result.conflict) {
        logger.warn('checkout insufficient stock')

        return reply.status(409).send({ message: 'Insufficient stock' })
      }

      logger.child({ orderId: result.orderId }).info('checkout accepted')

      return reply.status(202).send({ orderId: result.orderId })
    },
  )
}
