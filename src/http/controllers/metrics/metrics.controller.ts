import type { FastifyInstance } from 'fastify'

import { registry } from '@/config/metrics/index.js'

export function metricsController(app: FastifyInstance): void {
  app.get('/v1/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType)

    return reply.send(await registry.metrics())
  })
}
