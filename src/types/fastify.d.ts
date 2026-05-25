import 'fastify'

declare module 'fastify' {
  interface FastifyReply {
    body?: unknown
  }
}
