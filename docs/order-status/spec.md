# Spec — order-status

`GET /v1/orders/:idOrder/status` — retorna o status de um pedido já cadastrado.

## Objetivo

Endpoint de leitura do status de um pedido, por id, seguindo a arquitetura em camadas do projeto (controller → service → repository). Sem cache (status é mutável).

## Requisitos

### Funcionais

- `GET /v1/orders/:idOrder/status` retorna `{ id, status }` do pedido.
- `status` é um de `PENDING | FAILED | PROCESSED` (enum da tabela `orders`).
- Pedido inexistente → `404`.
- `idOrder` inválido (não-uuid) → `400`.

### Não-funcionais

- **Sem cache** — status muda ao longo do ciclo do pedido; a query vai direto ao banco.
- Validação de entrada (params) e saída por Zod.
- Documentado no Swagger (`/docs`), tag `Orders`.

## Contrato HTTP

**Request:** `GET /v1/orders/:idOrder/status` — `idOrder` validado como uuid.

**200:**
```json
{ "id": "uuid", "status": "PENDING" }
```

**404** (pedido não existe):
```json
{ "message": "Order not found" }
```

**400** — `idOrder` não é uuid (validatorCompiler Zod).

## Arquitetura

Camadas (CLAUDE.md): `controller → service → repository (abstração)`. Só o controller instancia classes e injeta no service. O service depende da abstração.

| Unidade | Local | Responsabilidade |
|---|---|---|
| `Order` (entity decorator) | `src/database/entities/order.entity.ts` | Mapeia `orders` (id uuid, status enum, user varchar 100). Exporta `ORDER_STATUS` + `OrderStatus`. Tipo explícito nos `@Column`. |
| `OrdersRepository` (abstração) | `src/database/repositories/orders-repository.d.ts` | `findById(id) → Promise<Order \| null>`. |
| `TypeOrmOrdersRepository` (impl) | `src/database/repositories/typeorm-orders-repository.ts` | `dataSource.getRepository(Order).findOneBy({ id })`. Sem `.cache()`. |
| `GetOrderStatusService` | `src/http/controllers/orders/get-order-status.service.ts` | `getStatus(id)` → `{ id, status }` ou `null` se não achar. |
| DTOs (Zod) | `src/dtos/order-status.dto.ts` | params (`idOrder` uuid), resposta (`{ id, status }`), erro 404. |
| `getOrderStatusController` | `src/http/controllers/orders/get-order-status.controller.ts` | Rota, DI, validação Zod params/response, tag `Orders`, traduz `null → 404`. |
| Wiring | `src/http/routes.ts` | Registra `getOrderStatusController`. |

### Status enum

`ORDER_STATUS = ['PENDING','FAILED','PROCESSED'] as const` + `type OrderStatus`, definidos na entity e reusados pelo DTO (`z.enum(ORDER_STATUS)`). A coluna usa `@Column({ type:'enum', enum: ORDER_STATUS, enumName: 'orders_status_enum' })` (casa o tipo criado pela migration).

### Fluxo

1. `GET /v1/orders/:idOrder/status`.
2. Controller valida o param (Zod) → `idOrder`.
3. `GetOrderStatusService.getStatus(idOrder)`:
   - `repository.findById(idOrder)`.
   - `null` → service retorna `null`; senão `{ id, status }`.
4. Controller: `null` → `404`; senão retorna o objeto (serializer Zod valida).

## Error handling

- param não-uuid → `400` (validatorCompiler Zod).
- pedido inexistente → `404` (`{ message }`).
- erro no banco → `500`.

## Testes (unitários — sem e2e/HTTP)

- **DTO**: params rejeita não-uuid; response valida `{ id, status }`; enum rejeita status inválido.
- **Repository**: `findById` chama `findOneBy({ id })` e retorna order/`null` (dataSource mockado).
- **Service**: achou → `{ id, status }`; não achou (repo `null`) → `null`.

## Fora de escopo

- Cache.
- Listagem de pedidos / outros campos do pedido.
- Criação/atualização de pedidos, transições de status.
- Autenticação/autorização (projeto não tem auth).
- Teste HTTP/e2e do controller.

## Premissas

- Tabela `orders` e o tipo `orders_status_enum` já existem (migration `create-orders`).
- Decorators do TypeORM habilitados; `reflect-metadata` importado nos entrypoints.
- Vitest configurado (globals, `reflect-metadata` setup, env dummy de DB).
