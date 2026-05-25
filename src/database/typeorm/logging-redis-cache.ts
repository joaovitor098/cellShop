import { RedisQueryResultCache } from 'typeorm/cache/RedisQueryResultCache.js'

import { Logger } from '@/config/logger/logger.js'
import { getCurrentRequest } from '@/config/request-context.js'

import type { QueryResultCacheOptions } from 'typeorm/cache/QueryResultCacheOptions.js'
import type { QueryRunner } from 'typeorm'

/**
 * Cache de query no Redis que loga cache hit/miss. O provider é global, mas
 * recupera a request atual via AsyncLocalStorage pra logar com o reqId junto.
 */
export class LoggingRedisQueryResultCache extends RedisQueryResultCache {
  override async getFromCache(
    options: QueryResultCacheOptions,
    queryRunner?: QueryRunner,
  ): Promise<QueryResultCacheOptions | undefined> {
    const cached = await super.getFromCache(options, queryRunner)
    const hit = cached !== undefined && !this.isExpired(cached)

    const request = getCurrentRequest()

    if (request) {
      const cacheKey = options.identifier ?? options.query ?? 'unknown'

      new Logger(request).info(hit ? 'cache hit' : 'cache miss', { cacheKey })
    }

    return cached
  }
}
