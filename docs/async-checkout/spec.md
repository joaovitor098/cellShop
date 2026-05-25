# Spec — async-checkout

Checkout assíncrono: `POST /v1/orders/checkout` reserva estoque (atomic update condicional), salva o pedido, publica na fila e responde `202` com o `orderId`. Um worker consome a fila, finaliza o estoque e o pedido, com idempotência via Redis.

## Objetivo

Desacoplar o processamento do pedido do fluxo síncrono da API: o checkout reserva estoque e enfileira; o worker confirma de forma assíncrona e idempotente. Todo o fluxo loga cada ação com contexto (`reqId`, `idempotencyKey`, `orderId`, `productId`, `stock`).

## Decisões

- `user` do pedido = header `x-request-id` (= `reqId` = `correlationId`).
- **Publish após commit** (sem outbox): transação DB (reserva + pedido) → commit → publica na fila.
- Estoque insuficiente → **409**.
- **amqplib** como cliente RabbitMQ. `dataSource.initialize()` finalmente wirado no boot (server e worker).
- **Worker = processo separado** (`src/start-worker.ts`) + serviço `worker` no docker-compose.
- **Testes de integração** (Postgres + Redis reais via compose) para concorrência (reserva atômica) e idempotência; unit para services/dtos.

## Contrato HTTP

`POST /v1/orders/checkout`

- Header `idempotency-key`: uuid (obrigatório; inválido/ausente → 400).
- Header `x-request-id`: usado como `user`/`correlationId` (o Fastify já gera via `genReqId`).
- Body: `{ "productId": "uuid", "quantity": int >= 1 }`.

Respostas:
- **202** `{ "orderId": "uuid" }` — reserva ok, pedido salvo, mensagem publicada.
- **202** (idempotente) — `idempotency-key` repetida → retorna o `orderId` já existente, sem re-reservar.
- **409** `{ "message": "Insufficient stock" }` — reserva atômica falhou.
- **400** — header/body inválidos.

## Reserva e confirmação de estoque (atomic update condicional)

Tabela `stocks` (id, product_id, quantity, reserved).

- **Reserva (checkout):**
  ```sql
  UPDATE stocks SET reserved = reserved + $q
  WHERE product_id = $p AND quantity - reserved >= $q
  ```
  `affected = 1` → reservado; `affected = 0` → sem disponibilidade (409). Concorrência segura: o `WHERE` condicional + atomicidade do UPDATE evitam overselling.

- **Confirmação (worker):**
  ```sql
  UPDATE stocks SET quantity = quantity - $q, reserved = reserved - $q
  WHERE product_id = $p AND reserved >= $q AND quantity >= $q
  ```
  `affected = 1` → estoque decrementado.

- `stockAvailability` = `quantity - reserved` (após a reserva) — vai na mensagem.

## Idempotência (Redis)

Chave `idempotency:{idempotency-key}` → JSON `{ status, orderId }`. TTL configurável (`IDEMPOTENCY_TTL_MS`, default 24h).

Estados: `PENDING` (criado no checkout) → `PROCESSING` (worker iniciou) → `PROCESSED` (worker concluiu).

- **Checkout:** se a chave já existe → retorna o `orderId` dela (idempotente). Senão, após o commit, cria `{ status: PENDING, orderId }`.
- **Worker:** lê a chave; `PROCESSED` → ack e segue; senão → seta `PROCESSING`, processa, ao final seta `PROCESSED`.

## Fila

- Cliente: amqplib. Conexão via `RABBITMQ_URL` (compose injeta).
- Fila durável `orders.checkout`.
- Mensagem:
  ```json
  {
    "correlationId": "<reqId>",
    "idempotencyKey": "<uuid>",
    "productId": "<uuid>",
    "reservedQuantity": 2,
    "stockAvailability": 48,
    "orderId": "<uuid>"
  }
  ```
  `productId` incluído (necessário pro worker decrementar o estoque correto).

## Logging

