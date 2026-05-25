import { TypeOrmProductsRepository } from './typeorm-products-repository.js'

import type { DataSource } from 'typeorm'

describe('TypeOrmProductsRepository.findPaginated', () => {
  it('aplica orderBy/skip/take/cache e retorna items+total', async () => {
    const calls: Record<string, unknown> = {}
    const qb = {
      orderBy: (field: string, dir: string) => ((calls.orderBy = [field, dir]), qb),
      skip: (n: number) => ((calls.skip = n), qb),
      take: (n: number) => ((calls.take = n), qb),
      cache: (key: string, ttl: number) => ((calls.cache = [key, ttl]), qb),
      getManyAndCount: async () => [[{ id: 'a', name: 'X', price: 1 }], 42],
    }
    const dataSource = {
      getRepository: () => ({ createQueryBuilder: () => qb }),
    } as unknown as DataSource

    const result = await new TypeOrmProductsRepository(dataSource).findPaginated({ page: 3, limit: 10 })

    expect(calls.orderBy).toEqual(['product.name', 'ASC'])
    expect(calls.skip).toBe(20) // (3-1)*10
    expect(calls.take).toBe(10)
    expect(calls.cache).toEqual(['products:list:page:3:limit:10', expect.any(Number)])
    expect(result).toEqual({ items: [{ id: 'a', name: 'X', price: 1 }], total: 42 })
  })
})
