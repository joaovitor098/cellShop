import fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { listProductsController } from './list-products.controller.js'

import type { ProductsRepository } from '@/database/repositories/products-repository.js'

function buildApp(repository: ProductsRepository) {
  const app = fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  listProductsController(app, repository)

  return app
}

describe('GET /v1/products', () => {
  it('retorna produtos paginados com pagination', async () => {
    const app = buildApp({
      findPaginated: async () => ({
        items: [{ id: '11111111-1111-4111-8111-111111111111', name: 'X', price: 100 }],
        total: 40,
      }),
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/v1/products?page=2&limit=20' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'X', price: 100 }],
      pagination: { page: 2, limit: 20, total: 40, totalPages: 2 },
    })

    await app.close()
  })

  it('aplica defaults quando sem query', async () => {
    const app = buildApp({ findPaginated: async () => ({ items: [], total: 0 }) })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/v1/products' })

    expect(res.statusCode).toBe(200)
    expect(res.json().pagination).toMatchObject({ page: 1, limit: 20 })

    await app.close()
  })

  it('400 quando limit > 100', async () => {
    const app = buildApp({ findPaginated: async () => ({ items: [], total: 0 }) })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/v1/products?limit=101' })

    expect(res.statusCode).toBe(400)

    await app.close()
  })
})
