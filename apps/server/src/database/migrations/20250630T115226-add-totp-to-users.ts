import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
  .createTable('2fa')
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('type', 'varchar', (col) => col.notNull().defaultTo('totp'))
    .addColumn('secret', 'varchar')
    .addColumn('backup_codes','jsonb')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable('2fa')
    .execute();
}
