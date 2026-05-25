import { ListProductsService } from './list-products.service.js'

import type { ProductsRepository } from '@/database/repositories/products-repository.js'

describe('ListProductsService', () => {
  it('builds data + pagination with computed totalPages', async () => {
    const repository: ProductsRepository = {
      findPaginated: async () => ({ items: [{ id: 'a', name: 'X', price: 100 }], total: 100 }),
    }

    const result = await new ListProductsService(repository).list(2, 20)

    expect(result.pagination).toEqual({ page: 2, limit: 20, total: 100, totalPages: 5 })
    expect(result.data).toEqual([{ id: 'a', name: 'X', price: 100 }])
  })

  it('totalPages = 0 when there are no products', async () => {
    const repository: ProductsRepository = {
      findPaginated: async () => ({ items: [], total: 0 }),
    }

    const result = await new ListProductsService(repository).list(1, 20)

    expect(result.pagination.totalPages).toBe(0)
  })
})
