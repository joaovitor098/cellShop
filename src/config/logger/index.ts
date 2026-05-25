import { randomUUID as randomUuidV4 } from 'node:crypto'

import type { LoggerOptions } from './types.js'

const isTesting = process.env.NODE_ENV === 'test'


export const loggerOptions: LoggerOptions = {
  pinoOptions: {
    level: isTesting ? 'silent' : 'info',
    ...(isTesting
      ? {}
      : {
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true,
          },
        },
      }),
    base: {
      processPid: process.pid,
    },
    serializers: {
      req: request => {
        return {
          parameters: request.params,
          method: request.method,
          url: request.url,
          body: request.body,
          headers: request.headers,
        }
      },
      res: reply => {
        return {
          statusCode: reply.statusCode,
          statusMessage: reply.raw?.statusMessage,
          headers: typeof reply.getHeaders === 'function' ? reply.getHeaders() : {},
          body: reply.body,
        }
      },
    },
  },
  fastifyOptions: {
    genReqId: req => (req.headers['x-request-id'] as string) || randomUuidV4(),
  },
}
