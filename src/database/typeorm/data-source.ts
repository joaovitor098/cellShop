import 'reflect-metadata'

import path from 'node:path'
import { DataSource } from 'typeorm'

import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js'

import { env } from '@/config/env/index.js'

const TTL_REDIS_MS = 30_000 // 30 s

const cacheOptions: NonNullable<PostgresConnectionOptions['cache']> = {
  type: 'ioredis',
  alwaysEnabled: false,
  ignoreErrors: false,
  duration: TTL_REDIS_MS,
  options: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB_NUMBER,
  },
}

export function getDataSourceOptions(): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    username: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    synchronize: false,
    dropSchema: false,
    entities: [],
    logging: false,
    logger: 'advanced-console',
    migrationsRun: true,
    cache: cacheOptions,
    connectTimeoutMS: 5000,
    migrations: [path.join(import.meta.dirname, 'migrations', '*')],
    migrationsTableName: 'migrations',
  }
}

export const dataSource = new DataSource(getDataSourceOptions())
