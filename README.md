# cellShop

Backend de desafio técnico que expõe um catálogo de produtos paginado e um fluxo de checkout assíncrono. Construído com **Fastify**, **TypeORM**, **PostgreSQL**, **Redis** e **RabbitMQ**: a API aceita o pedido, reserva o estoque atomicamente, persiste o pedido e publica uma mensagem numa fila — retornando 202 imediatamente. Um processo **worker** separado consome a fila e finaliza o processamento de forma idempotente. Migrations e seed (100 produtos) executam automaticamente no boot.

---

## Como rodar

Tudo roda em containers — **não é necessário ter Node instalado localmente**. Apenas Docker + Docker Compose.

```bash
docker compose up --build
```

### Serviços e portas

| Serviço | Porta (host) | Acesso |
|---|---|---|
| App (Fastify) | `3333` | http://localhost:3333 |
| Worker (consumidor da fila) | — | processo interno do compose |
| PostgreSQL | `5432` | `postgres://cellshop:cellshop@localhost:5432/cellshop` |
| Redis | `6379` | `redis://localhost:6379` |
| RabbitMQ (AMQP) | `5672` | `amqp://cellshop:cellshop@localhost:5672` |
| RabbitMQ (UI) | `15672` | http://localhost:15672 (login `cellshop` / `cellshop`) |

### Comportamento no boot

- Migrations e seed de 100 produtos rodam automaticamente antes da app iniciar.
- A app só sobe após os healthchecks de Postgres, Redis e RabbitMQ passarem.
- O worker é um processo separado (serviço `worker` no compose) que consome a fila de checkout.
- **Swagger UI** disponível em http://localhost:3333/docs.

### Comandos úteis

```bash
# Subir tudo (build + start)
docker compose up --build

# Recriar node_modules ao mudar dependências
docker compose up --build -V

# Derrubar e apagar volumes (banco, cache, fila zerados)
docker compose down -v
```

### Rodar testes

Os testes incluem testes de integração que precisam de Postgres e Redis acessíveis:

```bash
npm test -- --run
```

