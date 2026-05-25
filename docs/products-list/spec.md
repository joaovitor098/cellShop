# Spec — products-list

GET `/v1/products` paginado, listando produtos já cadastrados, com as queries de produto cacheadas no Redis via o cache de query do TypeORM.

## Objetivo

Expor um endpoint de leitura do catálogo, paginado e cacheado, seguindo a arquitetura em camadas do projeto (controller → service → repository).

## Requisitos

### Funcionais

- `GET /v1/products?page=<n>&limit=<n>` retorna produtos paginados.
- Resposta inclui os dados e metadados de paginação.
- Campos por produto: `id`, `name`, `price` (em centavos). Sem JOIN com `stocks`.
- Ordenação estável por `name` ASC (determinística — necessária para paginação consistente e cache previsível).

### Não-funcionais

- Toda query de listagem de produtos é cacheada no Redis (via `.cache()` do TypeORM, cache de query padrão sobre ioredis).
- Resiliência: se o Redis cair, a query cai pro banco em vez de quebrar (`cache.ignoreErrors: true` no data-source).
- Validação de entrada e saída por Zod (validator/serializer compilers já configurados).
- Endpoint documentado no Swagger (`/docs`), tag `Products`.

## Contrato HTTP

**Request:** `GET /v1/products?page=1&limit=20`

Query (Zod, com coerção):
- `page`: inteiro ≥ 1, default `1`.
- `limit`: inteiro entre 1 e 100, default `20`.
- Query inválida → `400`.

**Response 200:**
```json
{
  "data": [
    { "id": "uuid", "name": "iPhone 15 128GB", "price": 699900 }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

- `total`: total de produtos (count).
- `totalPages`: `ceil(total / limit)`.

## Arquitetura

Camadas (CLAUDE.md): `controller → service → repository (abstração)`. Só o controller instancia classes e injeta no service. O service depende de abstrações.

| Unidade | Local | Responsabilidade |
|---|---|---|
| `Product` (entity decorator) | `src/database/entities/product.entity.ts` | Mapeia a tabela `products`. Decorators com **tipo explícito** em todo `@Column` (não depende de metadata inferido). |
| `ProductsRepository` (abstração) | `src/database/repositories/products-repository.d.ts` | Interface: `findPaginated(params) → Promise<{ items: Product[]; total: number }>`. |
| `TypeOrmProductsRepository` (impl) | `src/database/repositories/typeorm-products-repository.ts` | Implementa a abstração via `dataSource.getRepository(Product)` com queryBuilder (`skip`/`take`/`orderBy`) + count, aplicando `.cache(chave, ttl)`. |
| `ListProductsService` | `src/http/controllers/products/list-products.service.ts` | Recebe o repository (abstração) por DI. Chama `findPaginated`, monta o DTO paginado (`pagination`). |
| DTOs (Zod) | `src/dtos/` | `list-products-query.dto.ts` (page/limit) e `products-response.dto.ts` (product + paginated). Tipos inferidos via `z.infer`. |
| `listProductsController` | `src/http/controllers/products/list-products.controller.ts` | Registra a rota, instancia repo + service (DI), valida via schemas Zod, tag Swagger `Products`. |
| Wiring | `src/http/routes.ts` | Registra `listProductsController`. |

### Cache

- A query de listagem usa `.cache('products:list:page:{page}:limit:{limit}', env.CACHE_TTL_MS)`.
- Usa o cache de query padrão do TypeORM sobre ioredis (sem provider custom).
- Chave por página → cada combinação `(page, limit)` tem sua entrada.
- `data-source.ts`: alterar `cache.ignoreErrors` para `true` (resiliência a Redis-down).

### Fluxo

1. `GET /v1/products?page&limit`.
2. Controller valida a query (Zod) → `{ page, limit }`.
3. `ListProductsService.list(page, limit)`:
   - chama `repository.findPaginated({ page, limit })` (query cacheada).
   - monta `{ data, pagination }`.
4. Controller retorna; serializer Zod valida a resposta.

## Error handling

- Query inválida → `400` (validatorCompiler Zod).
- Erro no banco → `500`.
- Redis fora do ar → query cai pro banco (`ignoreErrors: true`), endpoint segue de pé.

## Testes

- **Repository** (`TypeOrmProductsRepository`): `findPaginated` aplica `orderBy`/`skip`/`take`/`.cache()` com a chave esperada e retorna `{ items, total }` (queryBuilder mockado).
- **Service** (`ListProductsService`): matemática da paginação (`totalPages`) e mapeamento, com repository mockado.
- **Endpoint** (`app.inject`, repository injetado/fake): contrato HTTP, validação de query (page/limit, defaults, limites), `pagination`, schema da resposta.

## Fora de escopo

- Estoque/`stocks` na resposta.
- Cache SWR / lock distribuído (descartado nesta versão).
- Filtros, busca, ordenação configurável.
- Cursor-based pagination.
- Criação/edição/remoção de produtos.

## Premissas

- Tabela `products` e seed já existem (migrations anteriores).
- Decorators do TypeORM habilitados; `reflect-metadata` importado nos entrypoints.
- Cache de query do TypeORM já provisionado (ioredis, `alwaysEnabled: false`); falta apenas usá-lo na query e flipar `ignoreErrors`.
