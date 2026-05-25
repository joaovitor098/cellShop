import type { Redis } from 'ioredis'

import type { IdempotencyRecord, IdempotencyStatus, IdempotencyStore } from './idempotency-store.js'

export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlMs: number,
  ) {}

  private key(key: string): string {
    return `idempotency:${key}`
  }

  async get(key: string): Promise<IdempotencyRecord | null> {
    const raw = await this.redis.get(this.key(key))

    return raw ? (JSON.parse(raw) as IdempotencyRecord) : null
  }

  async create(key: string, record: IdempotencyRecord): Promise<boolean> {
    const result = await this.redis.set(this.key(key), JSON.stringify(record), 'PX', this.ttlMs, 'NX')

    return result === 'OK'
  }

  async setStatus(key: string, status: IdempotencyStatus): Promise<void> {
    const existing = await this.get(key)

    if (!existing) return

    await this.redis.set(this.key(key), JSON.stringify({ ...existing, status }), 'PX', this.ttlMs)
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key))
  }
}
