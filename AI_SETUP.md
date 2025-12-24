# AI Features Setup Guide

This fork includes open-source AI capabilities powered by OpenAI and OpenAI-compatible APIs.

## Features

- **Semantic Search (Ask AI)**: RAG-based Q&A over your workspace content using vector embeddings
- **AI Writing Tools**: Content generation, improvement, translation, and more (via `/api/ai/generate`)
- **Background Processing**: Automatic embedding generation for all pages via BullMQ
- **Admin Monitoring**: Queue stats, embedding coverage, and recent activity in AI settings

## Quick Start

### 1. Environment Variables

Add these to your `.env` file:

```bash
# Required
OPENAI_API_KEY=sk-proj-xxx
AI_DRIVER=openai
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_DIMENSION=1536
AI_COMPLETION_MODEL=gpt-4o-mini

# Optional (for self-hosted APIs)
OPENAI_API_URL=https://api.openai.com/v1
```

### 2. Database Setup

Ensure you're using the **pgvector-enabled PostgreSQL** image:

```yaml
# docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
```

### 3. Run Migrations

```bash
pnpm nx run server:migration:latest
```

This creates the `page_embeddings` table with pgvector support.

### 4. Enable AI Search

1. Navigate to **Settings → AI**
2. Toggle **AI search** ON
3. Embeddings will be generated in the background

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_DRIVER` | AI provider (`openai`) | - |
| `OPENAI_API_KEY` | API key for OpenAI or compatible service | - |
| `OPENAI_API_URL` | Base URL for API | `https://api.openai.com/v1` |
| `AI_EMBEDDING_MODEL` | Model for embeddings | - |
| `AI_EMBEDDING_DIMENSION` | Vector dimensions (must match model) | - |
| `AI_COMPLETION_MODEL` | Model for completions | `gpt-4o-mini` |

## Self-Hosted OpenAI-Compatible APIs

Works with any OpenAI-compatible API:

### LocalAI
```bash
AI_DRIVER=openai
OPENAI_API_URL=http://localhost:8080/v1
OPENAI_API_KEY=sk-fake
AI_EMBEDDING_MODEL=text-embedding-ada-002
AI_COMPLETION_MODEL=gpt-3.5-turbo
```

### Ollama (with OpenAI compatibility)
```bash
AI_DRIVER=openai
OPENAI_API_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
AI_EMBEDDING_MODEL=nomic-embed-text
AI_EMBEDDING_DIMENSION=768
AI_COMPLETION_MODEL=llama3
```

### LM Studio
```bash
AI_DRIVER=openai
OPENAI_API_URL=http://localhost:1234/v1
OPENAI_API_KEY=lm-studio
```

## Monitoring

### Admin UI (Settings → AI)

- **Queue Stats**: Waiting, active, completed, and failed jobs
- **Embedding Coverage**: Pages with/without embeddings
- **Recent Activity**: Last 3 chunks indexed with timestamps

### Server Logs

All AI operations log with structured context:

```
[ai] workspace=abc123 model=text-embedding-3-small chunks=5 status=success
[ai-embeddings] page=xyz789 workspace=abc123 chunks=5 model=text-embedding-3-small
[ask] workspace=abc123 space=def456 ragPieces=8 prompt="..."
```

## API Endpoints

### Ask AI (Streaming)
```http
POST /api/ai/ask
Content-Type: application/json

{
  "query": "How do I configure authentication?",
  "spaceId": "optional-space-id"
}
```

Returns SSE stream with:
- `sources`: Relevant page chunks
- `meta`: Context stats (chunk count, page count)
- `content`: Streamed answer tokens
- `[DONE]`: End marker

### Generate (Streaming)
```http
POST /api/ai/generate/stream
Content-Type: application/json

{
  "content": "Draft a welcome message",
  "action": "improve_writing"
}
```

### Status
```http
GET /api/ai/status
```

Returns queue stats, embedding coverage, and recent chunks.

## Troubleshooting

### No embeddings generated

1. Check queue processor logs:
   ```bash
   docker logs forkmost-server | grep embeddings
   ```

2. Verify pgvector:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'vector';
   ```

3. Check migration:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_name = 'page_embeddings';
   ```

### AI search not working

1. Check workspace settings: `ai.search = true`
2. Verify API key is valid
3. Check embedding dimension matches model
4. Ensure `AI_DRIVER=openai` is set

### Performance optimization

**Parallel embedding generation** (future improvement):

The current implementation processes chunks sequentially. For better performance, modify `ai.queue.processor.ts` to generate embeddings in parallel using `Promise.all()`.

## Architecture

```
Client (React)
  ↓
/api/ai/ask → AiController → AiService
                                ↓
                             OpenAiService → OpenAI API
                                ↓
                          Retrieve contexts from pgvector
                                ↓
                          Stream RAG response
```

### Background Processing

```
Page Created/Updated
  ↓
Enqueue Job (AI_QUEUE)
  ↓
AiQueueProcessor
  ↓
Chunk text → Generate embeddings → Store in page_embeddings
```

## License

This AI implementation is released under the same license as Forkmost. See LICENSE file.
