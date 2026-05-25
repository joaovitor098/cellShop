import { listProductsQuerySchema } from './list-products-query.dto.js'

describe('listProductsQuerySchema', () => {
  it('applies defaults page=1 limit=20', () => {
    expect(listProductsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 })
  })

  it('coerces query strings', () => {
    expect(listProductsQuerySchema.parse({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50 })
  })

  it('rejects limit > 100', () => {
    expect(() => listProductsQuerySchema.parse({ limit: 101 })).toThrow()
  })

  it('rejects page < 1', () => {
    expect(() => listProductsQuerySchema.parse({ page: 0 })).toThrow()
  })
})
