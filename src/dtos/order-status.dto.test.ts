import { orderStatusParamsSchema, orderStatusResponseSchema } from './order-status.dto.js'

describe('order-status dto', () => {
  it('accepts a valid uuid idOrder', () => {
    const parsed = orderStatusParamsSchema.parse({ idOrder: '11111111-1111-4111-8111-111111111111' })

    expect(parsed.idOrder).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('rejects a non-uuid idOrder', () => {
    expect(() => orderStatusParamsSchema.parse({ idOrder: 'abc' })).toThrow()
  })

  it('validates a response with an enum status', () => {
    const parsed = orderStatusResponseSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'PENDING',
    })

    expect(parsed.status).toBe('PENDING')
  })

  it('rejects a status outside the enum', () => {
    expect(() =>
      orderStatusResponseSchema.parse({ id: '11111111-1111-4111-8111-111111111111', status: 'DONE' }),
    ).toThrow()
  })
})
