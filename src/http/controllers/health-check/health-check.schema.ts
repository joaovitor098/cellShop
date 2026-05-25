import { z } from 'zod'

export const healthCheckResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
  timestamp: z.string(),
})
