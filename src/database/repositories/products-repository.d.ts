import type { Product } from '@/database/entities/product.entity.js'

export interface FindPaginatedParams {
  page: number
  limit: number
}

export interface PaginatedProductsResult {
  items: Product[]
  total: number
}

export interface ProductsRepository {
  findPaginated(params: FindPaginatedParams): Promise<PaginatedProductsResult>
}
