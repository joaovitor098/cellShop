import { checkoutBodySchema, checkoutHeadersSchema } from './checkout.dto.js'

describe('checkout dto', () => {
  it('accepts a valid idempotency-key header', () => {
    const parsed = checkoutHeadersSchema.parse({ 'idempotency-key': '11111111-1111-4111-8111-111111111111' })

    expect(parsed['idempotency-key']).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('rejects a non-uuid idempotency-key', () => {
    expect(() => checkoutHeadersSchema.parse({ 'idempotency-key': 'abc' })).toThrow()
  })

  it('accepts a valid body', () => {
    const parsed = checkoutBodySchema.parse({ productId: '11111111-1111-4111-8111-111111111111', quantity: 2 })

    expect(parsed.quantity).toBe(2)
  })

  it('rejects quantity < 1', () => {
    expect(() => checkoutBodySchema.parse({ productId: '11111111-1111-4111-8111-111111111111', quantity: 0 })).toThrow()
  })
})
