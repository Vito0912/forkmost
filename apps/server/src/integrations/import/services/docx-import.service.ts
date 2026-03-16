import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../storage/storage.service';
import { getAttachmentFolderPath } from '../../../core/attachment/attachment.utils';
import { AttachmentType } from '../../../core/attachment/attachment.constants';
import { v7 } from 'uuid';
import { Readable } from 'stream';
import * as mammoth from 'mammoth';

@Injectable()
export class DocxImportService {
  private readonly logger = new Logger(DocxImportService.name);

  constructor(
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async convertDocxToHtml(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const result = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        convertImage: mammoth.images.imgElement((image) => {
          return this.processImage(image, workspaceId, spaceId, pageId, userId);
        }),
      },
    );

    for (const msg of result.messages) {
      if (msg.type === 'warning') {
        this.logger.warn(`DOCX import warning: ${msg.message}`);
      }
    }

    return result.value;
  }

  private async processImage(
    image: { contentType: string; read(): Promise<Buffer> },
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<{ src: string }> {
    try {
      const imageBuffer = await image.read();
      const contentType = image.contentType || 'image/png';

      const extMap: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/svg+xml': '.svg',
        'image/webp': '.webp',
        'image/bmp': '.bmp',
        'image/tiff': '.tiff',
      };

      const ext = extMap[contentType] || '.png';
      const attachmentId = v7();
      const fileName = `image${ext}`;

      const storagePath = `${getAttachmentFolderPath(
        AttachmentType.File,
        workspaceId,
      )}/${attachmentId}/${fileName}`;

      const apiPath = `/api/files/${attachmentId}/${fileName}`;

      const stream = Readable.from(imageBuffer);
      await this.storageService.uploadStream(storagePath, stream, {
        recreateClient: true,
      });

      await this.db
        .insertInto('attachments')
        .values({
          id: attachmentId,
          filePath: storagePath,
          fileName: fileName,
          fileSize: imageBuffer.byteLength,
          mimeType: contentType,
          type: 'file',
          fileExt: ext,
          creatorId: userId,
          workspaceId: workspaceId,
          pageId: pageId,
          spaceId: spaceId,
        })
        .execute();

      return { src: apiPath };
    } catch (error) {
      this.logger.error('Failed to process DOCX embedded image', error);
      return { src: '' };
    }
  }
}
