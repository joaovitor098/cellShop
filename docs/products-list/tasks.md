# products-list — Tasks

Checklist de execução do `plan.md`. Cada task = 1 commit. Executar em modo subagent (subagent-driven-development), com review entre tasks. **Não executar até validação do usuário.**

- [ ] **Task 1 — Configurar Vitest** (`vitest.config.ts`): `setupFiles: ['reflect-metadata']` + `env` dummy de DB.
- [ ] **Task 2 — DTOs Zod** (`src/dtos/`): `listProductsQuerySchema` (page/limit) + `productSchema`/`paginatedProductsSchema`. Teste de defaults/coerção/bounds.
- [ ] **Task 3 — Entity Product** (`src/database/entities/product.entity.ts`) + registrar em `data-source.ts` (`entities: [Product]`, `cache.ignoreErrors: true`).
- [ ] **Task 4 — ProductsRepository** (abstração `.d.ts` + impl TypeORM com `.cache()`). Teste de orderBy/skip/take/cache-key.
- [ ] **Task 5 — ListProductsService**: monta `{ data, pagination }` (`totalPages = ceil(total/limit)`). Teste com repo mockado.
- [ ] **Task 6 — Controller + rota + endpoint test**: `GET /v1/products`, DI, validação Zod in/out, tag Swagger; registrar em `routes.ts`. Teste `app.inject` (contrato, defaults, 400).

## Pós-execução

- [ ] **Validação manual** (opcional): `docker compose up` + `curl /v1/products?page=1&limit=5` → 100 produtos no seed; conferir `/docs`.
- [ ] **Code review** da branch (modo subagent).
- [ ] **Testes do endpoint** rodando verdes (`npm test -- --run`).

## Escopo (não fazer além disso)

Só o que está no `plan.md`. Fora: estoque na resposta, SWR/lock, filtros/busca, cursor pagination, CRUD de produtos.
