# products-list Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor `GET /v1/products` paginado e cacheado, listando produtos já cadastrados.

**Architecture:** Camadas controller → service → repository (abstração). Entity TypeORM com decorators (tipos explícitos). Cache via `.cache()` do TypeORM (cache de query padrão sobre ioredis). Validação de entrada/saída por Zod.

**Tech Stack:** Fastify, TypeORM 0.3, Postgres, Zod 4, fastify-type-provider-zod, Vitest, tsx (ESM nodenext).

---

## File Structure

| Arquivo | Papel |
|---|---|
| `src/database/entities/product.entity.ts` | Entity `Product` (decorators, tipo explícito) |
| `src/database/typeorm/data-source.ts` (mod) | Registrar `Product` em `entities`; `cache.ignoreErrors: true` |
| `src/dtos/list-products-query.dto.ts` | Schema Zod da query (page/limit) + tipo |
| `src/dtos/products-response.dto.ts` | Schemas Zod product + resposta paginada + tipos |
| `src/database/repositories/products-repository.d.ts` | Abstração `ProductsRepository` |
| `src/database/repositories/typeorm-products-repository.ts` | Impl TypeORM com `.cache()` |
| `src/http/controllers/products/list-products.service.ts` | Service: monta DTO paginado |
| `src/http/controllers/products/list-products.controller.ts` | Rota, DI, validação Zod, tag Swagger |
| `src/http/routes.ts` (mod) | Registrar o controller |
| `vitest.config.ts` (mod) | `setupFiles: reflect-metadata` + `env` dummy de DB pros testes |

---

## Task 1: Configurar Vitest para os testes da feature

Os módulos da feature importam `data-source` (que roda `env.parse`) e entities com decorators (precisam de `reflect-metadata`). Configurar o Vitest pra suprir os dois.

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Atualizar a config**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: 'node',
    // reflect-metadata antes de qualquer entity com decorator.
    setupFiles: ['reflect-metadata'],
    // env dummy: env.parse (importado via data-source) exige DATABASE_*.
    // O DataSource é só construído nos testes, nunca conectado.
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'test',
      DATABASE_PASSWORD: 'test',
      DATABASE_NAME: 'test',
    },
  },
})
```

- [ ] **Step 2: Rodar a suíte (atual) pra confirmar que a config carrega**

Run: `npm test -- --run`
Expected: vitest inicia sem erro de config (0 testes ou os existentes passam).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: configure vitest env and reflect-metadata for db modules"
```

---

## Task 2: DTOs (Zod) de query e resposta

**Files:**
- Create: `src/dtos/list-products-query.dto.ts`
- Create: `src/dtos/products-response.dto.ts`
- Test: `src/dtos/list-products-query.dto.test.ts`

- [ ] **Step 1: Escrever o teste da query (falhando)**

`src/dtos/list-products-query.dto.test.ts`:
```ts
import { listProductsQuerySchema } from './list-products-query.dto.js'

describe('listProductsQuerySchema', () => {
  it('aplica defaults page=1 limit=20', () => {
    expect(listProductsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 })
  })

  it('coage strings da query', () => {
    expect(listProductsQuerySchema.parse({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50 })
  })

  it('rejeita limit > 100', () => {
    expect(() => listProductsQuerySchema.parse({ limit: 101 })).toThrow()
  })

  it('rejeita page < 1', () => {
    expect(() => listProductsQuerySchema.parse({ page: 0 })).toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/dtos/list-products-query.dto.test.ts`
Expected: FAIL — `Cannot find module './list-products-query.dto.js'`.

- [ ] **Step 3: Implementar o schema da query**

`src/dtos/list-products-query.dto.ts`:
```ts
import { z } from 'zod'

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>
```

- [ ] **Step 4: Implementar o schema da resposta**

`src/dtos/products-response.dto.ts`:
```ts
import { z } from 'zod'

export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  price: z.number().int(),
})

export const paginatedProductsSchema = z.object({
  data: z.array(productSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

export type ProductDto = z.infer<typeof productSchema>
export type PaginatedProducts = z.infer<typeof paginatedProductsSchema>
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- --run src/dtos/list-products-query.dto.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add src/dtos/list-products-query.dto.ts src/dtos/products-response.dto.ts src/dtos/list-products-query.dto.test.ts
git commit -m "feat(products): add list query and response dtos"
```

---

## Task 3: Entity Product + registrar no data-source

**Files:**
- Create: `src/database/entities/product.entity.ts`
- Modify: `src/database/typeorm/data-source.ts`

- [ ] **Step 1: Criar a entity (decorators, tipo explícito)**

`src/database/entities/product.entity.ts`:
```ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ type: 'integer' })
  price!: number
}
```

- [ ] **Step 2: Registrar a entity e flipar ignoreErrors no data-source**

Em `src/database/typeorm/data-source.ts`:

Adicionar o import (junto dos demais imports `@/`):
```ts
import { Product } from '@/database/entities/product.entity.js'
```

No `cacheOptions`, trocar `ignoreErrors: false` por:
```ts
  ignoreErrors: true,
```

