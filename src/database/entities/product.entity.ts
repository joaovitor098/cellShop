import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ type: 'integer' })
  price!: number
}
