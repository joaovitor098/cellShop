import type { FastifyServerOptions } from 'fastify'

export type LoggerOptions = {
    pinoOptions: NonNullable<FastifyServerOptions['logger']>
    fastifyOptions: {
        genReqId: NonNullable<FastifyServerOptions['genReqId']>
    }
}