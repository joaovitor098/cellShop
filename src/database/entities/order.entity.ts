import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

export const ORDER_STATUS = ['PENDING', 'FAILED', 'PROCESSED'] as const

export type OrderStatus = (typeof ORDER_STATUS)[number]

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'enum', enum: ORDER_STATUS, enumName: 'orders_status_enum' })
  status!: OrderStatus

  @Column({ type: 'varchar', length: 100 })
  user!: string
}
