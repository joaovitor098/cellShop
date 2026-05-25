import fastify from 'fastify'

import { loggerOptions } from '@/config/logger/index.js'


export function server() {
    const app = fastify({
        logger: loggerOptions.pinoOptions,
        genReqId: loggerOptions.fastifyOptions.genReqId,
    })

    app.addHook('onSend', (_request, reply, payload, done) => {
        reply.body = payload
        done(null, payload)
    })

    return app
}
