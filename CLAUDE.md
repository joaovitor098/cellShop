# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Projeto

cellShop — backend de desafio técnico que lista um catálogo de produtos e processa o checkout de pedidos. Greenfield: o toolchain está configurado, mas o código da aplicação ainda não existe. O script `dev` do `package.json` aponta para `src/start-server.ts`, que é o entrypoint esperado a ser criado.

## Stack & Convenções

- **Runtime:** Node `24.16.0` (fixado no `.nvmrc`). `engine-strict=true` no `.npmrc` força a versão — rode `nvm use` antes de instalar.
- **Framework web:** Fastify. O `tsconfig.json` estende `fastify-tsconfig`; este pacote ainda não está em `devDependencies`, então `npm i -D fastify fastify-tsconfig` (mais `fastify`) é necessário antes da config resolver.
- **TypeScript:** Somente ESM (`module: nodenext`, `verbatimModuleSyntax`, `isolatedModules`). Use `import type` explícito para imports de tipo e inclua a extensão do arquivo nos imports relativos.
- **Path alias:** `@/*` → `./src/*`. O `tsx` resolve em runtime; qualquer test runner / build step também deve ser configurado para honrar o alias.
- **Strictness:** `strict`, `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` estão todos ligados. Acesso indexado retorna `T | undefined` (faça guard antes de usar); propriedades opcionais não podem receber `undefined` explicitamente.
- **Pinning de dependências:** `save-exact=true` — installs gravam versões exatas, sem `^`. Mantenha assim.

## Arquitetura & Estrutura

Arquitetura em camadas. Controllers fazem a composição; tudo abaixo depende de abstrações, nunca de implementações concretas.

- **Types & interfaces:** Declare em arquivos `*.d.ts` dedicados, nunca inline junto do código de runtime. Se o tipo for compartilhado entre módulos, fica em `src/types/`. Tipos locais ao módulo ficam em um `*.d.ts` ao lado do módulo.
- **Endpoints:** Um controller por endpoint em `src/http/controllers/`. Cada controller tem seu próprio service.
- **Injeção de dependência:** Somente o controller pode instanciar classes. O controller monta as dependências e as injeta no seu service. O service depende de abstrações (interfaces), não de implementações concretas — ou seja, repositórios são passados, não construídos dentro do service.
- **Repositórios:** `src/database/repositories/` — acesso a dados; consumidos pelos services através de suas abstrações.
- **Entidades:** `src/database/entities/`.
- **DTOs:** `src/dtos/`.
- **Validação:** Zod valida toda entrada dos endpoints (params, query, body) e valida também os payloads de resposta.

## Documentação de features

Ao criar **spec**, **plan** e **tasks** de uma feature, documente cada um como `.md` dentro de uma subpasta com o nome da feature (kebab-case) em `docs/`:

```
./docs/<nome-da-feature>/spec.md
./docs/<nome-da-feature>/plan.md
./docs/<nome-da-feature>/tasks.md
```

Os três arquivos no mesmo diretório por feature.

## Comandos

```bash
npm install        # respeita engine-strict (Node 24.16.0) e save-exact
npm run dev        # tsx watch em src/start-server.ts (hot reload)
```

Ainda não existem scripts de build, lint ou test — adicione-os em `scripts` do `package.json` conforme forem introduzidos.
