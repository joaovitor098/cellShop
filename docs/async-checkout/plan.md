# async-checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Mark each task done in `tasks.md` as it completes.

**Goal:** `POST /v1/orders/checkout` reserva estoque (atomic update condicional), salva o pedido, publica na fila e responde 202; um worker consome a fila e finaliza estoque/pedido com idempotência via Redis.

**Architecture:** Camadas controller → CheckoutService → { StocksRepository, OrdersRepository, IdempotencyStore, QueuePublisher }. Transação DB (reserva + pedido), publish após commit. Worker = processo separado. Logging contextual via `Logger`.

**Tech Stack:** Fastify, TypeORM 0.3, Postgres, Redis (ioredis), RabbitMQ (amqplib), Zod 4, Vitest, tsx (ESM nodenext).

**Premissas:** Vitest configurado; tabelas `orders`/`stocks` e enum existem; `Order` entity existe (order-status). Testes de integração assumem o docker-compose rodando (Postgres/Redis/RabbitMQ em localhost).

---

## File Structure

| Arquivo | Papel |
|---|---|
| `src/config/logger/logger.ts` (mod) | Logger com contexto + `fromRequest` + `child` |
| `src/config/env/index.ts` (mod) | + `RABBITMQ_URL`, `IDEMPOTENCY_TTL_MS` |
| `src/config/redis/index.ts` | ioredis client do app |
| `vitest.config.ts` (mod) | env de teste apontando pro compose + RABBITMQ_URL |
| `src/database/entities/stock.entity.ts` | entity `Stock` |
| `src/database/repositories/stocks-repository.d.ts` + `typeorm-stocks-repository.ts` | reserve/commit/availability atômicos |
| `src/database/repositories/orders-repository.d.ts` + `typeorm-orders-repository.ts` (mod) | + create / updateStatus |
| `src/database/idempotency/idempotency-store.d.ts` + `redis-idempotency-store.ts` | idempotência Redis |
| `src/messaging/checkout-queue.ts` | conexão amqplib + publisher + consumer + tipo da msg |
| `src/http/controllers/orders/checkout/checkout.dto.ts` | DTOs zod |
| `src/http/controllers/orders/checkout/checkout.service.ts` | orquestração |
| `src/http/controllers/orders/checkout/checkout.controller.ts` | rota + DI + logs |
| `src/worker/process-checkout-message.ts` | handler do consumer |
| `src/start-worker.ts` | entrypoint do worker |
| `src/start-server.ts` (mod) | wirar `dataSource.initialize()` |
| `docker-compose.yml` (mod) | serviço `worker` |

---

## Task 1: Generalizar a classe Logger (contexto + fromRequest)

**Files:** Modify `src/config/logger/logger.ts`; Modify `src/database/typeorm/logging-redis-cache.ts`; Test `src/config/logger/logger.test.ts`

- [ ] **Step 1: Teste (falhando)** — `src/config/logger/logger.test.ts`:
```ts
import { Logger } from './logger.js'

import type { FastifyBaseLogger } from 'fastify'

function fakeLog() {
  const calls: Array<{ level: string; payload: unknown; message: string }> = []
  const make = (level: string) => (payload: unknown, message: string) => calls.push({ level, payload, message })
  const log = { info: make('info'), warn: make('warn'), error: make('error'), debug: make('debug') } as unknown as FastifyBaseLogger

  return { log, calls }
}

describe('Logger', () => {
  it('merges context into every log payload', () => {
    const { log, calls } = fakeLog()
    new Logger(log, { reqId: 'r1', orderId: 'o1' }).info('reserved', { stock: 5 })

    expect(calls[0]).toEqual({ level: 'info', payload: { reqId: 'r1', orderId: 'o1', data: { stock: 5 } }, message: 'reserved' })
  })

  it('child accumulates context', () => {
    const { log, calls } = fakeLog()
    new Logger(log, { reqId: 'r1' }).child({ idempotencyKey: 'k1' }).info('next')

    expect(calls[0]).toEqual({ level: 'info', payload: { reqId: 'r1', idempotencyKey: 'k1' }, message: 'next' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- --run src/config/logger/logger.test.ts`

- [ ] **Step 3: Implementar** — `src/config/logger/logger.ts`:
```ts
import type { FastifyBaseLogger, FastifyRequest } from 'fastify'

export interface LogContext {
  reqId?: string
  correlationId?: string
  idempotencyKey?: string
  orderId?: string
  productId?: string
  stock?: number
}

type Level = 'info' | 'warn' | 'error' | 'debug'

export class Logger {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly context: LogContext = {},
  ) {}

  static fromRequest(request: FastifyRequest, context: LogContext = {}): Logger {
    return new Logger(request.log, { reqId: request.id, ...context })
  }

  child(extra: LogContext): Logger {
    return new Logger(this.log, { ...this.context, ...extra })
  }

  info(message: string, data?: unknown): void {
    this.write('info', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.write('warn', message, data)
  }

  error(message: string, data?: unknown): void {
    this.write('error', message, data)
  }

  debug(message: string, data?: unknown): void {
    this.write('debug', message, data)
  }

  private write(level: Level, message: string, data?: unknown): void {
    const payload = data === undefined ? { ...this.context } : { ...this.context, data }

    this.log[level](payload, message)
  }
}
```

