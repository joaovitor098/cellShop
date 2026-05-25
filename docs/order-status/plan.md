# order-status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor `GET /v1/orders/:idOrder/status` retornando `{ id, status }` de um pedido, com 404 quando não existe.

**Architecture:** Camadas controller → service → repository (abstração). Entity TypeORM com decorators (tipos explícitos). Sem cache. Validação de params/response por Zod.

**Tech Stack:** Fastify, TypeORM 0.3, Postgres, Zod 4, fastify-type-provider-zod, Vitest, tsx (ESM nodenext).

**Premissa:** Vitest já configurado (`reflect-metadata` setup + env dummy de DB). Se a branch base não tiver isso, replicar a config primeiro.

---

## File Structure

| Arquivo | Papel |
|---|---|
| `src/database/entities/order.entity.ts` | Entity `Order` + `ORDER_STATUS`/`OrderStatus` |
| `src/database/typeorm/data-source.ts` (mod) | Registrar `Order` em `entities` |
| `src/dtos/order-status.dto.ts` | Schemas Zod: params, response, 404 + tipo |
| `src/database/repositories/orders-repository.d.ts` | Abstração `OrdersRepository` |
| `src/database/repositories/typeorm-orders-repository.ts` | Impl TypeORM (`findOneBy`) |
| `src/http/controllers/orders/get-order-status.service.ts` | Service |
| `src/http/controllers/orders/get-order-status.controller.ts` | Rota, DI, 404 |
| `src/http/routes.ts` (mod) | Registrar o controller |

---

## Task 1: Entity Order + enum + registrar no data-source

**Files:**
- Create: `src/database/entities/order.entity.ts`
- Modify: `src/database/typeorm/data-source.ts`

- [ ] **Step 1: Criar a entity**

`src/database/entities/order.entity.ts`:
```ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

export const ORDER_STATUS = ['PENDING', 'FAILED', 'PROCESSED'] as const

export type OrderStatus = (typeof ORDER_STATUS)[number]

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'enum', enum: ORDER_STATUS, enumName: 'orders_status_enum' })
  status!: OrderStatus

  @Column({ type: 'varchar', length: 100 })
  user!: string
}
```

- [ ] **Step 2: Registrar a entity no data-source**

