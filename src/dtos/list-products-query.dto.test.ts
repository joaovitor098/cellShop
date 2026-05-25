import { listProductsQuerySchema } from './list-products-query.dto.js'

describe('listProductsQuerySchema', () => {
  it('aplica defaults page=1 limit=20', () => {
    expect(listProductsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 })
  })

  it('coage strings da query', () => {
    expect(listProductsQuerySchema.parse({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50 })
  })

  it('rejeita limit > 100', () => {
    expect(() => listProductsQuerySchema.parse({ limit: 101 })).toThrow()
  })

  it('rejeita page < 1', () => {
    expect(() => listProductsQuerySchema.parse({ page: 0 })).toThrow()
  })
})
