import { nanoid } from "@/lib/utils";
import {
  index,
  integer,
  pgTable,
  text,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { resources } from "./resources";

export const embeddings = pgTable(
  "embeddings",
  {
    id: varchar("id", { length: 191 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    resourceId: varchar("resource_id", { length: 191 }).references(
      () => resources.id,
      { onDelete: "cascade" },
    ),
    // Chunk text sent to the model as retrieved context.
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    // Citation metadata, denormalized so a similarity query returns
    // everything the UI needs without a join.
    sourceTitle: text("source_title").notNull(),
    sourceUrl: text("source_url").notNull().default(""),
    page: integer("page").notNull().default(1),
    chunkIndex: integer("chunk_index").notNull().default(0),
  },
  (table) => ({
    embeddingIndex: index("embeddingIndex").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);
