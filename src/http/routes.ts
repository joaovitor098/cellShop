import type { FastifyInstance } from 'fastify'

import type { CheckoutPublisher } from '@/messaging/checkout-queue.js'

import { healthCheckController } from './controllers/health-check/health-check.controller.js'
import { metricsController } from './controllers/metrics/metrics.controller.js'
import { listProductsController } from './controllers/products/list-products.controller.js'
import { getOrderStatusController } from './controllers/orders/get-order-status.controller.js'
import { registerCheckoutController } from './controllers/orders/checkout/checkout.controller.js'

export async function registerRoutes(app: FastifyInstance, publisher: CheckoutPublisher): Promise<void> {
  healthCheckController(app)
  metricsController(app)
  listProductsController(app)
  getOrderStatusController(app)
  registerCheckoutController(app, publisher)
}
