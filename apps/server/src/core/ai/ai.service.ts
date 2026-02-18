import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { sql } from 'kysely';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AiAskDto, AiGenerateDto } from './dto/ai.dto';
import { ChatMessage, OpenAiService } from './openai/openai.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { isPageEmbeddingsTableExists } from '@docmost/db/helpers/helpers';

interface StreamResponder {
  write: (chunk: string) => void;
  end: () => void;
}

interface ContextChunk {
  pageId: string;
  spaceId: string;
  title: string | null;
  spaceSlug: string;
  link: string;
  slugId: string | null;
  chunkIndex: number;
  distance?: number;
  chunkCount?: number;
  text: string;
}

interface QueueCounts {
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
}

interface PageCounts {
  totalPages?: number;
  pagesWithEmbeddings?: number;
  pagesWithoutEmbeddings?: number;
}

interface ChunkStats {
  totalChunks: number;
  recent: Array<{
    pageId: string;
    title: string | null;
    slugId: string | null;
    spaceSlug: string | null;
    chunkIndex: number;
    createdAt: Date;
    link: string;
  }>;
}

export interface AiStatusResponse {
  driver: string | undefined;
  embeddingsTable: boolean;
  queueCounts?: QueueCounts;
  pageCounts?: PageCounts;
  chunkStats?: ChunkStats;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly CHUNK_SIZE = 1500;
  private readonly PAGE_LINK_PREFIX = '/page/';

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly openAiService: OpenAiService,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  private ensureOpenAiDriver() {
    if (this.environmentService.getAiDriver() !== 'openai') {
      throw new BadRequestException(
        'AI driver is not set to openai. Set AI_DRIVER=openai.',
      );
    }
  }

  async generate(dto: AiGenerateDto): Promise<{ content: string }> {
    this.ensureOpenAiDriver();

    const model =
      this.environmentService.getAiCompletionModel() || 'gpt-4o-mini';
    const messages = this.buildMessages(dto);

    return this.openAiService.chatCompletion({
      model,
      messages,
    });
  }

  async generateStream(dto: AiGenerateDto, res: StreamResponder) {
    this.ensureOpenAiDriver();

    const model =
      this.environmentService.getAiCompletionModel() || 'gpt-4o-mini';
    const messages = this.buildMessages(dto);

    try {
      await this.openAiService.chatCompletionStream(
        {
          model,
          messages,
        },
        (chunk) => {
          if (chunk?.content) {
            res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
          }
        },
      );
      res.write('data: [DONE]\n\n');
    } catch (err) {
      this.logger.error(`AI stream failed`, err as Error);
      throw new InternalServerErrorException('AI stream failed');
    } finally {
      res.end();
    }
  }

