import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS page_embeddings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      space_id uuid,
      workspace_id uuid NOT NULL,
      attachment_id uuid,
      model_name text NOT NULL,
      model_dimensions integer NOT NULL,
      embedding vector(1536) NOT NULL,
      chunk_index integer DEFAULT 0,
      chunk_start integer DEFAULT 0,
      chunk_length integer DEFAULT 0,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      deleted_at timestamptz
    );
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS idx_page_embeddings_page_id ON page_embeddings(page_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_page_embeddings_workspace_id ON page_embeddings(workspace_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_page_embeddings_space_id ON page_embeddings(space_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_page_embeddings_deleted_at ON page_embeddings(deleted_at)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS page_embeddings CASCADE`.execute(db);
  await sql`DROP EXTENSION IF EXISTS vector CASCADE`.execute(db);
}
