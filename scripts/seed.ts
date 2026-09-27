/**
 * Ingest every markdown file in /corpus into the vector store.
 *
 * Usage: pnpm db:seed
 * Requires DATABASE_URL and OPENAI_API_KEY. Idempotent per source file:
 * re-running replaces previously ingested rows for the same file.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { resources } from "../lib/db/schema/resources";
import { embeddings } from "../lib/db/schema/embeddings";
import { generateEmbeddings } from "../lib/ai/embedding";

const CORPUS_DIR = path.join(process.cwd(), "corpus");

function titleFrom(markdown: string, fileName: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown);
  return heading ? heading[1].trim() : fileName.replace(/\.mdx?$/, "");
}

async function main() {
  const files = (await readdir(CORPUS_DIR)).filter((f) => /\.mdx?$/.test(f));
  if (files.length === 0) {
    console.error(`No markdown files found in ${CORPUS_DIR}`);
    process.exit(1);
  }

  for (const file of files) {
    const source = `corpus/${file}`;
    const content = await readFile(path.join(CORPUS_DIR, file), "utf8");
    const title = titleFrom(content, file);

    // Replace any previous ingestion of this file (embeddings cascade).
    await db.delete(resources).where(eq(resources.source, source));

    const [resource] = await db
      .insert(resources)
      .values({ title, source, content })
      .returning();

    const chunks = await generateEmbeddings(content);
    if (chunks.length > 0) {
      await db.insert(embeddings).values(
        chunks.map((chunk) => ({
          resourceId: resource.id,
          content: chunk.content,
          embedding: chunk.embedding,
          sourceTitle: title,
          section: chunk.section,
          chunkIndex: chunk.chunkIndex,
        })),
      );
    }

    console.log(`Ingested ${source} — "${title}", ${chunks.length} chunks`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