  async askStream(dto: AiAskDto, res: StreamResponder) {
    this.ensureOpenAiDriver();

    const contexts =
      (await isPageEmbeddingsTableExists(this.db)) && dto.workspaceId
        ? await this.retrieveContexts(dto.query, dto.workspaceId, dto.spaceId)
        : [];
    const uniquePageCount = new Set(contexts.map((c) => c.pageId)).size;

    const model =
      this.environmentService.getAiCompletionModel() || 'gpt-4o-mini';
    const system =
      'You are a helpful documentation assistant. Use the provided context snippets when relevant. Answer concisely. If you are unsure, say you do not have enough information.';
    const contextBlock =
      contexts.length > 0
        ? contexts
            .map(
              (c, idx) =>
                `Source #${idx + 1} (page ${c.pageId}${c.title ? `: ${c.title}` : ''}):\n${c.text}\nLink: ${c.link}`,
            )
            .join('\n---\n')
        : 'No relevant context available.';
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Context:\n${contextBlock}\n\nQuestion: ${dto.query}`,
      },
    ];

    // Log RAG flow for debugging
    const promptPreview = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join(' | ')
      .slice(0, 500);
    this.logger.log(
      `[ask] workspace=${dto.workspaceId ?? 'n/a'}${dto.spaceId ? ` space=${dto.spaceId}` : ''} ragPieces=${contexts.length} prompt="${promptPreview}"`,
    );

    // Send context metadata/sources to client early for transparency
    try {
      const sourcePayload = contexts.map((c) => ({
        pageId: c.pageId,
        title: c.title,
        slugId: c.slugId,
        spaceSlug: c.spaceSlug,
        link: c.link,
        chunkIndex: c.chunkIndex,
        chunkCount: c.chunkCount,
        excerpt: c.text,
        similarity: c.distance != null ? 1 / (1 + c.distance) : undefined,
        distance: c.distance,
      }));
      res.write(
        `data: ${JSON.stringify({
          sources: sourcePayload,
          meta: { chunkCount: contexts.length, pageCount: uniquePageCount },
        })}\n\n`,
      );
    } catch (err) {
      this.logger.warn('[ask] failed to emit source metadata', err as Error);
    }

    try {
      await this.openAiService.chatCompletionStream(
        {
          model,
          messages,
        },
        (chunk) => {
          if (chunk?.content) {
            res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
          }
        },
      );
      res.write(`data: ${JSON.stringify({ sources: [] })}\n\n`);
      res.write('data: [DONE]\n\n');
    } catch (err) {
      this.logger.error(`AI ask stream failed`, err as Error);
      throw new InternalServerErrorException('AI ask stream failed');
    } finally {
      res.end();
    }
  }

  private async retrieveContexts(query: string, workspaceId: string, spaceId?: string): Promise<ContextChunk[]> {
    const embeddingModel = this.environmentService.getAiEmbeddingModel();
    if (!embeddingModel) {
      this.logger.warn('[ask] AI_EMBEDDING_MODEL not set; skipping retrieval');
      return [];
    }

    const queryEmbedding = await this.createEmbedding(query, embeddingModel);
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    let queryBuilder = this.db
      .selectFrom('pageEmbeddings as pe')
      .innerJoin('pages as p', 'p.id', 'pe.pageId')
      .innerJoin('spaces as s', 's.id', 'p.spaceId')
      .select([
        'pe.pageId as pageId',
        'pe.spaceId as spaceId',
        'pe.chunkIndex as chunkIndex',
        'pe.chunkLength as chunkLength',
        'p.textContent as textContent',
        'p.title as title',
        'p.slugId as slugId',
        'pe.metadata as metadata',
        's.slug as spaceSlug',
        sql<number>`pe.embedding <-> ${sql`${vectorLiteral}::vector`}`.as(
          'distance',
        ),
      ])
      .where('pe.workspaceId', '=', workspaceId)
      .where('pe.deletedAt', 'is', null)
      .where('p.deletedAt', 'is', null);

    if (spaceId) {
      queryBuilder = queryBuilder.where('pe.spaceId', '=', spaceId);
    }

    const rows = await queryBuilder
      .orderBy(sql`pe.embedding <-> ${sql`${vectorLiteral}::vector`}`)
      .limit(8)
      .execute();

    const pageIds = Array.from(new Set(rows.map((r) => r.pageId)));
    const chunkCounts = new Map<string, number>();
    if (pageIds.length) {
      const counts = await this.db
        .selectFrom('pageEmbeddings')
        .select([
          'pageId',
          (eb) => eb.fn.count<number>('id').as('count'),
        ])
        .where('workspaceId', '=', workspaceId)
        .where('pageId', 'in', pageIds)
        .groupBy('pageId')
        .execute();
      counts.forEach((c) => chunkCounts.set(c.pageId as any, Number(c.count)));
    }

    const contexts = rows.map((row) => {
      const meta = (row as any).metadata as any;
      const slugId = meta?.slugId ?? (row as any).slugId;
      const link =
        slugId || row.pageId
          ? `${this.PAGE_LINK_PREFIX}${slugId ?? row.pageId}`
          : '';
      const chunks = this.chunkText(row.textContent || '');
      const text = chunks[row.chunkIndex] ?? row.textContent?.slice(0, this.CHUNK_SIZE) ?? '';
      return {
        pageId: row.pageId,
        spaceId: row.spaceId,
        title: row.title,
        spaceSlug: (row as any).spaceSlug,
        link,
        slugId,
        chunkIndex: row.chunkIndex,
        distance: (row as any).distance as number | undefined,
        chunkCount: chunkCounts.get(row.pageId) ?? undefined,
        text,
      };
    });

    this.logger.log(
      `[ask] retrieved ${contexts.length} context chunks for workspace=${workspaceId}${spaceId ? ` space=${spaceId}` : ''}`,
    );

    return contexts;
  }

  private async createEmbedding(text: string, model: string): Promise<number[]> {
    const apiKey = this.environmentService.getOpenAiApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for embeddings');
    }
    const baseUrl =
      this.environmentService.getOpenAiApiUrl() || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Embedding failed: ${response.status} ${txt}`);
    }

    const json = (await response.json()) as any;
    const vector = json?.data?.[0]?.embedding as number[] | undefined;
    if (!vector) {
      throw new Error('Embedding response missing embedding vector');
    }
    return vector;
  }

  private chunkText(text: string): string[] {
    if (!text) return [];
    const normalized = text.replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ');
    const chunks: string[] = [];
    let buffer: string[] = [];

    for (const word of words) {
      if (buffer.join(' ').length + word.length + 1 > this.CHUNK_SIZE) {
        chunks.push(buffer.join(' '));
        buffer = [];
      }
      buffer.push(word);
    }
    if (buffer.length) {
      chunks.push(buffer.join(' '));
    }
    return chunks;
  }

  private buildMessages(dto: AiGenerateDto): ChatMessage[] {
    const system =
      'You are a helpful writing assistant. Keep responses concise and in the same language as the input.';
    const userPrompt =
      dto.prompt ||
      dto.content ||
      'Help improve the following content while keeping meaning unchanged.';

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ];

    return messages;
  }

  async status(workspaceId?: string): Promise<AiStatusResponse> {
    const embeddingsTable = await isPageEmbeddingsTableExists(this.db);
    let queueCounts: QueueCounts = {};
    let pageCounts: PageCounts = {};
    let chunkStats: ChunkStats | undefined;

    try {
      queueCounts = await this.aiQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
    } catch (err) {
      this.logger.debug(`Failed to read AI queue counts`, err as Error);
    }

    if (workspaceId && embeddingsTable) {
      try {
        const totalPagesRes = await this.db
          .selectFrom('pages')
          .select((eb) => eb.fn.count<number>('id').as('count'))
          .where('workspaceId', '=', workspaceId)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();

        const pagesWithEmbeddingsRes = await this.db
          .selectFrom('pageEmbeddings')
          .select((eb) =>
            sql<number>`count(distinct ${eb.ref('pageId')})`.as('count'),
          )
          .where('workspaceId', '=', workspaceId)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();

        const totalPages = totalPagesRes?.count ?? 0;
        const pagesWithEmbeddings = Number(
          pagesWithEmbeddingsRes?.count ?? 0,
        );
        const pagesWithoutEmbeddings = Math.max(
          0,
          totalPages - pagesWithEmbeddings,
        );

        pageCounts = {
          totalPages,
          pagesWithEmbeddings,
          pagesWithoutEmbeddings,
        };

        const totalChunksRes = await this.db
          .selectFrom('pageEmbeddings')
          .select((eb) => eb.fn.count<number>('id').as('count'))
          .where('workspaceId', '=', workspaceId)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();

        const recent = await this.db
          .selectFrom('pageEmbeddings as pe')
          .innerJoin('pages as p', 'p.id', 'pe.pageId')
          .innerJoin('spaces as s', 's.id', 'p.spaceId')
          .select([
            'pe.pageId as pageId',
            'pe.chunkIndex as chunkIndex',
            'pe.createdAt as createdAt',
            'p.title as title',
            'p.slugId as slugId',
            's.slug as spaceSlug',
          ])
          .where('pe.workspaceId', '=', workspaceId)
          .where('pe.deletedAt', 'is', null)
          .where('p.deletedAt', 'is', null)
          .orderBy('pe.createdAt', 'desc')
          .limit(3)
          .execute();

        chunkStats = {
          totalChunks: Number(totalChunksRes?.count ?? 0),
          recent: recent.map((r) => ({
            pageId: r.pageId,
            title: (r as any).title,
            slugId: (r as any).slugId,
            spaceSlug: (r as any).spaceSlug,
            chunkIndex: r.chunkIndex,
            createdAt: r.createdAt as Date,
            link:
              r.slugId || r.pageId
                ? `${this.PAGE_LINK_PREFIX}${(r as any).slugId ?? r.pageId}`
                : '',
          })),
        };
      } catch (err) {
        this.logger.debug(`Failed to read embedding page counts`, err as Error);
      }
    }

    return {
      driver: this.environmentService.getAiDriver(),
      embeddingsTable,
      queueCounts,
      pageCounts,
      chunkStats,
    };
  }
}
