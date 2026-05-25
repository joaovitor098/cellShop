import type { Order } from '@/database/entities/order.entity.js'

export interface OrdersRepository {
  findById(id: string): Promise<Order | null>
}
