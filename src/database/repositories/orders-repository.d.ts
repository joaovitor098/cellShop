import type { EntityManager } from 'typeorm'

import type { Order, OrderStatus } from '@/database/entities/order.entity.js'

export interface OrdersRepository {
  findById(id: string): Promise<Order | null>
  create(orderId: string, user: string, manager?: EntityManager): Promise<Order>
  updateStatus(id: string, status: OrderStatus, manager?: EntityManager): Promise<void>
}
