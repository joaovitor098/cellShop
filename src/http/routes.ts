import type { FastifyInstance } from 'fastify'

import { healthCheckController } from './controllers/health-check/health-check.controller.js'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  healthCheckController(app)
}
