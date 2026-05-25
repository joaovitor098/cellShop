import { z } from 'zod'

const envSchema = z.object({
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.coerce.number(),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string(),

  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB_NUMBER: z.coerce.number().default(0),
  CACHE_TTL_MS: z.coerce.number().default(60_000),

  RABBITMQ_URL: z.string(),
  IDEMPOTENCY_TTL_MS: z.coerce.number().default(86_400_000),
})

export const env = envSchema.parse(process.env)

export type Env = z.infer<typeof envSchema>
