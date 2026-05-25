import type { ProductsRepository } from '@/database/repositories/products-repository.js'
import type { PaginatedProducts } from '@/dtos/products-response.dto.js'

export class ListProductsService {
  constructor(private readonly repository: ProductsRepository) {}

  async list(page: number, limit: number): Promise<PaginatedProducts> {
    const { items, total } = await this.repository.findPaginated({ page, limit })

    return {
      data: items.map(item => ({ id: item.id, name: item.name, price: item.price })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }
}
