import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import {
  ApiKey,
  InsertableApiKey,
  UpdatableApiKey,
} from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { ExpressionBuilder } from 'kysely';
import { DB } from '@docmost/db/types/db';
import { jsonObjectFrom } from 'kysely/helpers/postgres';

@Injectable()
export class ApiKeyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof ApiKey> = [
    'id',
    'name',
    'creatorId',
    'workspaceId',
    'expiresAt',
    'lastUsedAt',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(apiKeyId: string, trx?: KyselyTransaction): Promise<ApiKey> {
    return dbOrTx(this.db, trx)
      .selectFrom('apiKeys')
      .select(this.baseFields)
      .where('id', '=', apiKeyId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByWorkspace(workspaceId: string, pagination: PaginationOptions) {
    const query = this.db
      .selectFrom('apiKeys')
      .select(this.baseFields)
      .select((eb) => this.withCreator(eb))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'createdAt', direction: 'desc' },
        { expression: 'id', direction: 'desc' },
      ],
      parseCursor: (cursor) => ({
        createdAt: new Date(cursor.createdAt),
        id: cursor.id,
      }),
    });
  }

  async insert(
    insertableApiKey: InsertableApiKey,
    trx?: KyselyTransaction,
  ): Promise<ApiKey> {
    return dbOrTx(this.db, trx)
      .insertInto('apiKeys')
      .values(insertableApiKey)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async update(
    updatableApiKey: UpdatableApiKey,
    apiKeyId: string,
    trx?: KyselyTransaction,
  ) {
    return dbOrTx(this.db, trx)
      .updateTable('apiKeys')
      .set({ ...updatableApiKey, updatedAt: new Date() })
      .where('id', '=', apiKeyId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async softDelete(apiKeyId: string, trx?: KyselyTransaction): Promise<void> {
    await dbOrTx(this.db, trx)
      .updateTable('apiKeys')
      .set({ deletedAt: new Date() })
      .where('id', '=', apiKeyId)
      .execute();
  }

  async updateLastUsedAt(apiKeyId: string): Promise<void> {
    await this.db
      .updateTable('apiKeys')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', apiKeyId)
      .execute();
  }

  withCreator(eb: ExpressionBuilder<DB, 'apiKeys'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'apiKeys.creatorId'),
    ).as('creator');
  }
}