---

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/v1/products?page=&limit=` | Lista produtos paginados (cache Redis) |
| `GET` | `/v1/orders/:idOrder/status` | Consulta o status de um pedido |
| `POST` | `/v1/orders/checkout` | Inicia checkout assíncrono (ver detalhes abaixo) |

### POST /v1/orders/checkout

**Headers obrigatórios:**

| Header | Tipo | Descrição |
|---|---|---|
| `idempotency-key` | UUID v4 | Chave de idempotência — reenvios com a mesma chave não criam pedido duplicado |
| `x-request-id` | string | Usado como `correlationId` e identificador de usuário nos logs, gerado pelo backend |

**Body:**

```json
{ "productId": "<uuid>", "quantity": 1 }
```

**Respostas:**

| Status | Descrição |
|---|---|
| `202` | Pedido aceito para processamento assíncrono — retorna `{ "orderId": "<uuid>" }` |
| `409` | Estoque insuficiente — nenhum pedido criado |

---

## Limitações / escopo da implementação

Apesar da arquitetura alvo contemplar mecanismos mais robustos de resiliência e consistência, a implementação prática prioriza uma versão simplificada e executável, focando nos conceitos principais avaliados no desafio.

O que foi simplificado em relação à arquitetura alvo:

- **Sem Outbox Pattern:** a mensagem é publicada no RabbitMQ logo após o commit da transação (publish-após-commit). Existe um risco residual de o pedido ser gravado mas a mensagem não ser publicada (falha entre commit e publish). Mitiga-se com o worker idempotente e reconciliação futura — o Outbox fica como evolução planejada.
- **Cache simples (TypeORM):** SWR, lock distribuído e jitter de TTL não estão implementados. O cache de produtos é direto, sem revalidação em background nem proteção contra cache stampede.
- **Sem DLQ / retry avançado:** mensagens que falham no worker não são movidas para uma Dead Letter Queue com estratégia de backoff. Se o decremento de estoque falhar no worker, a mensagem é confirmada (ack) e o pedido fica `PENDING`/`PROCESSING` até reconciliação futura.
- **Idempotência best-effort:** a `idempotency-key` garante que um reenvio **sequencial** (retry/duplo clique) não cria pedido duplicado (checagem no Redis). Submits **simultâneos** com a mesma key não têm lock — fechar essa janela depende do lock distribuído previsto na arquitetura alvo.
- **TTL da idempotência não é renovado durante o processamento:** a chave no Redis tem TTL fixo e não há _refresh_/heartbeat enquanto o worker processa a mensagem. Se o processamento exceder o TTL, a chave pode expirar e permitir reprocessamento. A renovação do TTL durante o processamento faz parte da arquitetura alvo.
- **Observabilidade parcial:** apenas traces tanto na pate da vitrine quando no fluxo completo do checkout e logs estruturados com `correlationId`, `orderId`, `productId` e status. Sem métricas exportadas (Prometheus/OTel).
- **Sem autenticação:** os endpoints não exigem token; o `x-request-id` é usado apenas como correlação.

---

## Decisões técnicas e trade-offs

### Diagnóstico e causa raiz

O cenário do desafio parte de um ERP monolítico síncrono sobrecarregado: a vitrine consulta produtos, preços e estoque diretamente no ERP a cada request, sem cache. O checkout também é síncrono e dependente do ERP, sem deduplicação de pedidos concorrentes — abrindo brecha para overselling. A infraestrutura própria limita elasticidade.

**Impactos observados:**

- **Cliente:** lentidão, falhas e risco de compra sem estoque disponível.
- **Negócio:** perda de vendas, baixa capacidade de pedidos simultâneos.
- **Operação:** gargalos no ERP, latência alta, pouca observabilidade.

**Opções avaliadas:**

| Caminho | Vantagens | Desvantagens |
|---|---|---|
| Escala vertical do ERP | Rápido, melhora imediata | Caro, escalabilidade limitada, não resolve concorrência nem o modelo síncrono |
| Cache + processamento assíncrono *(escolhido)* | Menor latência, menos carga no ERP, maior throughput, UX melhor, escalável | Maior complexidade, consistência eventual na vitrine, exige monitoramento e reconciliação |

---

### Cache, invalidação e performance

O catálogo de produtos é armazenado em cache no Redis. A primeira request consulta o banco/ERP, popula o cache e as subsequentes são servidas do Redis — reduzindo diretamente a carga no ERP.

A vitrine tolera consistência eventual (dados levemente defasados são aceitáveis para exibição). O checkout, por sua vez, valida estoque na operação transacional, garantindo que a venda nunca se baseie em dados de cache.

**Estratégia alvo (arquitetura de 30–90 dias):**

- **Cache-aside com TTL curto (~30 s) e jitter aleatório** — evita que múltiplas keys expirem ao mesmo tempo (cache stampede).
- **SWR (stale-while-revalidate)** — serve dados do cache enquanto revalida em background.
- **Lock distribuído no Redis** — apenas uma request revalida o banco; as demais continuam servindo o dado stale.

**Métricas-chave para validar a estratégia:** cache hit ratio, redução de chamadas ao ERP, latência P95/P99 do endpoint de produtos, CPU do ERP.

---

### Observabilidade

A implementação atual emite **logs estruturados** com os campos `correlationId`, `requestId`, `orderId`, `productId`, `status`, quantidade solicitada e estoque atual em todos os fluxos críticos.

**Métricas planejadas (arquitetura alvo):**

- *Counters:* pedidos processados/falha, mensagens processadas, retries, cache hits/misses, chamadas ao ERP.
- *Gauges:* mensagens na fila e DLQ, CPU/memória, itens em cache.
- *Histogramas:* latência do checkout, resposta do ERP, duração do worker, latência do endpoint de produtos.

**Traces distribuídos (arquitetura alvo):**

- `GET /products` → span de cache hit/miss, tempo no Redis, consulta ao ERP/banco.
- `POST /checkout` → span de criação de pedido, publish na fila, processamento no worker, atualização de estoque, integração com ERP — todos correlacionados pelo `correlationId`.

**SLOs planejados:**

| SLI | SLO |
|---|---|
| Latência P95 catálogo | < 200 ms |
| Disponibilidade | > 99,9 % |
| Taxa de erro | < 1 % |

---

### Concorrência, estoque e idempotência

**Problema:** uma verificação simples de estoque seguida de decremento é vulnerável a race conditions — duas requests simultâneas leem o mesmo valor e ambas descontam, causando overselling.

**Estratégia adotada — atomic update condicional:**

```sql
UPDATE products
SET stock = stock - :qty
WHERE id = :id AND stock >= :qty
```

A validação e o decremento ocorrem na mesma instrução SQL, eliminando a janela de concorrência sem locks explícitos. É a estratégia mais simples e eficiente para decremento de estoque.

**Comparativo de estratégias:**

| Estratégia | Vantagens | Desvantagens |
|---|---|---|
| Atomic update condicional *(adotado)* | Performático, simples, seguro para concorrência | Adequado principalmente para decrementos |
| Lock pessimista (`SELECT FOR UPDATE`) | Consistência forte, suporta regras complexas | Contenção, pior escalabilidade, maior latência |
| Reserva de estoque | Reduz overselling no assíncrono, feedback imediato | Complexidade, exige expiração e reconciliação |

**Idempotência:** o header `idempotency-key` (UUID v4) é propagado até a fila e armazenado no Redis e no banco. O worker verifica se o pedido já foi concluído antes de processar — evitando efeitos de duplo clique, retry duplicado ou reprocessamento.

---

### Mensageria e resiliência

A mensagem para a fila é publicada **somente após o commit** da transação do pedido, evitando mensagens órfãs referenciando pedidos que não existem no banco.

O risco residual é o inverso: o pedido é gravado mas a publicação falha antes de chegar ao broker. Nesse caso o pedido existe sem mensagem na fila.

**Mitigações atuais:**

- O worker é **idempotente** — reprocessar a mesma mensagem não tem efeito colateral.
- Uma rotina de **reconciliação** pode identificar pedidos gravados sem mensagem e republicar.

**Evolução planejada — Outbox Pattern:**

No padrão Outbox, o pedido e a mensagem são gravados na **mesma transação** em uma tabela `outbox`. Um processo separado (transactional outbox poller) lê as mensagens pendentes e publica no RabbitMQ — eliminando o risco de pedido sem mensagem. Esta é a evolução prevista na arquitetura alvo.

---

### Arquitetura alvo (30–90 dias)

Resumo das evoluções planejadas sobre a implementação atual:

| Tema | Estado atual | Alvo |
|---|---|---|
| Cache | Cache direto (TypeORM) | Cache-aside + SWR + lock distribuído + jitter |
| Consistência na publicação | Publish-após-commit | Outbox Pattern (transacional) |
| Retry / resiliência | Sem DLQ/retry avançado | DLQ + backoff exponencial + alertas |
| Observabilidade | Logs estruturados + traces distribuídos | Métricas (Prometheus/OTel) + traces distribuídos + SLOs/alertas |
| Autenticação | Sem auth | JWT ou equivalente |
| Estoque | Atomic update condicional + Reserva de estoque + | Reserva de estoque + reconciliação periódica com ERP |
