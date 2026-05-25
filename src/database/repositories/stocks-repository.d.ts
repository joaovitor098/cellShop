import type { EntityManager } from 'typeorm'

export interface StocksRepository {
  reserve(productId: string, quantity: number, manager?: EntityManager): Promise<boolean>
  commitReservation(productId: string, quantity: number, manager?: EntityManager): Promise<boolean>
  findAvailability(productId: string, manager?: EntityManager): Promise<number | null>
}