- [ ] **Step 4: Atualizar o uso em `logging-redis-cache.ts`** — trocar `new Logger(request)` por `Logger.fromRequest(request)` (manter o resto).

- [ ] **Step 5: Rodar e ver passar** — `npm test -- --run src/config/logger/logger.test.ts`; depois `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `git commit -m "feat(logger): support context and fromRequest for use in worker"`

---

## Task 2: env (RABBITMQ_URL, IDEMPOTENCY_TTL_MS) + redis client + vitest env

**Files:** Modify `src/config/env/index.ts`; Create `src/config/redis/index.ts`; Modify `vitest.config.ts`

- [ ] **Step 1: env** — em `src/config/env/index.ts`, adicionar ao `z.object`:
```ts
  RABBITMQ_URL: z.string(),
  IDEMPOTENCY_TTL_MS: z.coerce.number().default(86_400_000),
```

- [ ] **Step 2: redis client** — `src/config/redis/index.ts`:
```ts
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
```

- [ ] **Step 3: vitest env** — em `vitest.config.ts`, atualizar `test.env` para apontar pro compose (integração) e satisfazer `RABBITMQ_URL`:
```ts
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'cellshop',
      DATABASE_PASSWORD: 'cellshop',
      DATABASE_NAME: 'cellshop',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      RABBITMQ_URL: 'amqp://cellshop:cellshop@localhost:5672',
    },
```

- [ ] **Step 4: Verificar** — `npx tsc --noEmit && npm test -- --run` (suíte atual continua verde).

- [ ] **Step 5: Commit** — `git commit -m "feat(config): add rabbitmq/idempotency env and app redis client"`

---

## Task 3: Stock entity + registrar no data-source

**Files:** Create `src/database/entities/stock.entity.ts`; Modify `src/database/typeorm/data-source.ts`

- [ ] **Step 1: Entity** — `src/database/entities/stock.entity.ts`:
```ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('stocks')
export class Stock {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string

  @Column({ type: 'integer' })
  quantity!: number

  @Column({ type: 'integer' })
  reserved!: number
}
```

- [ ] **Step 2: Registrar** — em `data-source.ts`, importar `Stock` e incluir em `entities: [Product, Order, Stock]`.

- [ ] **Step 3: Verificar** — `npx tsc --noEmit`.

- [ ] **Step 4: Commit** — `git commit -m "feat(stocks): add Stock entity and register in data source"`

---

## Task 4: StocksRepository (reserva/confirmação/disponibilidade atômicas) + teste de integração (concorrência)

**Files:** Create `src/database/repositories/stocks-repository.d.ts`, `typeorm-stocks-repository.ts`; Test `typeorm-stocks-repository.integration.test.ts`

- [ ] **Step 1: Abstração** — `src/database/repositories/stocks-repository.d.ts`:
```ts
import type { EntityManager } from 'typeorm'

export interface StocksRepository {
  reserve(productId: string, quantity: number, manager?: EntityManager): Promise<boolean>
  commitReservation(productId: string, quantity: number, manager?: EntityManager): Promise<boolean>
  findAvailability(productId: string, manager?: EntityManager): Promise<number | null>
}
```

- [ ] **Step 2: Implementação** — `src/database/repositories/typeorm-stocks-repository.ts`:
```ts
import type { DataSource, EntityManager } from 'typeorm'

import type { StocksRepository } from './stocks-repository.js'

export class TypeOrmStocksRepository implements StocksRepository {
  constructor(private readonly dataSource: DataSource) {}

  async reserve(productId: string, quantity: number, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    const rows = await manager.query(
      `UPDATE stocks SET reserved = reserved + $1 WHERE product_id = $2 AND quantity - reserved >= $1 RETURNING id`,
      [quantity, productId],
    )

    return rows.length === 1
  }

  async commitReservation(productId: string, quantity: number, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    const rows = await manager.query(
      `UPDATE stocks SET quantity = quantity - $1, reserved = reserved - $1 WHERE product_id = $2 AND reserved >= $1 AND quantity >= $1 RETURNING id`,
      [quantity, productId],
    )

    return rows.length === 1
  }

