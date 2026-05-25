import { AsyncLocalStorage } from 'node:async_hooks'

import type { FastifyInstance, FastifyRequest } from 'fastify'

// Guarda a request atual no contexto async, pra código fora do handler
// (ex: provider de cache do TypeORM) recuperar e logar com o reqId junto.
const storage = new AsyncLocalStorage<FastifyRequest>()

export function getCurrentRequest(): FastifyRequest | undefined {
  return storage.getStore()
}

// Hook onRequest: vincula a request ao contexto async da requisição.
export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', (request, _reply, done) => {
    storage.enterWith(request)
    done()
  })
}
