import { Logger } from './logger.js'

import type { FastifyBaseLogger } from 'fastify'

function fakeLog() {
  const calls: Array<{ level: string; payload: unknown; message: string }> = []
  const make = (level: string) => (payload: unknown, message: string) => calls.push({ level, payload, message })
  const log = { info: make('info'), warn: make('warn'), error: make('error'), debug: make('debug') } as unknown as FastifyBaseLogger

  return { log, calls }
}

describe('Logger', () => {
  it('merges context into every log payload', () => {
    const { log, calls } = fakeLog()
    new Logger(log, { reqId: 'r1', orderId: 'o1' }).info('reserved', { stock: 5 })

    expect(calls[0]).toEqual({ level: 'info', payload: { reqId: 'r1', orderId: 'o1', data: { stock: 5 } }, message: 'reserved' })
  })

  it('child accumulates context', () => {
    const { log, calls } = fakeLog()
    new Logger(log, { reqId: 'r1' }).child({ idempotencyKey: 'k1' }).info('next')

    expect(calls[0]).toEqual({ level: 'info', payload: { reqId: 'r1', idempotencyKey: 'k1' }, message: 'next' })
  })
})
