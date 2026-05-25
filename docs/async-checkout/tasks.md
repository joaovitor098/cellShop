# async-checkout — Tasks

Checklist de execução do `plan.md`. Cada task = 1 commit. Modo subagent, review entre tasks. Marcar o check ao concluir cada task. **Não executar até validação do usuário.** Testes de integração exigem o docker-compose rodando (Postgres/Redis/RabbitMQ).

- [ ] **Task 1 — Logger contextual**: `(pinoLog, context)` + `fromRequest` + `child`; atualizar uso em `logging-redis-cache`. Teste de merge de contexto.
- [ ] **Task 2 — env + redis client**: `RABBITMQ_URL`, `IDEMPOTENCY_TTL_MS`; `src/config/redis`; ajustar `vitest.config.ts` env pro compose.
- [ ] **Task 3 — Stock entity** + registrar em `data-source` (`entities`).
- [ ] **Task 4 — StocksRepository** (`reserve`/`commitReservation`/`findAvailability` atômicos). **Teste de integração: concorrência sem overselling.**
- [ ] **Task 5 — OrdersRepository** + `create` / `updateStatus`. Teste unit.
- [ ] **Task 6 — IdempotencyStore** (Redis). Teste de integração.
- [ ] **Task 7 — Fila amqplib**: conexão + publisher + tipo da mensagem (instalar `amqplib`/`@types`).
- [ ] **Task 8 — Checkout DTOs** (header idempotency-key, body, response, 409). Teste.
- [ ] **Task 9 — CheckoutService**: idempotência → reserva → pedido → publish após commit. **Loga cada ação** (logger injetado). Teste unit (reserva ok / 409 / idempotente).
- [ ] **Task 10 — checkoutController + rota + boot**: POST `/v1/orders/checkout` 202/409, DI, **log por ação**; wirar `dataSource.initialize()` + publisher no `start-server`.
- [ ] **Task 11 — Worker `processCheckoutMessage`**: idempotência (skip se PROCESSED) → PROCESSING → decremento atômico → order PROCESSED → idempotency PROCESSED. **Loga cada ação.** Teste unit.
- [ ] **Task 12 — start-worker.ts** + serviço `worker` no docker-compose + script `npm run worker`.
- [ ] **Task 13 — Integração do endpoint**: idempotência (mesma key → 1 pedido) + concorrência (sem overselling).

## Pós-execução

- [ ] **Code review** da branch (modo subagent).
- [ ] **Testes** verdes (`npm test -- --run`, com compose up).

## Escopo (não fazer além disso)

Só o que está no `plan.md`. Fora: outbox, cancelamento/expiração de reserva, DLQ, múltiplos itens por pedido, auth.

## Logging (requisito transversal)

**Cada ação** do checkout e do worker loga via `Logger` com contexto (`reqId`/`correlationId`, `idempotencyKey`, `orderId`, `productId`, `stock`): checkout → recebido, idempotência hit, reserva (ok/falha), pedido criado, mensagem publicada, aceito/409. Worker → recebido, já processado (skip), PROCESSING, decremento (ok/falha), pedido PROCESSED, idempotency PROCESSED.
