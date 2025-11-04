import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create new group_members table that supports both users and groups as members
  await db.schema
    .createTable('group_members')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('group_id', 'uuid', (col) =>
      col.references('groups.id').onDelete('cascade').notNull(),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade'),
    )
    .addColumn('member_group_id', 'uuid', (col) =>
      col.references('groups.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('group_members_group_id_user_id_unique', [
      'group_id',
      'user_id',
    ])
    .addUniqueConstraint('group_members_group_id_member_group_id_unique', [
      'group_id',
      'member_group_id',
    ])
    .addCheckConstraint(
      'allow_either_user_id_or_member_group_id_check',
      sql`(("user_id" IS NOT NULL AND "member_group_id" IS NULL) OR ("user_id" IS NULL AND "member_group_id" IS NOT NULL))`,
    )
    .execute();

  // Migrate existing data from group_users to group_members
  await db
    .insertInto('group_members')
    .columns(['group_id', 'user_id', 'created_at', 'updated_at'])
    .expression((eb) =>
      eb
        .selectFrom('groupUsers')
        .select([
          'groupUsers.groupId as group_id',
          'groupUsers.userId as user_id',
          'groupUsers.createdAt as created_at',
          'groupUsers.updatedAt as updated_at',
        ]),
    )
    .execute();

  // Drop the old group_users table
  await db.schema.dropTable('groupUsers').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Recreate group_users table
  await db.schema
    .createTable('groupUsers')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade').notNull(),
    )
    .addColumn('group_id', 'uuid', (col) =>
      col.references('groups.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('group_users_group_id_user_id_unique', [
      'group_id',
      'user_id',
    ])
    .execute();

  // Migrate data back (only user members, group members will be lost)
  await db
    .insertInto('groupUsers')
    .columns(['group_id', 'user_id', 'created_at', 'updated_at'])
    .expression((eb) =>
      eb
        .selectFrom('group_members')
        .select([
          'group_members.groupId as group_id',
          'group_members.userId as user_id',
          'group_members.createdAt as created_at',
          'group_members.updatedAt as updated_at',
        ])
        .where('group_members.userId', 'is not', null),
    )
    .execute();

  // Drop group_members table
  await db.schema.dropTable('group_members').execute();
}
