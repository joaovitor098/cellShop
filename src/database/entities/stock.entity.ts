import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('stocks')
export class Stock {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string

  @Column({ type: 'integer' })
  quantity!: number

  @Column({ type: 'integer' })
  reserved!: number
}