  async findAvailability(productId: string, manager: EntityManager = this.dataSource.manager): Promise<number | null> {
    const rows = await manager.query(`SELECT quantity - reserved AS available FROM stocks WHERE product_id = $1`, [productId])
    const row = rows[0]

    return row ? Number(row.available) : null
  }
}
```

- [ ] **Step 3: Teste de integração (falhando)** — `src/database/repositories/typeorm-stocks-repository.integration.test.ts`. Usa o Postgres do compose. Cria um produto+stock, dispara reservas paralelas, valida sem overselling:
```ts
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
```

- [ ] **Step 4: Rodar (compose deve estar up)** — `npm test -- --run src/database/repositories/typeorm-stocks-repository.integration.test.ts`. Expected: PASS (sem overselling).

- [ ] **Step 5: tsc + commit** — `npx tsc --noEmit`; `git commit -m "feat(stocks): add stocks repository with atomic reserve/commit"`

---

## Task 5: OrdersRepository — create + updateStatus

**Files:** Modify `src/database/repositories/orders-repository.d.ts`, `typeorm-orders-repository.ts`; Test `typeorm-orders-repository.create.test.ts`

- [ ] **Step 1: Abstração** — adicionar à interface `OrdersRepository`:
```ts
import type { EntityManager } from 'typeorm'
import type { Order, OrderStatus } from '@/database/entities/order.entity.js'

// ...dentro de OrdersRepository:
  create(orderId: string, user: string, manager?: EntityManager): Promise<Order>
  updateStatus(id: string, status: OrderStatus, manager?: EntityManager): Promise<void>
```

- [ ] **Step 2: Teste (falhando)** — `typeorm-orders-repository.create.test.ts` (mock manager):
```ts
import { TypeOrmOrdersRepository } from './typeorm-orders-repository.js'

import type { DataSource, EntityManager } from 'typeorm'

describe('TypeOrmOrdersRepository.create', () => {
  it('saves a PENDING order with the given orderId and user', async () => {
    const saved = { id: 'o1', status: 'PENDING', user: 'r1' }
    const repo = {
      create: (data: unknown) => data,
      save: async (o: unknown) => ({ ...(o as object) }),
    }
    const manager = { getRepository: () => repo } as unknown as EntityManager
    const dataSource = { manager } as unknown as DataSource

    const result = await new TypeOrmOrdersRepository(dataSource).create('o1', 'r1', manager)

    expect(result).toEqual(saved)
  })
})
```

- [ ] **Step 3: Implementar** — em `typeorm-orders-repository.ts`, adicionar:
```ts
  async create(orderId: string, user: string, manager: EntityManager = this.dataSource.manager): Promise<Order> {
    const repository = manager.getRepository(Order)

    return repository.save(repository.create({ id: orderId, user, status: 'PENDING' }))
  }

  async updateStatus(id: string, status: OrderStatus, manager: EntityManager = this.dataSource.manager): Promise<void> {
    await manager.getRepository(Order).update({ id }, { status })
  }
```
(o construtor já recebe `dataSource`; adicionar os imports `EntityManager`, `OrderStatus`.)

- [ ] **Step 4: Rodar e ver passar** — `npm test -- --run src/database/repositories/typeorm-orders-repository.create.test.ts`; `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit -m "feat(orders): add create and updateStatus to orders repository"`

---

## Task 6: IdempotencyStore (Redis)

**Files:** Create `src/database/idempotency/idempotency-store.d.ts`, `redis-idempotency-store.ts`; Test (integration) `redis-idempotency-store.integration.test.ts`

- [ ] **Step 1: Abstração** — `src/database/idempotency/idempotency-store.d.ts`:
```ts
export type IdempotencyStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED'

export interface IdempotencyRecord {
  status: IdempotencyStatus
  orderId: string
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>
  create(key: string, record: IdempotencyRecord): Promise<boolean>
  setStatus(key: string, status: IdempotencyStatus): Promise<void>
  delete(key: string): Promise<void>
}
```

- [ ] **Step 2: Implementação** — `src/database/idempotency/redis-idempotency-store.ts`:
```ts
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
```

- [ ] **Step 3: Teste de integração (falhando)** — `redis-idempotency-store.integration.test.ts` (Redis do compose):
```ts
import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'

import { RedisIdempotencyStore } from './redis-idempotency-store.js'

