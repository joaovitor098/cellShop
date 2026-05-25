import { z } from 'zod'

import { ORDER_STATUS } from '@/database/entities/order.entity.js'

export const orderStatusParamsSchema = z.object({
  idOrder: z.uuid(),
})

export const orderStatusResponseSchema = z.object({
  id: z.uuid(),
  status: z.enum(ORDER_STATUS),
})

export const orderNotFoundSchema = z.object({
  message: z.string(),
})

export type OrderStatusResponse = z.infer<typeof orderStatusResponseSchema>
