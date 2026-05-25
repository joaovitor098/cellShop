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
    const existing = await this.idempotency.get(input.idempotencyKey)

    if (existing) {
      logger.info('idempotency hit, returning existing order', { orderId: existing.orderId })

      return { orderId: existing.orderId, conflict: false }
    }

    const message = await this.runInTransaction(async manager => {
      const reserved = await this.stocks.reserve(input.productId, input.quantity, manager)

      if (!reserved) {
        logger.warn('stock reservation failed')

        return null
      }

      logger.info('stock reserved', { quantity: input.quantity })

      const order = await this.orders.create(input.correlationId, manager)

      logger.info('order created', { orderId: order.id })

      const availability = await this.stocks.findAvailability(input.productId, manager)

      const payload: CheckoutMessage = {
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        productId: input.productId,
        reservedQuantity: input.quantity,
        stockAvailability: availability ?? 0,
        orderId: order.id,
      }

      return payload
    })

    if (!message) {
      return { orderId: '', conflict: true }
    }

    await this.idempotency.create(input.idempotencyKey, { status: 'PENDING', orderId: message.orderId })
    this.publisher.publish(message)

    logger.info('checkout message published', { orderId: message.orderId })

    return { orderId: message.orderId, conflict: false }
  }
}
