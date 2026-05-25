import type { Logger } from '@/config/logger/logger.js'
import type { IdempotencyStore } from '@/database/idempotency/idempotency-store.js'
import type { OrdersRepository } from '@/database/repositories/orders-repository.js'
import type { StocksRepository } from '@/database/repositories/stocks-repository.js'
import type { CheckoutMessage } from '@/messaging/checkout-queue.js'

export interface WorkerDeps {
  stocks: StocksRepository
  orders: OrdersRepository
  idempotency: IdempotencyStore
  logger: Logger
}

export async function processCheckoutMessage(message: CheckoutMessage, deps: WorkerDeps): Promise<void> {
  const logger = deps.logger.child({
    correlationId: message.correlationId,
    idempotencyKey: message.idempotencyKey,
    orderId: message.orderId,
    productId: message.productId,
  })

  const record = await deps.idempotency.get(message.idempotencyKey)

  if (record?.status === 'PROCESSED') {
    logger.info('already processed, skipping')

    return
  }

  if (record) {
    await deps.idempotency.setStatus(message.idempotencyKey, 'PROCESSING')
  } else {
    await deps.idempotency.create(message.idempotencyKey, { status: 'PROCESSING', orderId: message.orderId })
  }

  logger.info('processing checkout (simulating successful request)')

  const committed = await deps.stocks.commitReservation(message.productId, message.reservedQuantity)

  if (!committed) {
    logger.error('stock commit failed')

    return
  }

  logger.info('stock committed', { stock: message.stockAvailability })

  await deps.orders.updateStatus(message.orderId, 'PROCESSED')

  logger.info('order marked processed')

  await deps.idempotency.setStatus(message.idempotencyKey, 'PROCESSED')

  logger.info('checkout processed')
}
