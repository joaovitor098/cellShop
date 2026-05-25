import type { FastifyBaseLogger, FastifyRequest } from 'fastify'

export interface LogContext {
  reqId?: string
  correlationId?: string
  idempotencyKey?: string
  orderId?: string
  productId?: string
  stock?: number
}

type Level = 'info' | 'warn' | 'error' | 'debug'

export class Logger {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly context: LogContext = {},
  ) {}

  static fromRequest(request: FastifyRequest, context: LogContext = {}): Logger {
    return new Logger(request.log, { reqId: request.id, ...context })
  }

  child(extra: LogContext): Logger {
    return new Logger(this.log, { ...this.context, ...extra })
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

  private write(level: Level, message: string, data?: unknown): void {
    const payload = data === undefined ? { ...this.context } : { ...this.context, data }

    this.log[level](payload, message)
  }
}
