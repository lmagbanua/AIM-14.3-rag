import { openai } from "@ai-sdk/openai";

// Central model config: swap providers/models here only.
export const chatModel = openai("gpt-4o-mini");
export const embeddingModel = openai.textEmbeddingModel(
  "text-embedding-3-small",
);
export const EMBEDDING_DIMENSIONS = 1536;
