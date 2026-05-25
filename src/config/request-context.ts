import { AsyncLocalStorage } from 'node:async_hooks'

import type { FastifyInstance, FastifyRequest } from 'fastify'

const storage = new AsyncLocalStorage<FastifyRequest>()

export function getCurrentRequest(): FastifyRequest | undefined {
  return storage.getStore()
}

export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', (request, _reply, done) => {
    storage.enterWith(request)
    done()
  })
}
