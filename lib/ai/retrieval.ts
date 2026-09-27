// Pure retrieval-ranking logic, kept free of db/model imports (those
// validate env at load time) so it can be unit-tested without keys.

export interface RetrievedSource {
  content: string;
  sourceTitle: string;
  sourceUrl: string;
  page: number;
  similarity: number;
}

// Retrieval knobs: top-8 with a per-source cap so cross-document questions
// surface every document that has relevant chunks instead of one dominant
// source filling all slots; the 0.3 floor drops chunks that are only
// lexically adjacent so the model can honestly say "not in the corpus".
export const TOP_K = 8;
export const MIN_SIMILARITY = 0.3;
export const PER_SOURCE_CAP = 4;
// Fetch extra candidates so capping a dominant source can promote
// lower-ranked chunks from the other sources.
export const FETCH_K = 24;

// Picks up to topK rows from similarity-ordered candidates, capping each
// source at perSourceCap. If capping leaves slots unfilled (e.g. only one
// document is relevant), backfills from the capped-out rows so focused
// single-document questions still get a full context.
export function diversifyBySource(
  rows: RetrievedSource[],
  topK: number = TOP_K,
  perSourceCap: number = PER_SOURCE_CAP,
): RetrievedSource[] {
  const perSource = new Map<string, number>();
  const picked: RetrievedSource[] = [];
  const cappedOut: RetrievedSource[] = [];
  for (const row of rows) {
    const count = perSource.get(row.sourceTitle) ?? 0;
    if (count < perSourceCap) {
      picked.push(row);
      perSource.set(row.sourceTitle, count + 1);
    } else {
      cappedOut.push(row);
    }
    if (picked.length === topK) break;
  }
  for (const row of cappedOut) {
    if (picked.length === topK) break;
    picked.push(row);
  }
  return picked.sort((a, b) => b.similarity - a.similarity);
}
