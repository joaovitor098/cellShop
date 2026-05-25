import { GetOrderStatusService } from './get-order-status.service.js'

import type { OrdersRepository } from '@/database/repositories/orders-repository.js'

describe('GetOrderStatusService', () => {
  it('returns id + status when the order exists', async () => {
    const repository: OrdersRepository = {
      findById: async () => ({ id: 'o1', status: 'PROCESSED', user: 'john' }),
      create: async () => ({ id: 'o1', status: 'PENDING', user: 'john' }),
      updateStatus: async () => {},
    }

    const result = await new GetOrderStatusService(repository).getStatus('o1')

    expect(result).toEqual({ id: 'o1', status: 'PROCESSED' })
  })

  it('returns null when the order does not exist', async () => {
    const repository: OrdersRepository = {
      findById: async () => null,
      create: async () => ({ id: 'o1', status: 'PENDING', user: 'missing' }),
      updateStatus: async () => {},
    }

    const result = await new GetOrderStatusService(repository).getStatus('missing')

    expect(result).toBeNull()
  })
})
