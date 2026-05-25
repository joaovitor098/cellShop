import { TypeOrmOrdersRepository } from './typeorm-orders-repository.js'

import type { DataSource, EntityManager } from 'typeorm'

describe('TypeOrmOrdersRepository.create', () => {
  it('saves a PENDING order with the given user', async () => {
    const repo = {
      create: (data: unknown) => data,
      save: async (o: unknown) => ({ ...(o as object), id: 'o1' }),
    }
    const manager = { getRepository: () => repo } as unknown as EntityManager
    const dataSource = { manager } as unknown as DataSource

    const result = await new TypeOrmOrdersRepository(dataSource).create('r1', manager)

    expect(result).toEqual({ id: 'o1', status: 'PENDING', user: 'r1' })
  })
})
