import { TypeOrmOrdersRepository } from './typeorm-orders-repository.js'

import type { DataSource } from 'typeorm'

describe('TypeOrmOrdersRepository.findById', () => {
  it('calls findOneBy with the id and returns the order', async () => {
    let receivedWhere: unknown
    const order = { id: 'o1', status: 'PENDING', user: 'john' }
    const dataSource = {
      getRepository: () => ({
        findOneBy: async (where: unknown) => {
          receivedWhere = where

          return order
        },
      }),
    } as unknown as DataSource

    const result = await new TypeOrmOrdersRepository(dataSource).findById('o1')

    expect(receivedWhere).toEqual({ id: 'o1' })
    expect(result).toBe(order)
  })

  it('returns null when not found', async () => {
    const dataSource = {
      getRepository: () => ({ findOneBy: async () => null }),
    } as unknown as DataSource

    const result = await new TypeOrmOrdersRepository(dataSource).findById('missing')

    expect(result).toBeNull()
  })
})
