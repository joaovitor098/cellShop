import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateStocks1779736041216 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        CONSTRAINT "pk_stocks" PRIMARY KEY ("id"),
        CONSTRAINT "uq_stocks_product" UNIQUE ("product_id"),
        CONSTRAINT "fk_stocks_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "stocks"`)
  }
}
