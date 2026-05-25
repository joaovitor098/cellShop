import type { FastifyBaseLogger, FastifyRequest } from 'fastify'

export class Logger {
  private readonly log: FastifyBaseLogger

  constructor(request: FastifyRequest) {
    this.log = request.log
  }

  info(message: string, data?: unknown): void {
    this.write('info', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.write('warn', message, data)
  }

  error(message: string, data?: unknown): void {
    this.write('error', message, data)
  }

  debug(message: string, data?: unknown): void {
    this.write('debug', message, data)
  }

  private write(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    if (data === undefined) {
      this.log[level](message)

      return
    }

    this.log[level]({ data }, message)
  }
}