Em `src/database/typeorm/data-source.ts`: adicionar o import `import { Order } from '@/database/entities/order.entity.js'` (junto dos imports `@/`) e incluir `Order` no array `entities` de `getDataSourceOptions()` (ex: `entities: [Product, Order]`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `No errors found`.

- [ ] **Step 4: Commit**

```bash
git add src/database/entities/order.entity.ts src/database/typeorm/data-source.ts
git commit -m "feat(orders): add Order entity and register in data source"
```

---

## Task 2: DTOs (Zod)

**Files:**
- Create: `src/dtos/order-status.dto.ts`
- Test: `src/dtos/order-status.dto.test.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

`src/dtos/order-status.dto.test.ts`:
```ts
import { orderStatusParamsSchema, orderStatusResponseSchema } from './order-status.dto.js'

describe('order-status dto', () => {
  it('aceita idOrder uuid válido', () => {
    const parsed = orderStatusParamsSchema.parse({ idOrder: '11111111-1111-4111-8111-111111111111' })

    expect(parsed.idOrder).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('rejeita idOrder não-uuid', () => {
    expect(() => orderStatusParamsSchema.parse({ idOrder: 'abc' })).toThrow()
  })

  it('valida resposta com status do enum', () => {
    const parsed = orderStatusResponseSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'PENDING',
    })

    expect(parsed.status).toBe('PENDING')
  })

  it('rejeita status fora do enum', () => {
    expect(() =>
      orderStatusResponseSchema.parse({ id: '11111111-1111-4111-8111-111111111111', status: 'DONE' }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/dtos/order-status.dto.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o DTO**

`src/dtos/order-status.dto.ts`:
```ts
import { z } from 'zod'

import { ORDER_STATUS } from '@/database/entities/order.entity.js'

export const orderStatusParamsSchema = z.object({
  idOrder: z.uuid(),
})

export const orderStatusResponseSchema = z.object({
  id: z.uuid(),
  status: z.enum(ORDER_STATUS),
})

export const orderNotFoundSchema = z.object({
  message: z.string(),
})

export type OrderStatusResponse = z.infer<typeof orderStatusResponseSchema>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- --run src/dtos/order-status.dto.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/dtos/order-status.dto.ts src/dtos/order-status.dto.test.ts
git commit -m "feat(orders): add order-status dtos"
```

---

## Task 3: OrdersRepository (abstração + impl)

**Files:**
- Create: `src/database/repositories/orders-repository.d.ts`
- Create: `src/database/repositories/typeorm-orders-repository.ts`
- Test: `src/database/repositories/typeorm-orders-repository.test.ts`

- [ ] **Step 1: Criar a abstração**

`src/database/repositories/orders-repository.d.ts`:
```ts
import type { Order } from '@/database/entities/order.entity.js'

export interface OrdersRepository {
  findById(id: string): Promise<Order | null>
}
```

- [ ] **Step 2: Escrever o teste (falhando)**

`src/database/repositories/typeorm-orders-repository.test.ts`:
```ts
import { TypeOrmOrdersRepository } from './typeorm-orders-repository.js'

import type { DataSource } from 'typeorm'

describe('TypeOrmOrdersRepository.findById', () => {
  it('chama findOneBy com o id e retorna o pedido', async () => {
    let receivedWhere: unknown
    const order = { id: 'o1', status: 'PENDING', user: 'john' }
    const dataSource = {
      getRepository: () => ({
        findOneBy: async (where: unknown) => {
          receivedWhere = where

          return order
        },
      }),
    } as unknown as DataSource

    const result = await new TypeOrmOrdersRepository(dataSource).findById('o1')

    expect(receivedWhere).toEqual({ id: 'o1' })
    expect(result).toBe(order)
  })

  it('retorna null quando não acha', async () => {
    const dataSource = {
      getRepository: () => ({ findOneBy: async () => null }),
    } as unknown as DataSource

    const result = await new TypeOrmOrdersRepository(dataSource).findById('missing')

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- --run src/database/repositories/typeorm-orders-repository.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar o repository**

`src/database/repositories/typeorm-orders-repository.ts`:
```ts
import type { DataSource } from 'typeorm'

import { Order } from '@/database/entities/order.entity.js'

import type { OrdersRepository } from './orders-repository.js'

export class TypeOrmOrdersRepository implements OrdersRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findById(id: string): Promise<Order | null> {
    return this.dataSource.getRepository(Order).findOneBy({ id })
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- --run src/database/repositories/typeorm-orders-repository.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add src/database/repositories/orders-repository.d.ts src/database/repositories/typeorm-orders-repository.ts src/database/repositories/typeorm-orders-repository.test.ts
git commit -m "feat(orders): add orders repository with findById"
```

---

## Task 4: GetOrderStatusService

**Files:**
- Create: `src/http/controllers/orders/get-order-status.service.ts`
- Test: `src/http/controllers/orders/get-order-status.service.test.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

`src/http/controllers/orders/get-order-status.service.test.ts`:
```ts
import { GetOrderStatusService } from './get-order-status.service.js'

import type { OrdersRepository } from '@/database/repositories/orders-repository.js'

describe('GetOrderStatusService', () => {
  it('retorna id + status quando o pedido existe', async () => {
    const repository: OrdersRepository = {
      findById: async () => ({ id: 'o1', status: 'PROCESSED', user: 'john' }),
    }

    const result = await new GetOrderStatusService(repository).getStatus('o1')

    expect(result).toEqual({ id: 'o1', status: 'PROCESSED' })
  })

  it('retorna null quando o pedido não existe', async () => {
    const repository: OrdersRepository = {
      findById: async () => null,
    }

    const result = await new GetOrderStatusService(repository).getStatus('missing')

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/http/controllers/orders/get-order-status.service.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o service**

`src/http/controllers/orders/get-order-status.service.ts`:
```ts
import type { OrdersRepository } from '@/database/repositories/orders-repository.js'
import type { OrderStatusResponse } from '@/dtos/order-status.dto.js'

export class GetOrderStatusService {
  constructor(private readonly repository: OrdersRepository) {}

  async getStatus(id: string): Promise<OrderStatusResponse | null> {
    const order = await this.repository.findById(id)

    if (!order) return null

    return { id: order.id, status: order.status }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- --run src/http/controllers/orders/get-order-status.service.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/http/controllers/orders/get-order-status.service.ts src/http/controllers/orders/get-order-status.service.test.ts
git commit -m "feat(orders): add get order status service"
```

---

## Task 5: Controller + rota + wiring

**Files:**
- Create: `src/http/controllers/orders/get-order-status.controller.ts`
- Modify: `src/http/routes.ts`

- [ ] **Step 1: Implementar o controller**

`src/http/controllers/orders/get-order-status.controller.ts`:
```ts
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { swaggerTags } from '@/config/swagger/index.js'
import { TypeOrmOrdersRepository } from '@/database/repositories/typeorm-orders-repository.js'
import { dataSource } from '@/database/typeorm/data-source.js'
import { orderNotFoundSchema, orderStatusParamsSchema, orderStatusResponseSchema } from '@/dtos/order-status.dto.js'

import { GetOrderStatusService } from './get-order-status.service.js'

import type { OrdersRepository } from '@/database/repositories/orders-repository.js'

export function getOrderStatusController(
  app: FastifyInstance,
  repository: OrdersRepository = new TypeOrmOrdersRepository(dataSource),
): void {
  const service = new GetOrderStatusService(repository)

  app.withTypeProvider<ZodTypeProvider>().get(
    '/v1/orders/:idOrder/status',
    {
      schema: {
        tags: [swaggerTags.ORDERS],
        summary: 'Get order status',
        params: orderStatusParamsSchema,
        response: {
          200: orderStatusResponseSchema,
          404: orderNotFoundSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await service.getStatus(request.params.idOrder)

      if (!result) {
        return reply.status(404).send({ message: 'Order not found' })
      }

      return result
    },
  )
}
```

- [ ] **Step 2: Registrar nas rotas**

Em `src/http/routes.ts`: adicionar `import { getOrderStatusController } from './controllers/orders/get-order-status.controller.js'` e, dentro de `registerRoutes`, chamar `getOrderStatusController(app)`.

- [ ] **Step 3: Typecheck + suíte completa**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: tsc `No errors found`; todos os testes passam.

- [ ] **Step 4: Commit**

```bash
git add src/http/controllers/orders/get-order-status.controller.ts src/http/routes.ts
git commit -m "feat(orders): add GET /v1/orders/:idOrder/status endpoint"
```

---

## Code review final

Após todas as tasks (modo subagent): code review da branch + suíte de testes verde. Ver `tasks.md`.