A classe `Logger` é generalizada para carregar contexto e ser usada no controller **e** no worker:
- Constrói com `(pinoLogger, context)`; `Logger.fromRequest(request)` para o HTTP.
- `context`: `{ reqId?, idempotencyKey?, orderId?, productId?, stock? }`; `child(extra)` acumula contexto.
- Cada ação do checkout/worker loga `logger.info('<ação>', ...)` com o contexto.
- No worker (sem request), usa uma instância pino própria (a partir de `loggerOptions.pinoOptions`), contexto com `correlationId/idempotencyKey/orderId`.

## Arquitetura (camadas)

Checkout: `controller → CheckoutService → { StocksRepository, OrdersRepository, IdempotencyStore, QueuePublisher }`. Só o controller instancia e injeta. Transação via `dataSource.transaction(manager => ...)`; repos aceitam um `EntityManager` opcional para participar da transação.

| Unidade | Local | Responsabilidade |
|---|---|---|
| `Logger` (refatorado) | `src/config/logger/logger.ts` | base pino + contexto; `fromRequest`; `child` |
| `redisClient` | `src/config/redis/index.ts` | ioredis singleton do app (do env) |
| `Stock` (entity) | `src/database/entities/stock.entity.ts` | mapeia `stocks` (id, productId, quantity, reserved) |
| `StocksRepository` (abstração + impl) | `src/database/repositories/` | `reserve(p,q,manager)`, `commitReservation(p,q,manager)`, `findAvailability(p,manager)` |
| `OrdersRepository` (estende) | `src/database/repositories/` | + `create(user,manager)`, `updateStatus(id,status,manager)` |
| `IdempotencyStore` | `src/database/idempotency/` | get/create/setStatus no Redis |
| `QueuePublisher` / `QueueConsumer` | `src/messaging/` | amqplib publish/consume |
| `CheckoutService` | `src/http/controllers/orders/checkout/` | orquestra reserva+pedido+idempotência, publica após commit |
| `checkoutController` | `src/http/controllers/orders/checkout/` | rota, DI, validação, logs, 202/409 |
| `processCheckoutMessage` | `src/worker/` | handler do consumer (idempotência, decremento, status, logs) |
| `start-worker.ts` | `src/start-worker.ts` | init dataSource + consumer |

## Error handling

- Header/body inválido → 400 (zod).
- Estoque insuficiente → 409.
- Erro no DB/transação → rollback → 500.
- Publish falha após commit → loga erro; pedido fica PENDING (reconciliável). Worker idempotente tolera retry/duplicata.
- Worker: erro no processamento → nack/requeue (com idempotência evitando dupla-baixa); `PROCESSED` no Redis impede reprocessar.

## Testes

### Integração (Postgres + Redis reais — compose rodando)
- **Concorrência da reserva:** estoque `quantity=N`; disparar `K > N` reservas paralelas de 1 unidade → exatamente `N` sucessos, resto 409; `reserved` final = `N` (sem overselling).
- **Idempotência do checkout:** mesma `idempotency-key` em 2 requests → 1 pedido criado, mesmo `orderId` retornado.
- **Worker:** processar mensagem → estoque decrementado, `order.status = PROCESSED`, chave Redis `PROCESSED`; reprocessar a mesma chave (`PROCESSED`) → no-op (sem dupla-baixa).

### Unit
- `CheckoutService` (repos/idempotency/publisher mockados): reserva ok → cria pedido + publica; reserva falha → 409, sem pedido/publish; idempotency-key existente → retorna orderId, sem reservar.
- `processCheckoutMessage` (mocks): `PROCESSED` → skip; novo → PROCESSING → decrementa → PROCESSED.
- DTOs: header uuid, body productId/quantity (bounds), response.

## Fora de escopo

- Outbox / mensageria transacional.
- Cancelamento/expiração de reserva, retry/backoff/DLQ avançado.
- Múltiplos itens por pedido (1 produto/quantidade por checkout).
- Autenticação.

## Premissas

- Tabelas `orders`, `stocks` e enum `orders_status_enum` já existem (migrations).
- `Order` entity já existe (feature order-status); será reutilizada/estendida no repo.
- Decorators TypeORM habilitados; Vitest configurado.
- docker-compose com postgres/redis/rabbitmq já existe.
