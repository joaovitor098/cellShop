# order-status — Tasks

Checklist de execução do `plan.md`. Cada task = 1 commit. Modo subagent (subagent-driven-development), review entre tasks. Marcar o check ao concluir cada task. **Não executar até validação do usuário.**

- [ ] **Task 1 — Entity Order + enum** (`order.entity.ts`, `ORDER_STATUS`/`OrderStatus`) + registrar em `data-source.ts` (`entities`).
- [ ] **Task 2 — DTOs Zod** (`order-status.dto.ts`): params (`idOrder` uuid) + response (`{id,status}`) + 404. Teste de uuid/enum.
- [ ] **Task 3 — OrdersRepository** (abstração `.d.ts` + impl `findOneBy`). Teste com dataSource mockado.
- [ ] **Task 4 — GetOrderStatusService**: achou → `{id,status}`, não achou → `null`. Teste com repo mockado.
- [ ] **Task 5 — Controller + rota + wiring**: `GET /v1/orders/:idOrder/status`, DI, validação Zod params/response, tag Swagger, `null → 404`; registrar em `routes.ts`. Typecheck + suíte completa.

## Pós-execução

- [ ] **Code review** da branch (modo subagent).
- [ ] **Testes** verdes (`npm test -- --run`).

## Escopo (não fazer além disso)

Só o que está no `plan.md`. Fora: cache, listagem de pedidos, CRUD/transições de status, auth, teste HTTP/e2e do controller.
