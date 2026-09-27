import { embed, embedMany } from "ai";
import { cosineDistance, desc, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { embeddings } from "../db/schema/embeddings";
import type { Chunk } from "./chunking";
import { embeddingModel } from "./models";
import {
  diversifyBySource,
  FETCH_K,
  MIN_SIMILARITY,
  type RetrievedSource,
} from "./retrieval";

export type { RetrievedSource };

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return [];
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
      sourceUrl: embeddings.sourceUrl,
      page: embeddings.page,
      similarity,
    })
    .from(embeddings)
    .where(gt(similarity, MIN_SIMILARITY))
    .orderBy((t) => desc(t.similarity))
    .limit(FETCH_K);

  return diversifyBySource(rows);
}