Em `getDataSourceOptions()`, trocar `entities: []` por:
```ts
    entities: [Product],
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: `No errors found`.

- [ ] **Step 4: Commit**

```bash
git add src/database/entities/product.entity.ts src/database/typeorm/data-source.ts
git commit -m "feat(products): add Product entity and register in data source"
```

---

## Task 4: ProductsRepository (abstração + impl TypeORM)

**Files:**
- Create: `src/database/repositories/products-repository.d.ts`
- Create: `src/database/repositories/typeorm-products-repository.ts`
- Test: `src/database/repositories/typeorm-products-repository.test.ts`

- [ ] **Step 1: Criar a abstração**

`src/database/repositories/products-repository.d.ts`:
```ts
import type { Product } from '@/database/entities/product.entity.js'

export interface FindPaginatedParams {
  page: number
  limit: number
}

export interface PaginatedProductsResult {
  items: Product[]
  total: number
}

export interface ProductsRepository {
  findPaginated(params: FindPaginatedParams): Promise<PaginatedProductsResult>
}
```

- [ ] **Step 2: Escrever o teste da impl (falhando)**

`src/database/repositories/typeorm-products-repository.test.ts`:
```ts
import { TypeOrmProductsRepository } from './typeorm-products-repository.js'

import type { DataSource } from 'typeorm'

