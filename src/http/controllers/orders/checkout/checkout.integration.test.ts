import { randomUUID } from 'node:crypto'

import fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { redisClient } from '@/config/redis/index.js'
import { dataSource } from '@/database/typeorm/data-source.js'

import { registerCheckoutController } from './checkout.controller.js'

import type { CheckoutPublisher } from '@/messaging/checkout-queue.js'

function buildApp() {
  const published: unknown[] = []
  const publisher = { publish: (m: unknown) => published.push(m) } as unknown as CheckoutPublisher
  const app = fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerCheckoutController(app, publisher)

  return { app, published }
}

describe('POST /v1/orders/checkout (integration)', () => {
  const productId = randomUUID()

  beforeAll(async () => {
    if (!dataSource.isInitialized) await dataSource.initialize()
  })

  beforeEach(async () => {
    await dataSource.query(`INSERT INTO products (id, name, price) VALUES ($1, $2, $3)`, [productId, 'checkout-it', 1])
    await dataSource.query(`INSERT INTO stocks (product_id, quantity, reserved) VALUES ($1, 3, 0)`, [productId])
  })

  afterEach(async () => {
    await dataSource.query(`DELETE FROM products WHERE id = $1`, [productId])
  })

  afterAll(async () => {
    await dataSource.destroy()
    await redisClient.quit()
  })

  it('is idempotent for the same idempotency-key', async () => {
    const { app } = buildApp()
    await app.ready()
    const headers = { 'idempotency-key': randomUUID() }
    const payload = { productId, quantity: 1 }

    const first = await app.inject({ method: 'POST', url: '/v1/orders/checkout', headers, payload })
    const second = await app.inject({ method: 'POST', url: '/v1/orders/checkout', headers, payload })

    expect(first.statusCode).toBe(202)
    expect(second.statusCode).toBe(202)
    expect(second.json().orderId).toBe(first.json().orderId)

    await app.close()
  })

  it('does not oversell under concurrency', async () => {
    const { app } = buildApp()
    await app.ready()

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          url: '/v1/orders/checkout',
          headers: { 'idempotency-key': randomUUID() },
          payload: { productId, quantity: 1 },
        }),
      ),
    )

    const accepted = results.filter(r => r.statusCode === 202).length
    const rows = await dataSource.query(`SELECT reserved FROM stocks WHERE product_id = $1`, [productId])

    expect(accepted).toBe(3)
    expect(Number(rows[0].reserved)).toBe(3)

    await app.close()
  })
})
