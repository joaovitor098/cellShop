import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

import type { FastifyInstance } from 'fastify'

import { swaggerTags } from './constants.js'

export function registerSwagger(app: FastifyInstance): void {

  app.register(swagger, {
    mode: 'dynamic',
    transform: jsonSchemaTransform,
    hideUntagged: true,
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'cellShop API',
        description: 'Catálogo de produtos e checkout de pedidos',
        version: '0.1.0',
      },
      tags: Object.values(swaggerTags).map(name => ({ name, description: name })),
    },
  })

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      deepLinking: false,
    },
  })
}
