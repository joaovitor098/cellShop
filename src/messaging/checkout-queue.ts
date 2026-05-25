import amqp, { type Channel, type ChannelModel } from 'amqplib'

import { env } from '@/config/env/index.js'

export const CHECKOUT_QUEUE = 'orders.checkout'

export interface CheckoutMessage {
  correlationId: string
  idempotencyKey: string
  productId: string
  reservedQuantity: number
  stockAvailability: number
  orderId: string
}

export async function createChannel(): Promise<{ connection: ChannelModel; channel: Channel }> {
  const connection = await amqp.connect(env.RABBITMQ_URL)
  const channel = await connection.createChannel()
  await channel.assertQueue(CHECKOUT_QUEUE, { durable: true })

  return { connection, channel }
}

export class CheckoutPublisher {
  constructor(private readonly channel: Channel) {}

  publish(message: CheckoutMessage): void {
    this.channel.sendToQueue(CHECKOUT_QUEUE, Buffer.from(JSON.stringify(message)), { persistent: true })
  }
}
