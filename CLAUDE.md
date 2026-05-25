# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

cellShop — technical-challenge backend that lists a product catalog and handles order checkout. Greenfield: the toolchain is configured but application code does not exist yet. `package.json`'s `dev` script points to `src/start-server.ts`, which is the expected entry point to create.

## Stack & Conventions

- **Runtime:** Node `24.16.0` (pinned in `.nvmrc`). `engine-strict=true` in `.npmrc` enforces it — run `nvm use` before installing.
- **Web framework:** Fastify. `tsconfig.json` extends `fastify-tsconfig`; this package is not yet in `devDependencies`, so `npm i -D fastify fastify-tsconfig` (plus `fastify`) is required before the config resolves.
- **TypeScript:** ESM only (`module: nodenext`, `verbatimModuleSyntax`, `isolatedModules`). Use explicit `import type` for type-only imports and include file extensions in relative imports.
- **Path alias:** `@/*` → `./src/*`. `tsx` resolves it at runtime; any test runner / build step must be configured to honor it too.
- **Strictness:** `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are all on. Indexed access yields `T | undefined` (guard before use); optional properties cannot be set to `undefined` explicitly.
- **Dependency pinning:** `save-exact=true` — installs write exact versions, no `^`. Keep it that way.

## Commands

```bash
npm install        # respects engine-strict (Node 24.16.0) and save-exact
npm run dev        # tsx watch on src/start-server.ts (hot reload)
```

No build, lint, or test scripts exist yet — add them to `package.json` `scripts` as they are introduced.
