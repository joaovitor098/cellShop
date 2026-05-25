import fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { loggerOptions } from '@/config/logger/index.js'
import { registerSwagger } from '@/config/swagger/index.js'
import { registerRoutes } from '@/http/routes.js'


export function server() {
    const app = fastify({
        logger: loggerOptions.pinoOptions,
        genReqId: loggerOptions.fastifyOptions.genReqId,
    })

    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)

    registerSwagger(app)
    app.register(registerRoutes)

    app.addHook('onSend', (_request, reply, payload, done) => {
        reply.body = payload
        done(null, payload)
    })

    return app.withTypeProvider<ZodTypeProvider>()
}
