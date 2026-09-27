export interface Chunk {
  content: string;
  page: number; // 1-based PDF page the chunk came from
  chunkIndex: number;
}

// Tuned for text-embedding-3-small: big enough that a chunk carries a
// self-contained idea, small enough that top-k results fit comfortably
// in the prompt. Overlap keeps sentences that straddle a boundary
// retrievable from either side.
export const CHUNK_SIZE = 1200; // characters, ~300 tokens
export const CHUNK_OVERLAP = 200;

/**
 * Split per-page PDF text into chunks with page metadata.
 *
 * Chunks never span pages: page numbers are the citation unit, and a
 * chunk that straddled two pages could not be cited precisely. Long
 * pages are split on sentence boundaries with overlap.
 */
export function chunkPages(pages: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  pages.forEach((pageText, i) => {
    // PDF extraction yields uneven whitespace; collapse it so chunk
    // boundaries land on real sentence structure.
    const text = pageText.replace(/\s+/g, " ").trim();
    for (const piece of splitWithOverlap(text)) {
      const content = piece.trim();
      if (content.length < 40) continue; // skip header/footer-only fragments
      chunks.push({ content, page: i + 1, chunkIndex });
      chunkIndex++;
    }
  });

  return chunks;
}

function splitWithOverlap(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const sentences = text.match(/[^.!?\n]+[.!?]?(\s+|$)/g) ?? [text];
  const pieces: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (buffer.length + sentence.length > CHUNK_SIZE && buffer.length > 0) {
      pieces.push(buffer);
      buffer = buffer.slice(-CHUNK_OVERLAP);
    }
    buffer += sentence;
  }
  if (buffer.trim().length > 0) pieces.push(buffer);

  return pieces;
}
