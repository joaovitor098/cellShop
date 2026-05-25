import { randomUUID } from 'node:crypto'

import { dataSource } from '@/database/typeorm/data-source.js'

import { TypeOrmStocksRepository } from './typeorm-stocks-repository.js'

describe('TypeOrmStocksRepository (integration)', () => {
  const productId = randomUUID()

  beforeAll(async () => {
    if (!dataSource.isInitialized) await dataSource.initialize()
    await dataSource.query(`INSERT INTO products (id, name, price) VALUES ($1, $2, $3)`, [productId, 'concurrency-test', 1])
    await dataSource.query(`INSERT INTO stocks (product_id, quantity, reserved) VALUES ($1, $2, 0)`, [productId, 5])
  })

  afterAll(async () => {
    await dataSource.query(`DELETE FROM products WHERE id = $1`, [productId])
    await dataSource.destroy()
  })

  it('findAvailability returns quantity minus reserved', async () => {
    const repo = new TypeOrmStocksRepository(dataSource)

    expect(await repo.findAvailability(productId)).toBe(5)
  })

  it('reserves without overselling under concurrency', async () => {
    const repo = new TypeOrmStocksRepository(dataSource)
    const attempts = await Promise.all(Array.from({ length: 12 }, () => repo.reserve(productId, 1)))

    const successes = attempts.filter(Boolean).length
    const [{ reserved }] = await dataSource.query(`SELECT reserved FROM stocks WHERE product_id = $1`, [productId])

    expect(successes).toBe(5)
    expect(Number(reserved)).toBe(5)
  })

  it('commitReservation decrements quantity and reserved', async () => {
    const repo = new TypeOrmStocksRepository(dataSource)
    const ok = await repo.commitReservation(productId, 2)
    const [{ quantity, reserved }] = await dataSource.query(`SELECT quantity, reserved FROM stocks WHERE product_id = $1`, [productId])

    expect(ok).toBe(true)
    expect(Number(quantity)).toBe(3)
    expect(Number(reserved)).toBe(3)
  })
})
