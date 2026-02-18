# AI Features Setup Guide

Open-source AI capabilities powered by OpenAI and OpenAI-compatible APIs.


### ⚠️ pgvector Requirement

AI search requires the **pgvector** extension to be installed in your database. The basic
`postgres`/`alpine` images do **not** include pgvector, so the extension cannot be enabled there.
Use a pgvector-enabled image (replace `postgres:16-alpine` with `pgvector/pgvector:pg16` in docker-compose.yml). IF you already have forkmost running, switching db image MIGHT work without data loss, but BACKUP YOUR DB FIRST!

## Features

- **Semantic Search (Ask AI)**: RAG-based Q&A over your workspace content using vector embeddings
- [PLANNED] **AI Writing Tools**: Content generation, improvement, translation, and more
- **Background Processing**: Automatic embedding generation for all pages via BullMQ
- **Admin Monitoring**: Basic queue stats, embedding coverage, and recent activity in AI settings

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

# Optional (useful if you want to override with self-hosted OpenAI compatible API)
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

1. Navigate to **Workspace Settings → AI**
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

### Llama.cpp (with OpenAI compatibility)
```bash
AI_DRIVER=openai
OPENAI_API_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
AI_EMBEDDING_MODEL=nomic-embed-text
AI_EMBEDDING_DIMENSION=768
AI_COMPLETION_MODEL=llama3
```
