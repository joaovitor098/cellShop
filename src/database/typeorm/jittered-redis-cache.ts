import { RedisQueryResultCache } from 'typeorm/cache/RedisQueryResultCache.js'

import type { QueryResultCacheOptions } from 'typeorm/cache/QueryResultCacheOptions.js'
import type { QueryRunner } from 'typeorm'

const JITTER_MAX_MS = 5_000


export class JitteredRedisQueryResultCache extends RedisQueryResultCache {
  override storeInCache(
    options: QueryResultCacheOptions,
    savedCache: QueryResultCacheOptions,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    const jitter = Math.floor(Math.random() * JITTER_MAX_MS)

    return super.storeInCache({ ...options, duration: options.duration + jitter }, savedCache, queryRunner)
  }
}
