import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('mfa')
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('verified', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('type', 'varchar', (col) => col.notNull().defaultTo('totp'))
    .addColumn('secret', 'varchar')
    .addColumn('backup_codes','jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('mfa_pkey', ['user_id', 'type'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable('mfa')
    .execute();
}
