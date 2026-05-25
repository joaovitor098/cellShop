import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { swaggerTags } from '@/config/swagger/index.js'
import { TypeOrmProductsRepository } from '@/database/repositories/typeorm-products-repository.js'
import { dataSource } from '@/database/typeorm/data-source.js'
import { listProductsQuerySchema } from '@/dtos/list-products-query.dto.js'
import { paginatedProductsSchema } from '@/dtos/products-response.dto.js'

import { ListProductsService } from './list-products.service.js'

import type { ProductsRepository } from '@/database/repositories/products-repository.js'

export function listProductsController(
  app: FastifyInstance,
  // DI: default usa o repo real; testes injetam um fake.
  repository: ProductsRepository = new TypeOrmProductsRepository(dataSource),
): void {
  const service = new ListProductsService(repository)

  app.withTypeProvider<ZodTypeProvider>().get(
    '/v1/products',
    {
      schema: {
        tags: [swaggerTags.PRODUCTS],
        summary: 'Lista produtos paginados',
        querystring: listProductsQuerySchema,
        response: {
          200: paginatedProductsSchema,
        },
      },
    },
    async request => {
      const { page, limit } = request.query

      return service.list(page, limit)
    },
  )
}
