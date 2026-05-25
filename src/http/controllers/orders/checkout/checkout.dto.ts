import { z } from 'zod'

export const checkoutHeadersSchema = z.object({
  'idempotency-key': z.uuid(),
})

export const checkoutBodySchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().int().min(1),
})

export const checkoutResponseSchema = z.object({
  orderId: z.uuid(),
})

export const checkoutConflictSchema = z.object({
  message: z.string(),
})

export type CheckoutBody = z.infer<typeof checkoutBodySchema>
