import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateProducts1779736032022 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" VARCHAR(200) NOT NULL,
        "price" integer NOT NULL,
        CONSTRAINT "pk_products" PRIMARY KEY ("id")
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "products"`)
  }
}
