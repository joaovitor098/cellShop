import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: 'node',
    // reflect-metadata antes de qualquer entity com decorator.
    setupFiles: ['reflect-metadata'],
    // env dummy: env.parse (importado via data-source) exige DATABASE_*.
    // O DataSource é só construído nos testes, nunca conectado.
    env: {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_USER: 'test',
      DATABASE_PASSWORD: 'test',
      DATABASE_NAME: 'test',
    },
  },
})
