import type { FastifyInstance } from 'fastify'

import { healthCheckController } from './controllers/health-check/health-check.controller.js'
import { listProductsController } from './controllers/products/list-products.controller.js'
import { getOrderStatusController } from './controllers/orders/get-order-status.controller.js'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  healthCheckController(app)
  listProductsController(app)
  getOrderStatusController(app)
}
