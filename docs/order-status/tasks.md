# order-status — Tasks

Checklist de execução do `plan.md`. Cada task = 1 commit. Modo subagent (subagent-driven-development), review entre tasks. Marcar o check ao concluir cada task. **Não executar até validação do usuário.**

- [x] **Task 1 — Entity Order + enum** (`order.entity.ts`, `ORDER_STATUS`/`OrderStatus`) + registrar em `data-source.ts` (`entities`).
- [x] **Task 2 — DTOs Zod** (`order-status.dto.ts`): params (`idOrder` uuid) + response (`{id,status}`) + 404. Teste de uuid/enum.
- [x] **Task 3 — OrdersRepository** (abstração `.d.ts` + impl `findOneBy`). Teste com dataSource mockado.
- [x] **Task 4 — GetOrderStatusService**: achou → `{id,status}`, não achou → `null`. Teste com repo mockado.
- [x] **Task 5 — Controller + rota + wiring**: `GET /v1/orders/:idOrder/status`, DI, validação Zod params/response, tag Swagger, `null → 404`; registrar em `routes.ts`. Typecheck + suíte completa.

## Pós-execução

- [x] **Code review** da branch (modo subagent) — ready to merge, sem issues críticos.
- [x] **Testes** verdes (`npm test -- --run`) — 15 testes, 6 arquivos.

## Escopo (não fazer além disso)

Só o que está no `plan.md`. Fora: cache, listagem de pedidos, CRUD/transições de status, auth, teste HTTP/e2e do controller.
