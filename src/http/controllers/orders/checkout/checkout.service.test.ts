import { CheckoutService } from './checkout.service.js'

import type { RunInTransaction } from './checkout.service.js'
import type { StocksRepository } from '@/database/repositories/stocks-repository.js'
import type { OrdersRepository } from '@/database/repositories/orders-repository.js'
import type { IdempotencyStore } from '@/database/idempotency/idempotency-store.js'
import type { CheckoutPublisher } from '@/messaging/checkout-queue.js'
import type { Logger } from '@/config/logger/logger.js'

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, child: () => logger } as unknown as Logger

function deps(overrides: Partial<{ reserved: boolean; existing: unknown }> = {}) {
  const published: unknown[] = []
  const stocks = {
    reserve: async () => overrides.reserved ?? true,
    commitReservation: async () => true,
    findAvailability: async () => 48,
  } as unknown as StocksRepository
  const orders = {
    create: async () => ({ id: 'o1', status: 'PENDING', user: 'r1' }),
    findById: async () => null,
    updateStatus: async () => undefined,
  } as unknown as OrdersRepository
  const idempotency = {
    get: async () => overrides.existing ?? null,
    create: async () => undefined,
    setStatus: async () => undefined,
  } as unknown as IdempotencyStore
  const publisher = { publish: (m: unknown) => published.push(m) } as unknown as CheckoutPublisher
  const runInTransaction = (async <T>(fn: (m: unknown) => Promise<T>) => fn({})) as unknown as RunInTransaction

  return { stocks, orders, idempotency, publisher, published, runInTransaction }
}

describe('CheckoutService', () => {
  it('reserves, creates order and publishes when stock is available', async () => {
    const d = deps({ reserved: true })
    const service = new CheckoutService(d.stocks, d.orders, d.idempotency, d.publisher, d.runInTransaction)

    const result = await service.checkout({ idempotencyKey: 'k1', productId: 'p1', quantity: 2, correlationId: 'r1' }, logger)

    expect(result).toEqual({ orderId: 'o1', conflict: false })
    expect(d.published).toHaveLength(1)
  })

  it('returns conflict when reservation fails', async () => {
    const d = deps({ reserved: false })
    const service = new CheckoutService(d.stocks, d.orders, d.idempotency, d.publisher, d.runInTransaction)

    const result = await service.checkout({ idempotencyKey: 'k1', productId: 'p1', quantity: 2, correlationId: 'r1' }, logger)

    expect(result.conflict).toBe(true)
    expect(d.published).toHaveLength(0)
  })

  it('is idempotent: returns existing orderId without reserving', async () => {
    const d = deps({ existing: { status: 'PENDING', orderId: 'existing' } })
    const service = new CheckoutService(d.stocks, d.orders, d.idempotency, d.publisher, d.runInTransaction)

    const result = await service.checkout({ idempotencyKey: 'k1', productId: 'p1', quantity: 2, correlationId: 'r1' }, logger)

    expect(result).toEqual({ orderId: 'existing', conflict: false })
    expect(d.published).toHaveLength(0)
  })
})
