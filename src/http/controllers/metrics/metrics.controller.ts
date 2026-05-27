import type { FastifyInstance } from 'fastify'

import { registry } from '@/config/metrics/index.js'
import { swaggerTags } from '@/config/swagger/constants.js'

export function metricsController(app: FastifyInstance): void {
  app.get('/v1/metrics', {
    schema: {
      tags: [swaggerTags.METRICS],
      summary: 'mEtrics for monitoring the application',
    },
  }, async (_request, reply) => {
    reply.header('Content-Type', registry.contentType)

    return reply.send(await registry.metrics())
  })
}
