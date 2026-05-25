import type { OrdersRepository } from '@/database/repositories/orders-repository.js'
import type { OrderStatusResponse } from '@/dtos/order-status.dto.js'

export class GetOrderStatusService {
  constructor(private readonly repository: OrdersRepository) {}

  async getStatus(id: string): Promise<OrderStatusResponse | null> {
    const order = await this.repository.findById(id)

    if (!order) return null

    return { id: order.id, status: order.status }
  }
}
