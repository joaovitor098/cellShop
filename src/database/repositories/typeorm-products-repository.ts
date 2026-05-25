import type { DataSource } from 'typeorm'

import { env } from '@/config/env/index.js'
import { Product } from '@/database/entities/product.entity.js'

import type {
  FindPaginatedParams,
  PaginatedProductsResult,
  ProductsRepository,
} from './products-repository.js'

export class TypeOrmProductsRepository implements ProductsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findPaginated({ page, limit }: FindPaginatedParams): Promise<PaginatedProductsResult> {
    const [items, total] = await this.dataSource
      .getRepository(Product)
      .createQueryBuilder('product')
      .orderBy('product.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .cache(`products:list:page:${page}:limit:${limit}`, env.CACHE_TTL_MS)
      .getManyAndCount()

    return { items, total }
  }
}
