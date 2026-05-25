import { randomUUID } from 'node:crypto'

import type { EntityManager } from 'typeorm'

import type { Logger } from '@/config/logger/logger.js'
import type { IdempotencyStore } from '@/database/idempotency/idempotency-store.js'
import type { OrdersRepository } from '@/database/repositories/orders-repository.js'
import type { StocksRepository } from '@/database/repositories/stocks-repository.js'
import type { CheckoutMessage, CheckoutPublisher } from '@/messaging/checkout-queue.js'

export interface CheckoutInput {
  idempotencyKey: string
  productId: string
  quantity: number
  correlationId: string
}

export interface CheckoutResult {
  orderId: string
  conflict: boolean
}

export type RunInTransaction = <T>(fn: (manager: EntityManager) => Promise<T>) => Promise<T>

export class CheckoutService {
  constructor(
    private readonly stocks: StocksRepository,
    private readonly orders: OrdersRepository,
    private readonly idempotency: IdempotencyStore,
    private readonly publisher: CheckoutPublisher,
    private readonly runInTransaction: RunInTransaction,
  ) {}

  async checkout(input: CheckoutInput, logger: Logger): Promise<CheckoutResult> {
    const orderId = randomUUID()
    const created = await this.idempotency.create(input.idempotencyKey, { status: 'PENDING', orderId })

    if (!created) {
      const existing = await this.idempotency.get(input.idempotencyKey)

      logger.info('idempotency hit, returning existing order', { orderId: existing?.orderId ?? orderId })

      return { orderId: existing?.orderId ?? orderId, conflict: false }
    }

    const availability = await this.runInTransaction(async manager => {
      const reserved = await this.stocks.reserve(input.productId, input.quantity, manager)

      if (!reserved) {
        logger.warn('stock reservation failed')

        return null
      }

      logger.info('stock reserved', { quantity: input.quantity })

      await this.orders.create(orderId, input.correlationId, manager)

      logger.info('order created', { orderId })

      return this.stocks.findAvailability(input.productId, manager)
    })

    if (availability === null) {
      await this.idempotency.delete(input.idempotencyKey)

      return { orderId: '', conflict: true }
    }

    const message: CheckoutMessage = {
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      productId: input.productId,
      reservedQuantity: input.quantity,
      stockAvailability: availability ?? 0,
      orderId,
    }

    this.publisher.publish(message)

    logger.info('checkout message published', { orderId })

    return { orderId, conflict: false }
  }
}
