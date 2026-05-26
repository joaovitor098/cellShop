import { RedisQueryResultCache } from 'typeorm/cache/RedisQueryResultCache.js'

import { cacheEventsCounter } from '@/config/metrics/index.js'
import { Logger } from '@/config/logger/logger.js'
import { getCurrentRequest } from '@/config/request-context.js'

import type { QueryResultCacheOptions } from 'typeorm/cache/QueryResultCacheOptions.js'
import type { QueryRunner } from 'typeorm'

export class LoggingRedisQueryResultCache extends RedisQueryResultCache {
  override async getFromCache(
    options: QueryResultCacheOptions,
    queryRunner?: QueryRunner,
  ): Promise<QueryResultCacheOptions | undefined> {
    const cached = await super.getFromCache(options, queryRunner)
    const hit = cached !== undefined && !this.isExpired(cached)

    cacheEventsCounter.inc({ result: hit ? 'hit' : 'miss' })

    const request = getCurrentRequest()

    if (request) {
      const cacheKey = options.identifier ?? options.query ?? 'unknown'

      Logger.fromRequest(request).info(hit ? 'cache hit' : 'cache miss', { cacheKey })
    }

    return cached
  }
}
