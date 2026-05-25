import 'reflect-metadata'

import { pino } from 'pino'

import { env } from './config/env/index.js'
import { Logger } from './config/logger/logger.js'
import { redisClient } from './config/redis/index.js'
import { RedisIdempotencyStore } from './database/idempotency/redis-idempotency-store.js'
import { TypeOrmOrdersRepository } from './database/repositories/typeorm-orders-repository.js'
import { TypeOrmStocksRepository } from './database/repositories/typeorm-stocks-repository.js'
import { dataSource } from './database/typeorm/data-source.js'
import { CHECKOUT_QUEUE, createChannel } from './messaging/checkout-queue.js'
import { processCheckoutMessage } from './worker/process-checkout-message.js'

import type { CheckoutMessage } from './messaging/checkout-queue.js'
import type { FastifyBaseLogger } from 'fastify'

async function startWorker() {
  await dataSource.initialize()

  const baseLogger = pino()
  const { channel } = await createChannel()

  const stocks = new TypeOrmStocksRepository(dataSource)
  const orders = new TypeOrmOrdersRepository(dataSource)
  const idempotency = new RedisIdempotencyStore(redisClient, env.IDEMPOTENCY_TTL_MS)

  await channel.consume(CHECKOUT_QUEUE, async msg => {
    if (!msg) return

    const message = JSON.parse(msg.content.toString()) as CheckoutMessage
    const logger = new Logger(baseLogger as unknown as FastifyBaseLogger)

    try {
      await processCheckoutMessage(message, { stocks, orders, idempotency, logger })
      channel.ack(msg)
    } catch (error) {
      logger.error('worker failed', error)
      channel.nack(msg, false, true)
    }
  })

  baseLogger.info(`worker consuming ${CHECKOUT_QUEUE}`)
}

void startWorker()