describe('RedisIdempotencyStore (integration)', () => {
  const redis = new Redis({ host: 'localhost', port: 6379 })

  afterAll(async () => {
    await redis.quit()
  })

  it('creates with NX (returns true first time, false on repeat), reads and updates status', async () => {
    const store = new RedisIdempotencyStore(redis, 60_000)
    const key = randomUUID()

    expect(await store.get(key)).toBeNull()

    expect(await store.create(key, { status: 'PENDING', orderId: 'o1' })).toBe(true)
    expect(await store.get(key)).toEqual({ status: 'PENDING', orderId: 'o1' })

    expect(await store.create(key, { status: 'PENDING', orderId: 'o2' })).toBe(false)

    await store.setStatus(key, 'PROCESSED')
    expect(await store.get(key)).toEqual({ status: 'PROCESSED', orderId: 'o1' })

    await store.delete(key)
    expect(await store.get(key)).toBeNull()
  })
})
```

- [ ] **Step 4: Rodar** — `npm test -- --run src/database/idempotency/redis-idempotency-store.integration.test.ts`.

- [ ] **Step 5: tsc + commit** — `git commit -m "feat(idempotency): add redis idempotency store"`

---

## Task 7: Fila (amqplib) — conexão, publisher, consumer, tipo da mensagem

**Files:** Create `src/messaging/checkout-queue.ts`. Instalar `amqplib` + `@types/amqplib`.

- [ ] **Step 1: Instalar deps** — `npm install amqplib && npm install -D @types/amqplib`.

- [ ] **Step 2: Implementar** — `src/messaging/checkout-queue.ts`:
```ts
import amqp, { type Channel, type ChannelModel } from 'amqplib'

import { env } from '@/config/env/index.js'

export const CHECKOUT_QUEUE = 'orders.checkout'

export interface CheckoutMessage {
  correlationId: string
  idempotencyKey: string
  productId: string
  reservedQuantity: number
  stockAvailability: number
  orderId: string
}

export async function createChannel(): Promise<{ connection: ChannelModel; channel: Channel }> {
  const connection = await amqp.connect(env.RABBITMQ_URL)
  const channel = await connection.createChannel()
  await channel.assertQueue(CHECKOUT_QUEUE, { durable: true })

  return { connection, channel }
}

export class CheckoutPublisher {
  constructor(private readonly channel: Channel) {}

  publish(message: CheckoutMessage): void {
    this.channel.sendToQueue(CHECKOUT_QUEUE, Buffer.from(JSON.stringify(message)), { persistent: true })
  }
}
```
(Se os tipos do amqplib divergirem — `connect` retornar `Connection` em vez de `ChannelModel` — ajustar o tipo de retorno conforme `@types/amqplib` instalado; reportar se houver erro de tipo.)

- [ ] **Step 3: tsc** — `npx tsc --noEmit`.

- [ ] **Step 4: Commit** — `git commit -m "feat(messaging): add checkout queue channel and publisher"`

---

## Task 8: Checkout DTOs

**Files:** Create `src/http/controllers/orders/checkout/checkout.dto.ts`; Test `checkout.dto.test.ts`

- [ ] **Step 1: Teste (falhando)** — `checkout.dto.test.ts`:
```ts
import { checkoutBodySchema, checkoutHeadersSchema } from './checkout.dto.js'

