# Corpus Chat — RAG mini project (AIM "Ship Your Own RAG 14.3")

Next.js chat app grounded in a document corpus. Built on the
[Vercel AI SDK RAG starter](https://github.com/vercel/ai-sdk-rag-starter)
with AI SDK v5.

- **Streams answers** (`streamText` → `toUIMessageStreamResponse` → `useChat`)
- **Retrieval is a tool call** (`searchKnowledgeBase` in
  `app/api/chat/route.ts`), not prompt stuffing — the model decides when to
  search and what query to use, and is instructed to always search before
  answering content questions
- **Citations UI**: every retrieved passage is shown with source title,
  section, and similarity score — side panel on desktop, expandable
  "Sources" per message on mobile
- **Meaningful empty state** with corpus description and clickable example
  questions
- **Secrets are server-side only**: `OPENAI_API_KEY` and `DATABASE_URL` are
  validated in `lib/env.mjs` (server section) and only touched by server
  code (API route, server action, seed script). No `NEXT_PUBLIC_` secrets.

## Stack

Next.js 14 (App Router) · Vercel AI SDK v5 · OpenAI (`gpt-4o-mini` chat,
`text-embedding-3-small` embeddings) · Postgres + pgvector · Drizzle ORM ·
Tailwind + shadcn/ui.

## Run locally

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL and OPENAI_API_KEY
pnpm db:migrate             # creates tables + pgvector extension + HNSW index
pnpm db:seed                # ingests every .md file in /corpus
pnpm dev                    # http://localhost:3000
```

`DATABASE_URL` must point at a Postgres with the pgvector extension available
(Vercel Postgres/Neon/Supabase all work; locally,
`docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16`).

## Ingestion pipeline

`pnpm db:seed` (`scripts/seed.ts`) reads every markdown file in `/corpus`:

1. **Title** — first `# H1` becomes the citation's source title.
2. **Chunking** (`lib/ai/chunking.ts`) — markdown-aware: split on headings
   first so each chunk belongs to exactly one section (the heading path,
   e.g. `Time off and leave > Paid time off`, is stored as citation
   metadata), then split long sections on sentence boundaries.
   - Chunk size: **1200 chars (~300 tokens)**, overlap: **200 chars**
   - Fragments under 40 chars are dropped
3. **Embedding** — `embedMany` with `text-embedding-3-small` (1536 dims).
4. **Storage** — chunks + vectors + metadata (`source_title`, `section`,
   `chunk_index`) in the `embeddings` table, HNSW cosine index. Metadata is
   denormalized onto each embedding row so one similarity query returns
   everything the citations UI needs.

Seeding is idempotent per file: re-running replaces rows for that source.

## Retrieval

`lib/ai/embedding.ts#findRelevantContent`: cosine similarity via pgvector,
**top-6** chunks above a **0.3** similarity floor. The floor lets the model
answer "not in the knowledge base" instead of paraphrasing weak matches.

## Swapping in the real corpus

1. Replace the markdown files in `/corpus` (placeholder:
   `sebby-handbook.md`).
2. Update the user-facing copy in `lib/config.ts` (app name, corpus
   description, example questions).
3. `pnpm db:seed`.

PDF/HTML corpora need a markdown conversion step first (keep headings — they
drive the section metadata).

## Deploying to Vercel

Set `DATABASE_URL` and `OPENAI_API_KEY` as (server) environment variables in
the Vercel project, run migrations + seed against the production database
(`pnpm db:migrate && pnpm db:seed` locally with the prod `DATABASE_URL`),
then deploy. Note the env schema in `lib/env.mjs` fails the build if either
variable is missing — that's intentional.

## Trade-offs / notes

- Character-based chunk sizing (not token-based) keeps the pipeline
  dependency-free; ~4 chars/token is accurate enough at this scale.
- Metadata is denormalized onto embedding rows — duplicates the title per
  chunk, but keeps retrieval a single query.
- `stopWhen: stepCountIs(3)` allows the model one retrieval, an answer, and
  one self-reformulated follow-up search if the first query misses.
- The model cites sources in prose ("According to …"); the structured
  citation rendering comes from the tool-call outputs captured client-side,
  so citations always reflect what was actually retrieved.
