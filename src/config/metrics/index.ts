import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client'

export const registry = new Registry()

collectDefaultMetrics({ register: registry })

export const cacheEventsCounter = new Counter({
  name: 'cache_events_total',
  help: 'Total product cache lookups, split by result',
  labelNames: ['result'] as const,
  registers: [registry],
})

export const checkoutOutcomesCounter = new Counter({
  name: 'checkout_requests_total',
  help: 'Total checkouts by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
})

export const stockReservedCounter = new Counter({
  name: 'stock_reserved_units_total',
  help: 'Total stock units reserved during checkout',
  registers: [registry],
})

export const ordersProcessedCounter = new Counter({
  name: 'orders_processed_total',
  help: 'Total orders completed by the worker',
  registers: [registry],
})

export const checkoutDurationHistogram = new Histogram({
  name: 'checkout_duration_seconds',
  help: 'Checkout handler latency, in seconds',
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
})

export const checkoutsInFlightGauges = new Gauge({
  name: 'checkouts_in_flight',
  help: 'Checkouts being processed right now',
  registers: [registry],
})
