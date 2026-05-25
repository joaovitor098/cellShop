# cellShop

Desafio técnico de um backend que lista catálogos de produtos e faz o checkout dos pedidos.

## Como rodar

Tudo roda em containers — **não precisa de Node instalado**. Só Docker + Docker Compose.

```bash
docker compose up --build
```

Sobe 4 serviços: a aplicação, PostgreSQL, Redis e RabbitMQ. A app só inicia depois que as dependências passam no healthcheck.

| Serviço | Porta (host) | Acesso |
|---|---|---|
| App (Fastify) | `3333` | http://localhost:3333 |
| PostgreSQL | `5432` | `postgres://cellshop:cellshop@localhost:5432/cellshop` |
| Redis | `6379` | `redis://localhost:6379` |
| RabbitMQ (AMQP) | `5672` | `amqp://cellshop:cellshop@localhost:5672` |
| RabbitMQ (UI) | `15672` | http://localhost:15672 (login `cellshop` / `cellshop`) |

A app roda em modo dev com **hot reload** (`tsx watch` + volume do código): editar arquivos em `src/` reflete no container sem rebuild.

Os defaults estão embutidos no `docker-compose.yml`, então o comando acima funciona sem configuração. Para sobrescrever credenciais/portas, copie `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

Dados de Postgres, Redis e RabbitMQ persistem entre restarts via volumes nomeados. Para zerar tudo:

```bash
docker compose down -v
```

## Arquitetura Alvo (30–90 dias)

Esta seção descreve o estado-alvo da arquitetura — a direção planejada para os próximos 30 a 90 dias, não necessariamente o que já está implementado. O objetivo é sustentar a vitrine de produtos e o checkout sob carga, mantendo consistência com o ERP e tolerância a falhas.

### Cache da vitrine de produtos (Redis)

- **Redis como camada de cache** da vitrine, reduzindo a carga no ERP e a latência das consultas.
- **Estratégia cache-aside** com **TTL curto** e **jitter** no TTL, evitando expiração em massa (cache stampede).
- **Revalidação em background (SWR — stale-while-revalidate):** serve os dados do cache enquanto a atualização acontece de forma assíncrona.
- **Lock distribuído** na revalidação: uma única request revalida o cache enquanto as demais continuam servindo do cache.

### Checkout assíncrono

- **Fila** para desacoplar o processamento do pedido do fluxo síncrono da API — o checkout responde rápido e o processamento pesado ocorre fora do request.
- **Workers** responsáveis pelo processamento dos pedidos e pela integração assíncrona com o ERP.
- **Reserva de estoque durante o checkout** para reduzir o risco de overselling e dar feedback imediato ao usuário.
- **Atomic update condicional** nas operações de reserva e confirmação de estoque, garantindo concorrência segura.
- **Idempotência** no fluxo de checkout e no processamento dos workers, tolerando retry, reprocessamento e duplo clique.

### Consistência e confiabilidade

- **Padrão Outbox** para reduzir o risco de pedido fantasma e mensagem fantasma (escrita no banco e publicação na fila de forma atômica).
- **Reconciliação periódica** entre ERP e sistema da loja, identificando e corrigindo divergências causadas por falhas transitórias, timeout ou inconsistências entre sistemas.

### Proteção e observabilidade

- **Rate limit** na aplicação para controlar o volume de requisições que o backend consegue absorver.
- **Observabilidade** com logs estruturados, métricas e traces distribuídos em todos os fluxos críticos.
