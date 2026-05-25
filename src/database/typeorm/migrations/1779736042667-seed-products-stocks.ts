import { readFileSync } from 'node:fs'

import type { MigrationInterface, QueryRunner } from 'typeorm'

import type { ProductSeed } from './seeds/products.seed.js'

const seedProducts = JSON.parse(
  readFileSync(new URL('./seeds/products.seed.json', import.meta.url), 'utf8'),
) as ProductSeed[]

export class SeedProductsStocks1779736042667 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const product of seedProducts) {
      const [{ id }] = await queryRunner.query(
        `INSERT INTO "products" ("name", "price") VALUES ($1, $2) RETURNING "id"`,
        [product.name, product.price],
      )

      await queryRunner.query(`INSERT INTO "stocks" ("product_id", "quantity") VALUES ($1, $2)`, [
        id,
        product.quantity,
      ])
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const names = seedProducts.map(product => product.name)

    await queryRunner.query(`DELETE FROM "products" WHERE "name" = ANY($1)`, [names])
  }
}
