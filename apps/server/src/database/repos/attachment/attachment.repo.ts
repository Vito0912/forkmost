import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  Attachment,
  InsertableAttachment,
  UpdatableAttachment,
} from '@docmost/db/types/entity.types';
import { jsonObjectFrom } from 'kysely/helpers/postgres';

@Injectable()
export class AttachmentRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) { }

  private baseFields: Array<keyof Attachment> = [
    'id',
    'fileName',
    'filePath',
    'fileSize',
    'fileExt',
    'mimeType',
    'type',
    'creatorId',
    'pageId',
    'spaceId',
    'workspaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    attachmentId: string,
    opts?: {
      trx?: KyselyTransaction;
    },
  ): Promise<Attachment> {
    const db = dbOrTx(this.db, opts?.trx);

    return db
      .selectFrom('attachments')
      .select(this.baseFields)
      .where('id', '=', attachmentId)
      .executeTakeFirst();
  }

  async insertAttachment(
    insertableAttachment: InsertableAttachment,
    trx?: KyselyTransaction,
  ): Promise<Attachment> {
    const db = dbOrTx(this.db, trx);

    return db
      .insertInto('attachments')
      .values(insertableAttachment)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async findBySpaceId(
    spaceId: string,
    opts?: {
      trx?: KyselyTransaction;
    },
  ): Promise<Attachment[]> {
    const db = dbOrTx(this.db, opts?.trx);

    return db
      .selectFrom('attachments')
      .select(this.baseFields)
      .where('spaceId', '=', spaceId)
      .execute();
  }

  updateAttachmentsByPageId(
    updatableAttachment: UpdatableAttachment,
    pageIds: string[],
    trx?: KyselyTransaction,
  ) {
    return dbOrTx(this.db, trx)
      .updateTable('attachments')
      .set(updatableAttachment)
      .where('pageId', 'in', pageIds)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateAttachment(
    updatableAttachment: UpdatableAttachment,
    attachmentId: string,
  ): Promise<Attachment> {
    return await this.db
      .updateTable('attachments')
      .set(updatableAttachment)
      .where('id', '=', attachmentId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async deleteAttachmentById(attachmentId: string): Promise<void> {
    await this.db
      .deleteFrom('attachments')
      .where('id', '=', attachmentId)
      .executeTakeFirst();
  }

  async deleteAttachmentByFilePath(attachmentFilePath: string): Promise<void> {
    await this.db
      .deleteFrom('attachments')
      .where('filePath', '=', attachmentFilePath)
      .executeTakeFirst();
  }

  async findByFilePath(filePath: string): Promise<Attachment | undefined> {
    return this.db
      .selectFrom('attachments')
      .select(this.baseFields)
      .where('filePath', '=', filePath)
      .executeTakeFirst();
  }

  async searchByFileName(
    query: string,
    workspaceId: string,
    spaceIds: string[],
    limit: number = 25,
  ): Promise<any[]> {
    if (spaceIds.length === 0) return [];

    return this.db
      .selectFrom('attachments')
      .selectAll()
      .where('attachments.workspaceId', '=', workspaceId)
      .where('attachments.type', '=', 'file')
      .where('attachments.deletedAt', 'is', null)
      .where('attachments.spaceId', 'in', spaceIds)
      .where('attachments.fileName', 'ilike', `%${query}%`)
      .orderBy('attachments.createdAt', 'desc')
      .limit(limit)
      .execute();
  }

  async searchByFileNameWithRelations(
    query: string,
    workspaceId: string,
    spaceIds: string[],
    limit: number = 25,
  ): Promise<any[]> {
    if (spaceIds.length === 0) return [];

    const rows = await this.db
      .selectFrom('attachments')
      .select([
        'attachments.id',
        'attachments.fileName',
        'attachments.pageId',
        'attachments.creatorId',
        'attachments.createdAt',
        'attachments.updatedAt',
      ])
      .select((eb) => [
        jsonObjectFrom(
          eb
            .selectFrom('spaces')
            .select(['spaces.id', 'spaces.name', 'spaces.slug'])
            .whereRef('spaces.id', '=', 'attachments.spaceId'),
        ).as('space'),
        jsonObjectFrom(
          eb
            .selectFrom('pages')
            .select(['pages.id', 'pages.title', 'pages.slugId'])
            .whereRef('pages.id', '=', 'attachments.pageId'),
        ).as('page'),
      ])
      .where('attachments.workspaceId', '=', workspaceId)
      .where('attachments.type', '=', 'file')
      .where('attachments.deletedAt', 'is', null)
      .where('attachments.spaceId', 'in', spaceIds)
      .where('attachments.pageId', 'is not', null)
      .where('attachments.fileName', 'ilike', `%${query}%`)
      .orderBy('attachments.createdAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row: any) => ({
      id: row.id,
      fileName: row.fileName,
      pageId: row.pageId,
      creatorId: row.creatorId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      highlight: '',
      rank: '',
      space: row.space
        ? { ...row.space, icon: null }
        : { id: null, name: null, slug: null, icon: null },
      page: row.page || { id: null, title: null, slugId: null },
    }));
  }
}
