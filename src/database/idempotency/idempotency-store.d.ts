export type IdempotencyStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED'

export interface IdempotencyRecord {
  status: IdempotencyStatus
  orderId: string
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>
  create(key: string, record: IdempotencyRecord): Promise<boolean>
  setStatus(key: string, status: IdempotencyStatus): Promise<void>
  delete(key: string): Promise<void>
}
