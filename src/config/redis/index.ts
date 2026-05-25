import { Redis, type RedisOptions } from 'ioredis'

import { env } from '@/config/env/index.js'

const options: RedisOptions = {
  host: env.REDIS_HOST ?? 'localhost',
  port: env.REDIS_PORT ?? 6379,
  db: env.REDIS_DB_NUMBER,
  lazyConnect: true,
  ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
}

export const redisClient = new Redis(options)
