export interface Chunk {
  content: string;
  section: string;
  chunkIndex: number;
}

// Tuned for text-embedding-3-small: big enough that a chunk carries a
// self-contained idea, small enough that top-k results fit comfortably
// in the prompt. Overlap keeps sentences that straddle a boundary
// retrievable from either side.
export const CHUNK_SIZE = 1200; // characters, ~300 tokens
export const CHUNK_OVERLAP = 200;

/**
 * Split a markdown document into chunks with section metadata.
 *
 * Strategy: split on headings first so every chunk belongs to exactly one
 * section (the heading path becomes citation metadata), then split long
 * sections on sentence boundaries with overlap. Short adjacent content in
 * the same section stays together.
 */
export function chunkMarkdown(markdown: string): Chunk[] {
  const sections = splitBySections(markdown);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    for (const piece of splitWithOverlap(section.content)) {
      const content = piece.trim();
      if (content.length < 40) continue; // skip heading-only / stub fragments
      chunks.push({ content, section: section.heading, chunkIndex });
      chunkIndex++;
    }
  }

  return chunks;
}

interface Section {
  heading: string;
  content: string;
}

function splitBySections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  // Track the heading path (e.g. "Benefits > Time off") so citations
  // locate the chunk even in deeply nested documents.
  const headingPath: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const content = current.join("\n").trim();
    if (content) {
      sections.push({ heading: headingPath.join(" > "), content });
    }
    current = [];
  };

  for (const line of lines) {
    const match = /^(#{1,4})\s+(.*)$/.exec(line);
    if (match) {
      flush();
      const level = match[1].length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = match[2].trim();
    } else {
      current.push(line);
    }
  }
  flush();

  return sections;
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
