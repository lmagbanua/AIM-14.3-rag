# Cyber Guidance Chat — RAG mini project (AIM "Ship Your Own RAG 14.3")

Next.js chat app grounded in a PDF corpus. Built on the
[Vercel AI SDK RAG starter](https://github.com/vercel/ai-sdk-rag-starter)
with AI SDK v5.

**Live:** https://cyber-guidance-chat.vercel.app

- **Streams answers** (`streamText` → `toUIMessageStreamResponse` → `useChat`)
- **Retrieval is a tool call** (`searchKnowledgeBase` in
  `app/api/chat/route.ts`), not prompt stuffing — the model decides when to
  search and what query to use, and is instructed to always search before
  answering content questions
- **Citations UI**: under every answer, a "Sources" line lists each cited
  document with its pages (links open the source PDF at the first cited
  page), with an expandable list of the retrieved passages (title, page,
  similarity score). On desktop a side panel also shows the latest answer's
  passages. The corpus
  spans multiple PDFs, so citations always say *which document* as well as
  *which page*.
- **Meaningful empty state** with corpus description and clickable
  suggested-prompt chips
- **Secrets are server-side only**: `OPENAI_API_KEY` and `DATABASE_URL` are
  validated in `lib/env.mjs` (server section) and only touched by server
  code (API route, seed script). No `NEXT_PUBLIC_` secrets.

## Corpus

Three public U.S. government cybersecurity guides (checked into
`corpus/pdfs/`, listed with titles + source URLs in `corpus/manifest.json`):

| Document | Pages | Source |
| --- | --- | --- |
| NIST Cybersecurity Framework (CSF) 2.0 | 32 | [nvlpubs.nist.gov](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf) |
| FTC Data Breach Response: A Guide for Business | 16 | [ftc.gov](https://www.ftc.gov/system/files/documents/plain-language/pdf-0154_data-breach-response-guide-for-business-042519-508.pdf) |
| CISA Cyber Essentials Starter Kit | 17 | [cisa.gov](https://www.cisa.gov/sites/default/files/publications/Cyber%20Essentials%20Starter%20Kit_03.12.2021_508_0.pdf) |

## Stack

Next.js 14 (App Router) · Vercel AI SDK v5 · OpenAI (`gpt-4o-mini` chat,
`text-embedding-3-small` embeddings) · Postgres + pgvector · Drizzle ORM ·
`unpdf` (PDF text extraction) · Tailwind + shadcn/ui · `react-markdown` (answer rendering).

## Run locally

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL and OPENAI_API_KEY
pnpm db:migrate             # creates tables + pgvector extension + HNSW index
pnpm db:seed                # ingests every PDF in corpus/manifest.json
pnpm dev                    # http://localhost:3000
```

`DATABASE_URL` must point at a Postgres with the pgvector extension available
(Vercel Postgres/Neon/Supabase all work; locally,
`docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16`).

## Ingestion pipeline

`pnpm db:seed` (`scripts/seed.ts`) reads `corpus/manifest.json` and for each
PDF:

1. **Extraction** — `unpdf` extracts text page by page, so every chunk knows
   its 1-based page number.
2. **Chunking** (`lib/ai/chunking.ts`) — per page, split on sentence
   boundaries with overlap. Chunks never span pages: the page is the
   citation unit, and a chunk straddling two pages could not be cited
   precisely.
   - Chunk size: **1200 chars (~300 tokens)**, overlap: **200 chars**
   - Fragments under 40 chars are dropped (header/footer debris)
3. **Embedding** — `embedMany` with `text-embedding-3-small` (1536 dims).
4. **Storage** — chunks + vectors + metadata (`source_title`, `source_url`,
   `page`, `chunk_index`) in the `embeddings` table, HNSW cosine index.
   Metadata is denormalized onto each embedding row so one similarity query
   returns everything the citations UI needs.

Seeding is idempotent per file: re-running replaces rows for that source.

## Retrieval

`lib/ai/embedding.ts#findRelevantContent`: cosine similarity via pgvector
over chunks above a **0.3** similarity floor. It fetches the 24 best
candidates, then `diversifyBySource` (`lib/ai/retrieval.ts`) keeps the
**top 8** with **at most 4 per document**, backfilling from capped-out rows
when fewer documents are relevant. The cap stops one document from filling
every slot on cross-document questions; the floor lets the model answer
"not in the knowledge base" instead of paraphrasing weak matches.

## Swapping the corpus

1. Drop new PDFs into `corpus/pdfs/` and list them (file, title, url) in
   `corpus/manifest.json`.
2. Update the user-facing copy in `lib/config.ts` (app name, corpus
   description, example questions).
3. `pnpm db:seed`.

## Deploying to Vercel

Set `DATABASE_URL` and `OPENAI_API_KEY` as (server) environment variables in
the Vercel project, run migrations + seed against the production database
(`pnpm db:migrate && pnpm db:seed` locally with the prod `DATABASE_URL`),
then deploy. The build itself does not require these variables; if they are
missing at runtime, `/api/chat` responds 503 with a clear "not configured"
message (shown in the UI) instead of crashing, and `pnpm db:seed` exits with
an explanation. No stack traces or internals reach the client either way.

## Trade-offs / notes

- Character-based chunk sizing (not token-based) keeps the pipeline
  dependency-light; ~4 chars/token is accurate enough at this scale.
- Chunks are confined to a single page. Occasionally an idea straddles a
  page break and gets split; page-accurate citations were judged worth that
  cost for a graded project where citations must be verifiable.
- PDF extraction flattens layout (columns/tables become linear text). Good
  enough for these prose-heavy guides; a layout-aware extractor would be the
  upgrade path for table-dense corpora.
- Metadata is denormalized onto embedding rows — duplicates the title per
  chunk, but keeps retrieval a single query.
- `stopWhen: stepCountIs(documents + 2)` (5 steps with the current corpus)
  leaves room for one search per document on collection-wide questions
  ("summarize each document"), or a reformulated follow-up search, plus the
  final answer. The document titles from `corpus/manifest.json` are listed in
  the system prompt and tool description so the model can target a document
  by name.
- The model cites document + page in prose; the structured citation
  rendering comes from the tool-call outputs captured client-side, so the
  sources panel always reflects what was actually retrieved.
