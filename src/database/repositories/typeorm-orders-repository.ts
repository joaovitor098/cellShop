import type { DataSource, EntityManager } from 'typeorm'

import { Order } from '@/database/entities/order.entity.js'
import type { OrderStatus } from '@/database/entities/order.entity.js'

import type { OrdersRepository } from './orders-repository.js'

export class TypeOrmOrdersRepository implements OrdersRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findById(id: string): Promise<Order | null> {
    return this.dataSource.getRepository(Order).findOneBy({ id })
  }

  async create(orderId: string, user: string, manager: EntityManager = this.dataSource.manager): Promise<Order> {
    const repository = manager.getRepository(Order)

    return repository.save(repository.create({ id: orderId, user, status: 'PENDING' }))
  }

  async updateStatus(id: string, status: OrderStatus, manager: EntityManager = this.dataSource.manager): Promise<void> {
    await manager.getRepository(Order).update({ id }, { status })
  }
}
