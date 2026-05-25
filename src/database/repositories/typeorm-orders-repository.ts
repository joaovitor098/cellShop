import type { DataSource } from 'typeorm'

import { Order } from '@/database/entities/order.entity.js'

import type { OrdersRepository } from './orders-repository.js'

export class TypeOrmOrdersRepository implements OrdersRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findById(id: string): Promise<Order | null> {
    return this.dataSource.getRepository(Order).findOneBy({ id })
  }
}
