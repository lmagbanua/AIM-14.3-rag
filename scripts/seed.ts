/**
 * Ingest every PDF listed in corpus/manifest.json into the vector store.
 *
 * Usage: pnpm db:seed
 * Requires DATABASE_URL and OPENAI_API_KEY. Idempotent per source file:
 * re-running replaces previously ingested rows for the same file.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { resources } from "../lib/db/schema/resources";
import { embeddings } from "../lib/db/schema/embeddings";
import { chunkPages } from "../lib/ai/chunking";

const CORPUS_DIR = path.join(process.cwd(), "corpus");

interface ManifestEntry {
  file: string;
  title: string;
  url: string;
}

async function main() {
  const missing = ["DATABASE_URL", "OPENAI_API_KEY"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    console.error(
      `Cannot seed: missing ${missing.join(
        " and ",
      )}. Copy .env.example to .env and fill in the values.`,
    );
    process.exit(1);
  }

  // Imported after the env check: these modules validate env at load time,
  // so a static import would exit with a validation error before the
  // friendlier message above.
  const [{ db }, { embedChunks }] = await Promise.all([
    import("../lib/db"),
    import("../lib/ai/embedding"),
  ]);

  const manifest: ManifestEntry[] = JSON.parse(
    await readFile(path.join(CORPUS_DIR, "manifest.json"), "utf8"),
  );
  if (manifest.length === 0) {
    console.error("corpus/manifest.json lists no documents");
    process.exit(1);
  }

  for (const { file, title, url } of manifest) {
    const source = `corpus/${file}`;
    const buffer = await readFile(path.join(CORPUS_DIR, file));
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text: pages } = await extractText(pdf, {
      mergePages: false,
    });

    const chunks = chunkPages(pages);
    const embedded = await embedChunks(chunks);

    // Replace any previous ingestion of this file (embeddings cascade).
    await db.delete(resources).where(eq(resources.source, source));

    const [resource] = await db
      .insert(resources)
      .values({ title, source, content: pages.join("\n\n") })
      .returning();

    if (embedded.length > 0) {
      await db.insert(embeddings).values(
        embedded.map((chunk) => ({
          resourceId: resource.id,
          content: chunk.content,
          embedding: chunk.embedding,
          sourceTitle: title,
          sourceUrl: url,
          page: chunk.page,
          chunkIndex: chunk.chunkIndex,
        })),
      );
    }

    console.log(
      `Ingested ${source} — "${title}", ${totalPages} pages, ${embedded.length} chunks`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
