import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateOrders1779740817814 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "orders_status_enum" AS ENUM ('PENDING', 'FAILED', 'PROCESSED')`)

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" "orders_status_enum" NOT NULL DEFAULT 'PENDING',
        "user" VARCHAR(100) NOT NULL,
        CONSTRAINT "pk_orders" PRIMARY KEY ("id")
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "orders"`)
    await queryRunner.query(`DROP TYPE "orders_status_enum"`)
  }
}
