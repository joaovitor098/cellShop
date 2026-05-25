import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { swaggerTags } from '@/config/swagger/index.js'

import { healthCheckResponseSchema } from './health-check.schema.js'

export function healthCheckController(app: FastifyInstance): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/v1/health-check',
    {
      schema: {
        tags: [swaggerTags.HEALTH_CHECK],
        summary: 'Liveness check application',
        response: {
          200: healthCheckResponseSchema,
        },
      },
    },
    async (_, reply) => {

      return reply.send({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      })
    },
  )
}
