import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'

import { RedisIdempotencyStore } from './redis-idempotency-store.js'

describe('RedisIdempotencyStore (integration)', () => {
  const redis = new Redis({ host: 'localhost', port: 6379 })

  afterAll(async () => {
    await redis.quit()
  })

  it('creates, reads and updates status', async () => {
    const store = new RedisIdempotencyStore(redis, 60_000)
    const key = randomUUID()

    expect(await store.get(key)).toBeNull()

    await store.create(key, { status: 'PENDING', orderId: 'o1' })
    expect(await store.get(key)).toEqual({ status: 'PENDING', orderId: 'o1' })

    await store.setStatus(key, 'PROCESSED')
    expect(await store.get(key)).toEqual({ status: 'PROCESSED', orderId: 'o1' })

    await redis.del(`idempotency:${key}`)
  })
})
