import { z } from 'zod'

export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  price: z.number().int(),
})

export const paginatedProductsSchema = z.object({
  data: z.array(productSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

export type ProductDto = z.infer<typeof productSchema>
export type PaginatedProducts = z.infer<typeof paginatedProductsSchema>
