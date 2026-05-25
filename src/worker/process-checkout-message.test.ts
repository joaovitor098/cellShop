import { processCheckoutMessage } from './process-checkout-message.js'

import type { CheckoutMessage } from '@/messaging/checkout-queue.js'

function deps(existingStatus?: string) {
  const events: string[] = []
  const stocks = { commitReservation: async () => (events.push('commit'), true) } as any
  const orders = { updateStatus: async () => events.push('order:PROCESSED') } as any
  const idempotency = {
    get: async () => (existingStatus ? { status: existingStatus, orderId: 'o1' } : null),
    create: async () => events.push('create:PROCESSING'),
    setStatus: async (_k: string, s: string) => events.push(`idem:${s}`),
  } as any
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, child: () => logger } as any

  return { stocks, orders, idempotency, logger, events }
}

const message: CheckoutMessage = {
  correlationId: 'r1', idempotencyKey: 'k1', productId: 'p1', reservedQuantity: 2, stockAvailability: 3, orderId: 'o1',
}

describe('processCheckoutMessage', () => {
  it('skips when already PROCESSED', async () => {
    const d = deps('PROCESSED')
    await processCheckoutMessage(message, d)

    expect(d.events).toEqual([])
  })

  it('processes a new message: create PROCESSING -> commit -> order PROCESSED -> idempotency PROCESSED', async () => {
    const d = deps(undefined)
    await processCheckoutMessage(message, d)

    expect(d.events).toEqual(['create:PROCESSING', 'commit', 'order:PROCESSED', 'idem:PROCESSED'])
  })
})