describe('TypeOrmProductsRepository.findPaginated', () => {
  it('aplica orderBy/skip/take/cache e retorna items+total', async () => {
    const calls: Record<string, unknown> = {}
    const qb = {
      orderBy: (field: string, dir: string) => ((calls.orderBy = [field, dir]), qb),
      skip: (n: number) => ((calls.skip = n), qb),
      take: (n: number) => ((calls.take = n), qb),
      cache: (key: string, ttl: number) => ((calls.cache = [key, ttl]), qb),
      getManyAndCount: async () => [[{ id: 'a', name: 'X', price: 1 }], 42],
    }
    const dataSource = {
      getRepository: () => ({ createQueryBuilder: () => qb }),
    } as unknown as DataSource

    const result = await new TypeOrmProductsRepository(dataSource).findPaginated({ page: 3, limit: 10 })

    expect(calls.orderBy).toEqual(['product.name', 'ASC'])
    expect(calls.skip).toBe(20) // (3-1)*10
    expect(calls.take).toBe(10)
    expect(calls.cache).toEqual(['products:list:page:3:limit:10', expect.any(Number)])
    expect(result).toEqual({ items: [{ id: 'a', name: 'X', price: 1 }], total: 42 })
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- --run src/database/repositories/typeorm-products-repository.test.ts`
Expected: FAIL — módulo `./typeorm-products-repository.js` não existe.

- [ ] **Step 4: Implementar o repository**

`src/database/repositories/typeorm-products-repository.ts`:
```ts
import type { DataSource } from 'typeorm'

import { env } from '@/config/env/index.js'
import { Product } from '@/database/entities/product.entity.js'

import type {
  FindPaginatedParams,
  PaginatedProductsResult,
  ProductsRepository,
} from './products-repository.js'

export class TypeOrmProductsRepository implements ProductsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findPaginated({ page, limit }: FindPaginatedParams): Promise<PaginatedProductsResult> {
    const [items, total] = await this.dataSource
      .getRepository(Product)
      .createQueryBuilder('product')
      .orderBy('product.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .cache(`products:list:page:${page}:limit:${limit}`, env.CACHE_TTL_MS)
      .getManyAndCount()

    return { items, total }
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- --run src/database/repositories/typeorm-products-repository.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database/repositories/products-repository.d.ts src/database/repositories/typeorm-products-repository.ts src/database/repositories/typeorm-products-repository.test.ts
git commit -m "feat(products): add products repository with cached paginated query"
```

---

## Task 5: ListProductsService

**Files:**
- Create: `src/http/controllers/products/list-products.service.ts`
- Test: `src/http/controllers/products/list-products.service.test.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

`src/http/controllers/products/list-products.service.test.ts`:
```ts
import { ListProductsService } from './list-products.service.js'

import type { ProductsRepository } from '@/database/repositories/products-repository.js'

describe('ListProductsService', () => {
  it('monta data + pagination com totalPages calculado', async () => {
    const repository: ProductsRepository = {
      findPaginated: async () => ({ items: [{ id: 'a', name: 'X', price: 100 }], total: 100 }),
    }

    const result = await new ListProductsService(repository).list(2, 20)

    expect(result.pagination).toEqual({ page: 2, limit: 20, total: 100, totalPages: 5 })
    expect(result.data).toEqual([{ id: 'a', name: 'X', price: 100 }])
  })

  it('totalPages = 0 quando não há produtos', async () => {
    const repository: ProductsRepository = {
      findPaginated: async () => ({ items: [], total: 0 }),
    }

    const result = await new ListProductsService(repository).list(1, 20)

    expect(result.pagination.totalPages).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/http/controllers/products/list-products.service.test.ts`
Expected: FAIL — módulo `./list-products.service.js` não existe.

- [ ] **Step 3: Implementar o service**

`src/http/controllers/products/list-products.service.ts`:
```ts
import type { ProductsRepository } from '@/database/repositories/products-repository.js'
import type { PaginatedProducts } from '@/dtos/products-response.dto.js'

export class ListProductsService {
  constructor(private readonly repository: ProductsRepository) {}

  async list(page: number, limit: number): Promise<PaginatedProducts> {
    const { items, total } = await this.repository.findPaginated({ page, limit })

    return {
      data: items.map(item => ({ id: item.id, name: item.name, price: item.price })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- --run src/http/controllers/products/list-products.service.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/http/controllers/products/list-products.service.ts src/http/controllers/products/list-products.service.test.ts
git commit -m "feat(products): add list products service with pagination"
```

---

## Task 6: Controller + rota + teste de endpoint

**Files:**
- Create: `src/http/controllers/products/list-products.controller.ts`
- Modify: `src/http/routes.ts`
- Test: `src/http/controllers/products/list-products.controller.test.ts`

- [ ] **Step 1: Escrever o teste de endpoint (falhando)**

`src/http/controllers/products/list-products.controller.test.ts`:
```ts
import fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { listProductsController } from './list-products.controller.js'

import type { ProductsRepository } from '@/database/repositories/products-repository.js'

function buildApp(repository: ProductsRepository) {
  const app = fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  listProductsController(app, repository)

  return app
}

describe('GET /v1/products', () => {
  it('retorna produtos paginados com pagination', async () => {
    const app = buildApp({
      findPaginated: async () => ({
        items: [{ id: '11111111-1111-1111-1111-111111111111', name: 'X', price: 100 }],
        total: 40,
      }),
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/v1/products?page=2&limit=20' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      data: [{ id: '11111111-1111-1111-1111-111111111111', name: 'X', price: 100 }],
      pagination: { page: 2, limit: 20, total: 40, totalPages: 2 },
    })

    await app.close()
  })

  it('aplica defaults quando sem query', async () => {
    const app = buildApp({ findPaginated: async () => ({ items: [], total: 0 }) })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/v1/products' })

    expect(res.statusCode).toBe(200)
    expect(res.json().pagination).toMatchObject({ page: 1, limit: 20 })

    await app.close()
  })

  it('400 quando limit > 100', async () => {
    const app = buildApp({ findPaginated: async () => ({ items: [], total: 0 }) })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/v1/products?limit=101' })

    expect(res.statusCode).toBe(400)

    await app.close()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/http/controllers/products/list-products.controller.test.ts`
Expected: FAIL — módulo `./list-products.controller.js` não existe.

- [ ] **Step 3: Implementar o controller**

`src/http/controllers/products/list-products.controller.ts`:
```ts
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { swaggerTags } from '@/config/swagger/index.js'
import { TypeOrmProductsRepository } from '@/database/repositories/typeorm-products-repository.js'
import { dataSource } from '@/database/typeorm/data-source.js'
import { listProductsQuerySchema } from '@/dtos/list-products-query.dto.js'
import { paginatedProductsSchema } from '@/dtos/products-response.dto.js'

import { ListProductsService } from './list-products.service.js'

import type { ProductsRepository } from '@/database/repositories/products-repository.js'

export function listProductsController(
  app: FastifyInstance,
  // DI: default usa o repo real; testes injetam um fake.
  repository: ProductsRepository = new TypeOrmProductsRepository(dataSource),
): void {
  const service = new ListProductsService(repository)

  app.withTypeProvider<ZodTypeProvider>().get(
    '/v1/products',
    {
      schema: {
        tags: [swaggerTags.PRODUCTS],
        summary: 'Lista produtos paginados',
        querystring: listProductsQuerySchema,
        response: {
          200: paginatedProductsSchema,
        },
      },
    },
    async request => {
      const { page, limit } = request.query

      return service.list(page, limit)
    },
  )
}
```

- [ ] **Step 4: Registrar o controller nas rotas**

Em `src/http/routes.ts`, adicionar o import:
```ts
import { listProductsController } from './controllers/products/list-products.controller.js'
```

E dentro de `registerRoutes`, após `healthCheckController(app)`:
```ts
  listProductsController(app)
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- --run src/http/controllers/products/list-products.controller.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Typecheck + suíte completa**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: tsc `No errors found`; todos os testes passam.

- [ ] **Step 7: Commit**

```bash
git add src/http/controllers/products/list-products.controller.ts src/http/controllers/products/list-products.controller.test.ts src/http/routes.ts
git commit -m "feat(products): add GET /v1/products paginated endpoint"
```

---

## Validação manual (opcional, pós-execução)

Subir o stack (`docker compose up`) e bater no endpoint, confirmando dados reais do seed:

```bash
curl 'http://localhost:3333/v1/products?page=1&limit=5'
```
Esperado: `200` com 5 produtos + `pagination.total = 100`. Conferir `/docs` mostrando `GET /v1/products` na tag Products.

---

## Code review final + testes

Após todas as tasks (em modo subagent): rodar code review da branch e a suíte de testes do endpoint, conforme pedido. Ver `tasks.md`.