describe('checkout dto', () => {
  it('accepts a valid idempotency-key header', () => {
    const parsed = checkoutHeadersSchema.parse({ 'idempotency-key': '11111111-1111-4111-8111-111111111111' })

    expect(parsed['idempotency-key']).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('rejects a non-uuid idempotency-key', () => {
    expect(() => checkoutHeadersSchema.parse({ 'idempotency-key': 'abc' })).toThrow()
  })

  it('accepts a valid body', () => {
    const parsed = checkoutBodySchema.parse({ productId: '11111111-1111-4111-8111-111111111111', quantity: 2 })

    expect(parsed.quantity).toBe(2)
  })

  it('rejects quantity < 1', () => {
    expect(() => checkoutBodySchema.parse({ productId: '11111111-1111-4111-8111-111111111111', quantity: 0 })).toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar** — `src/http/controllers/orders/checkout/checkout.dto.ts`:
```ts
import { z } from 'zod'

export const checkoutHeadersSchema = z.object({
  'idempotency-key': z.uuid(),
})

export const checkoutBodySchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().int().min(1),
})

export const checkoutResponseSchema = z.object({
  orderId: z.uuid(),
})

export const checkoutConflictSchema = z.object({
  message: z.string(),
})

export type CheckoutBody = z.infer<typeof checkoutBodySchema>
```

- [ ] **Step 4: Rodar e ver passar; tsc**

- [ ] **Step 5: Commit** — `git commit -m "feat(checkout): add checkout dtos"`

---

## Task 9: CheckoutService + unit test

**Files:** Create `checkout.service.ts`; Test `checkout.service.test.ts`

- [ ] **Step 1: Teste (falhando)** — `checkout.service.test.ts` (todos os colaboradores mockados):
```ts
import { CheckoutService } from './checkout.service.js'

import type { StocksRepository } from '@/database/repositories/stocks-repository.js'
import type { OrdersRepository } from '@/database/repositories/orders-repository.js'
import type { IdempotencyStore } from '@/database/idempotency/idempotency-store.js'
import type { CheckoutPublisher } from '@/messaging/checkout-queue.js'
import type { Logger } from '@/config/logger/logger.js'
import type { RunInTransaction } from './checkout.service.js'

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, child: () => logger } as unknown as Logger

function deps(overrides: Partial<{ reserved: boolean; created: boolean; existing: unknown }> = {}) {
  const published: unknown[] = []
  const deleted: string[] = []
  const stocks = {
    reserve: async () => overrides.reserved ?? true,
    commitReservation: async () => true,
    findAvailability: async () => 48,
  } as unknown as StocksRepository
  const orders = {
    create: async () => ({ id: 'o1', status: 'PENDING', user: 'r1' }),
    findById: async () => null,
    updateStatus: async () => undefined,
  } as unknown as OrdersRepository
  const idempotency = {
    get: async () => overrides.existing ?? null,
    create: async () => overrides.created ?? true,
    setStatus: async () => undefined,
    delete: async (key: string) => { deleted.push(key) },
  } as unknown as IdempotencyStore
  const publisher = { publish: (m: unknown) => published.push(m) } as unknown as CheckoutPublisher
  const runInTransaction = (async (fn: (m: unknown) => Promise<unknown>) => fn({})) as unknown as RunInTransaction

  return { stocks, orders, idempotency, publisher, published, deleted, runInTransaction }
}

describe('CheckoutService', () => {
  it('reserves, creates order and publishes when stock is available', async () => {
    const d = deps({ created: true, reserved: true })
    const service = new CheckoutService(d.stocks, d.orders, d.idempotency, d.publisher, d.runInTransaction)

    const result = await service.checkout({ idempotencyKey: 'k1', productId: 'p1', quantity: 2, correlationId: 'r1' }, logger)

    expect(result.conflict).toBe(false)
    expect(typeof result.orderId).toBe('string')
    expect(result.orderId.length).toBeGreaterThan(0)
    expect(d.published).toHaveLength(1)
  })

  it('returns conflict and releases the lock when reservation fails', async () => {
    const d = deps({ created: true, reserved: false })
    const service = new CheckoutService(d.stocks, d.orders, d.idempotency, d.publisher, d.runInTransaction)

    const result = await service.checkout({ idempotencyKey: 'k1', productId: 'p1', quantity: 2, correlationId: 'r1' }, logger)

    expect(result.conflict).toBe(true)
    expect(d.published).toHaveLength(0)
    expect(d.deleted).toEqual(['k1'])
  })

  it('is idempotent: NX create fails, returns existing orderId without reserving', async () => {
    const d = deps({ created: false, existing: { status: 'PENDING', orderId: 'existing' } })
    const service = new CheckoutService(d.stocks, d.orders, d.idempotency, d.publisher, d.runInTransaction)

    const result = await service.checkout({ idempotencyKey: 'k1', productId: 'p1', quantity: 2, correlationId: 'r1' }, logger)

    expect(result).toEqual({ orderId: 'existing', conflict: false })
    expect(d.published).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar** — `src/http/controllers/orders/checkout/checkout.service.ts`:
```ts
import { randomUUID } from 'node:crypto'

import type { EntityManager } from 'typeorm'

import type { Logger } from '@/config/logger/logger.js'
import type { IdempotencyStore } from '@/database/idempotency/idempotency-store.js'
import type { OrdersRepository } from '@/database/repositories/orders-repository.js'
import type { StocksRepository } from '@/database/repositories/stocks-repository.js'
import type { CheckoutMessage, CheckoutPublisher } from '@/messaging/checkout-queue.js'

export interface CheckoutInput {
  idempotencyKey: string
  productId: string
  quantity: number
  correlationId: string
}

export interface CheckoutResult {
  orderId: string
  conflict: boolean
}

export type RunInTransaction = <T>(fn: (manager: EntityManager) => Promise<T>) => Promise<T>

export class CheckoutService {
  constructor(
    private readonly stocks: StocksRepository,
    private readonly orders: OrdersRepository,
    private readonly idempotency: IdempotencyStore,
    private readonly publisher: CheckoutPublisher,
    private readonly runInTransaction: RunInTransaction,
  ) {}

  async checkout(input: CheckoutInput, logger: Logger): Promise<CheckoutResult> {
    const orderId = randomUUID()
    const created = await this.idempotency.create(input.idempotencyKey, { status: 'PENDING', orderId })

    if (!created) {
      const existing = await this.idempotency.get(input.idempotencyKey)

      logger.info('idempotency hit, returning existing order', { orderId: existing?.orderId ?? orderId })

      return { orderId: existing?.orderId ?? orderId, conflict: false }
    }

    const availability = await this.runInTransaction(async manager => {
      const reserved = await this.stocks.reserve(input.productId, input.quantity, manager)

      if (!reserved) {
        logger.warn('stock reservation failed')

        return null
      }

      logger.info('stock reserved', { quantity: input.quantity })

      await this.orders.create(orderId, input.correlationId, manager)

      logger.info('order created', { orderId })

      return this.stocks.findAvailability(input.productId, manager)
    })

    if (availability === null) {
      await this.idempotency.delete(input.idempotencyKey)

      return { orderId: '', conflict: true }
    }

    const message: CheckoutMessage = {
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      productId: input.productId,
      reservedQuantity: input.quantity,
      stockAvailability: availability ?? 0,
      orderId,
    }

    this.publisher.publish(message)

    logger.info('checkout message published', { orderId })

    return { orderId, conflict: false }
  }
}
```

- [ ] **Step 4: Rodar e ver passar; tsc**

- [ ] **Step 5: Commit** — `git commit -m "feat(checkout): add checkout service orchestrating reserve+order+publish"`

---

## Task 10: checkoutController + rota + wiring + dataSource.initialize no boot

**Files:** Create `checkout.controller.ts`; Modify `src/http/routes.ts`; Modify `src/start-server.ts`

- [ ] **Step 1: Controller** — `src/http/controllers/orders/checkout/checkout.controller.ts`:
```ts
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { Logger } from '@/config/logger/logger.js'
import { redisClient } from '@/config/redis/index.js'
import { env } from '@/config/env/index.js'
import { swaggerTags } from '@/config/swagger/index.js'
import { RedisIdempotencyStore } from '@/database/idempotency/redis-idempotency-store.js'
import { TypeOrmOrdersRepository } from '@/database/repositories/typeorm-orders-repository.js'
import { TypeOrmStocksRepository } from '@/database/repositories/typeorm-stocks-repository.js'
import { dataSource } from '@/database/typeorm/data-source.js'
import { CheckoutPublisher } from '@/messaging/checkout-queue.js'

import {
  checkoutBodySchema,
  checkoutConflictSchema,
  checkoutHeadersSchema,
  checkoutResponseSchema,
} from './checkout.dto.js'
import { CheckoutService } from './checkout.service.js'

export function registerCheckoutController(app: FastifyInstance, publisher: CheckoutPublisher): void {
  const service = new CheckoutService(
    new TypeOrmStocksRepository(dataSource),
    new TypeOrmOrdersRepository(dataSource),
    new RedisIdempotencyStore(redisClient, env.IDEMPOTENCY_TTL_MS),
    publisher,
    fn => dataSource.transaction(fn),
  )

  app.withTypeProvider<ZodTypeProvider>().post(
    '/v1/orders/checkout',
    {
      schema: {
        tags: [swaggerTags.ORDERS],
        summary: 'Async checkout',
        headers: checkoutHeadersSchema,
        body: checkoutBodySchema,
        response: {
          202: checkoutResponseSchema,
          409: checkoutConflictSchema,
        },
      },
    },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'] as string
      const { productId, quantity } = request.body
      const logger = Logger.fromRequest(request, { idempotencyKey, productId })

      logger.info('checkout received', { quantity })

      const result = await service.checkout({ idempotencyKey, productId, quantity, correlationId: request.id }, logger)

      if (result.conflict) {
        logger.warn('checkout insufficient stock')

        return reply.status(409).send({ message: 'Insufficient stock' })
      }

      logger.child({ orderId: result.orderId }).info('checkout accepted')

      return reply.status(202).send({ orderId: result.orderId })
    },
  )
}
```
Nota: `registerCheckoutController` recebe o `publisher` (criado no boot, com canal aberto). O `headers` schema valida `idempotency-key`; o handler lê de `request.headers`.

- [ ] **Step 2: Wiring nas rotas** — `src/http/routes.ts` passa a receber/encadear o publisher. Como o publisher precisa de canal assíncrono, criá-lo no boot e injetar. Ajuste: `registerRoutes(app, publisher)` e `registerCheckoutController(app, publisher)`. Os outros controllers seguem iguais.

- [ ] **Step 3: Boot** — em `src/start-server.ts`: antes de `server()`, `await dataSource.initialize()`; abrir o canal (`createChannel()`), criar `CheckoutPublisher`, passar pro `server()/registerRoutes`. Tornar `startServer` async.

```ts
import 'reflect-metadata'

import { dataSource } from './database/typeorm/data-source.js'
import { CheckoutPublisher, createChannel } from './messaging/checkout-queue.js'
import { server } from './server.js'

async function startServer() {
  await dataSource.initialize()

  const { channel } = await createChannel()
  const publisher = new CheckoutPublisher(channel)

  const app = server(publisher)

  const port = Number(process.env.PORT) || 3333
  const host = process.env.HOST ?? '0.0.0.0'

  app.listen({ port, host }, (err, address) => {
    if (err) {
      app.log.error(err)
      process.exit(1)
    }
    app.log.info(`Server listening at ${address}`)
  })
}

void startServer()
```
`server(publisher)` repassa pro `registerRoutes(app, publisher)`. Atualizar a assinatura de `server()` e `registerRoutes` para aceitar o publisher.

- [ ] **Step 4: tsc + suíte** — `npx tsc --noEmit && npm test -- --run`.

- [ ] **Step 5: Commit** — `git commit -m "feat(checkout): add POST /v1/orders/checkout endpoint and wire boot"`

---

## Task 11: Worker handler `processCheckoutMessage` + unit test

**Files:** Create `src/worker/process-checkout-message.ts`; Test `process-checkout-message.test.ts`

- [ ] **Step 1: Teste (falhando)** — mocks de stocks/orders/idempotency/logger; cobre: já PROCESSED → skip; novo → PROCESSING → decrementa → order PROCESSED → idempotency PROCESSED:
```ts
import { processCheckoutMessage } from './process-checkout-message.js'

import type { CheckoutMessage } from '@/messaging/checkout-queue.js'

function deps(existingStatus?: string) {
  const events: string[] = []
  const stocks = { commitReservation: async () => (events.push('commit'), true) } as any
  const orders = { updateStatus: async () => events.push('order-processed') } as any
  const idempotency = {
    get: async () => (existingStatus ? { status: existingStatus, orderId: 'o1' } : null),
    create: async () => events.push('created'),
    setStatus: async (_k: string, s: string) => events.push(`status:${s}`),
  } as any
  const logger = { info: () => undefined, child: () => logger, warn: () => undefined, error: () => undefined } as any

  return { stocks, orders, idempotency, logger, events }
}

const message: CheckoutMessage = {
  correlationId: 'r1', idempotencyKey: 'k1', productId: 'p1', reservedQuantity: 2, stockAvailability: 3, orderId: 'o1',
}

describe('processCheckoutMessage', () => {
  it('skips when already PROCESSED', async () => {
    const d = deps('PROCESSED')
    await processCheckoutMessage(message, d)

    expect(d.events).toEqual([])
  })

  it('processes a new message: PROCESSING -> commit -> order PROCESSED -> idempotency PROCESSED', async () => {
    const d = deps(undefined)
    await processCheckoutMessage(message, d)

    expect(d.events).toEqual(['status:PROCESSING', 'commit', 'order-processed', 'status:PROCESSED'])
  })
})
```
(Obs: quando não existe no Redis, o handler cria com PROCESSING — aqui via `setStatus`/`create`; o teste valida a sequência. Se o handler usar `create` no caso "não existe", ajustar o assert para refletir a implementação — manter consistente entre código e teste.)

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar** — `src/worker/process-checkout-message.ts`:
```ts
import type { Logger } from '@/config/logger/logger.js'
import type { IdempotencyStore } from '@/database/idempotency/idempotency-store.js'
import type { OrdersRepository } from '@/database/repositories/orders-repository.js'
import type { StocksRepository } from '@/database/repositories/stocks-repository.js'
import type { CheckoutMessage } from '@/messaging/checkout-queue.js'

export interface WorkerDeps {
  stocks: StocksRepository
  orders: OrdersRepository
  idempotency: IdempotencyStore
  logger: Logger
}

export async function processCheckoutMessage(message: CheckoutMessage, deps: WorkerDeps): Promise<void> {
  const logger = deps.logger.child({
    correlationId: message.correlationId,
    idempotencyKey: message.idempotencyKey,
    orderId: message.orderId,
    productId: message.productId,
  })

  const record = await deps.idempotency.get(message.idempotencyKey)

  if (record?.status === 'PROCESSED') {
    logger.info('already processed, skipping')

    return
  }

  if (!record) {
    await deps.idempotency.create(message.idempotencyKey, { status: 'PROCESSING', orderId: message.orderId })
  } else {
    await deps.idempotency.setStatus(message.idempotencyKey, 'PROCESSING')
  }

  logger.info('processing checkout (simulating successful request)')

  const committed = await deps.stocks.commitReservation(message.productId, message.reservedQuantity)

  if (!committed) {
    logger.error('stock commit failed')

    return
  }

  await deps.orders.updateStatus(message.orderId, 'PROCESSED')
  await deps.idempotency.setStatus(message.idempotencyKey, 'PROCESSED')

  logger.info('checkout processed')
}
```
(Alinhar o teste do Step 1 com a sequência real: novo → `create(PROCESSING)` em vez de `setStatus`; ajustar o assert do teste para `['created', 'commit', 'order-processed', 'status:PROCESSED']`.)

- [ ] **Step 4: Rodar e ver passar; tsc**

- [ ] **Step 5: Commit** — `git commit -m "feat(worker): add checkout message processor"`

---

## Task 12: start-worker.ts + docker-compose worker service

**Files:** Create `src/start-worker.ts`; Modify `docker-compose.yml`

- [ ] **Step 1: Entrypoint** — `src/start-worker.ts`:
```ts
import 'reflect-metadata'

import { pino } from 'pino'

import { env } from './config/env/index.js'
import { Logger } from './config/logger/logger.js'
import { redisClient } from './config/redis/index.js'
import { RedisIdempotencyStore } from './database/idempotency/redis-idempotency-store.js'
import { TypeOrmOrdersRepository } from './database/repositories/typeorm-orders-repository.js'
import { TypeOrmStocksRepository } from './database/repositories/typeorm-stocks-repository.js'
import { dataSource } from './database/typeorm/data-source.js'
import { CHECKOUT_QUEUE, createChannel, type CheckoutMessage } from './messaging/checkout-queue.js'
import { processCheckoutMessage } from './worker/process-checkout-message.js'

async function startWorker() {
  await dataSource.initialize()

  const baseLogger = pino()
  const { channel } = await createChannel()

  const deps = {
    stocks: new TypeOrmStocksRepository(dataSource),
    orders: new TypeOrmOrdersRepository(dataSource),
    idempotency: new RedisIdempotencyStore(redisClient, env.IDEMPOTENCY_TTL_MS),
  }

  await channel.consume(CHECKOUT_QUEUE, async msg => {
    if (!msg) return

    const message = JSON.parse(msg.content.toString()) as CheckoutMessage
    const logger = new Logger(baseLogger)

    try {
      await processCheckoutMessage(message, { ...deps, logger })
      channel.ack(msg)
    } catch (error) {
      logger.error('worker failed', error)
      channel.nack(msg, false, true)
    }
  })

  baseLogger.info('worker consuming %s', CHECKOUT_QUEUE)
}

void startWorker()
```
(`pino` é dep direta; importar `import { pino } from 'pino'`. `new Logger(baseLogger)` usa o pino como `FastifyBaseLogger` — compatível na superfície usada: info/warn/error/debug.)

- [ ] **Step 2: docker-compose** — adicionar serviço `worker` (mesma imagem/contexto da app, `command` rodando o entrypoint do worker via tsx, com as mesmas envs e `depends_on` postgres/redis/rabbitmq healthy). Adicionar script `npm run worker` = `tsx watch src/start-worker.ts` no `package.json` e usar no `command` do serviço.

- [ ] **Step 3: tsc** — `npx tsc --noEmit`.

- [ ] **Step 4: Commit** — `git commit -m "feat(worker): add worker entrypoint and compose service"`

---

## Task 13: Testes de integração do endpoint (concorrência + idempotência)

**Files:** Test `src/http/controllers/orders/checkout/checkout.integration.test.ts`

Usa Postgres+Redis reais (compose). Publisher é um fake (captura mensagens — evita exigir RabbitMQ pro teste). Constrói o app com o fake publisher, semeia produto+stock, injeta requests.

- [ ] **Step 1: Teste** — cobre:
  - **Idempotência:** 2 POSTs com a mesma `idempotency-key` → mesmo `orderId`, 1 pedido no banco, 1 reserva.
  - **Concorrência:** stock `quantity=N`, disparar `K>N` checkouts paralelos (idempotency-keys distintas) → exatamente `N` respostas 202 e `K-N` com 409; `reserved = N`.

Esqueleto:
```ts
import { randomUUID } from 'node:crypto'

import fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { dataSource } from '@/database/typeorm/data-source.js'
import { redisClient } from '@/config/redis/index.js'
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
    await dataSource.query(`INSERT INTO products (id, name, price) VALUES ($1,$2,$3)`, [productId, 'checkout-it', 1])
    await dataSource.query(`INSERT INTO stocks (product_id, quantity, reserved) VALUES ($1,3,0)`, [productId])
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
    const key = randomUUID()
    const headers = { 'idempotency-key': key }
    const body = { productId, quantity: 1 }

    const first = await app.inject({ method: 'POST', url: '/v1/orders/checkout', headers, payload: body })
    const second = await app.inject({ method: 'POST', url: '/v1/orders/checkout', headers, payload: body })

    expect(first.statusCode).toBe(202)
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
    const [{ reserved }] = await dataSource.query(`SELECT reserved FROM stocks WHERE product_id = $1`, [productId])

    expect(accepted).toBe(3)
    expect(Number(reserved)).toBe(3)
    await app.close()
  })
})
```

- [ ] **Step 2: Rodar (compose up)** — `npm test -- --run src/http/controllers/orders/checkout/checkout.integration.test.ts`.

- [ ] **Step 3: tsc + suíte completa + commit** — `npx tsc --noEmit && npm test -- --run`; `git commit -m "test(checkout): add integration tests for idempotency and concurrency"`

---

## Code review final

Após todas as tasks (modo subagent): code review da branch + suíte verde (incl. integração com o compose up). Ver `tasks.md`.
