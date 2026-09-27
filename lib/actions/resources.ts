"use server";

import {
  NewResourceParams,
  insertResourceSchema,
  resources,
} from "@/lib/db/schema/resources";
import { db } from "../db";
import { generateEmbeddings } from "../ai/embedding";
import { embeddings as embeddingsTable } from "../db/schema/embeddings";

export const createResource = async (input: NewResourceParams) => {
  try {
    const { title, source, content } = insertResourceSchema.parse(input);

    const [resource] = await db
      .insert(resources)
      .values({ title, source, content })
      .returning();

    const embedded = await generateEmbeddings(content);
    if (embedded.length > 0) {
      await db.insert(embeddingsTable).values(
        embedded.map((chunk) => ({
          resourceId: resource.id,
          content: chunk.content,
          embedding: chunk.embedding,
          sourceTitle: title,
          section: chunk.section,
          chunkIndex: chunk.chunkIndex,
        })),
      );
    }

    return `Resource "${title}" created with ${embedded.length} chunks.`;
  } catch (e) {
    if (e instanceof Error)
      return e.message.length > 0 ? e.message : "Error, please try again.";
  }
};
