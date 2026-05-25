import type { DataSource, EntityManager } from 'typeorm'

import type { StocksRepository } from './stocks-repository.js'

export class TypeOrmStocksRepository implements StocksRepository {
  constructor(private readonly dataSource: DataSource) {}

  async reserve(productId: string, quantity: number, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    const [rows] = await manager.query(
      `UPDATE stocks SET reserved = reserved + $1 WHERE product_id = $2 AND quantity - reserved >= $1 RETURNING id`,
      [quantity, productId],
    )

    return rows.length === 1
  }

  async commitReservation(productId: string, quantity: number, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    const [rows] = await manager.query(
      `UPDATE stocks SET quantity = quantity - $1, reserved = reserved - $1 WHERE product_id = $2 AND reserved >= $1 AND quantity >= $1 RETURNING id`,
      [quantity, productId],
    )

    return rows.length === 1
  }

  async findAvailability(productId: string, manager: EntityManager = this.dataSource.manager): Promise<number | null> {
    const rows = await manager.query(`SELECT quantity - reserved AS available FROM stocks WHERE product_id = $1`, [productId])
    const row = rows[0]

    return row ? Number(row.available) : null
  }
}
