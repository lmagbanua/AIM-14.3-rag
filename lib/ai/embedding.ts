import { embed, embedMany } from "ai";
import { cosineDistance, desc, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { embeddings } from "../db/schema/embeddings";
import { chunkMarkdown, type Chunk } from "./chunking";
import { embeddingModel } from "./models";

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export async function generateEmbeddings(
  content: string,
): Promise<EmbeddedChunk[]> {
  const chunks = chunkMarkdown(content);
  const { embeddings: vectors } = await embedMany({
    model: embeddingModel,
    values: chunks.map((chunk) => chunk.content),
  });
  return chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i] }));
}

export async function generateEmbedding(value: string): Promise<number[]> {
  const input = value.replaceAll("\n", " ");
  const { embedding } = await embed({ model: embeddingModel, value: input });
  return embedding;
}

export interface RetrievedSource {
  content: string;
  sourceTitle: string;
  section: string;
  similarity: number;
}

// Retrieval knobs: top-6 keeps the context focused; the 0.3 floor drops
// chunks that are only lexically adjacent so the model can honestly say
// "not in the corpus" instead of paraphrasing noise.
const TOP_K = 6;
const MIN_SIMILARITY = 0.3;

export async function findRelevantContent(
  userQuery: string,
): Promise<RetrievedSource[]> {
  const queryEmbedding = await generateEmbedding(userQuery);
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    queryEmbedding,
  )})`;

  const rows = await db
    .select({
      content: embeddings.content,
      sourceTitle: embeddings.sourceTitle,
      section: embeddings.section,
      similarity,
    })
    .from(embeddings)
    .where(gt(similarity, MIN_SIMILARITY))
    .orderBy((t) => desc(t.similarity))
    .limit(TOP_K);

  return rows;
}
