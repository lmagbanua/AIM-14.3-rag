/**
 * Standalone checks for diversifyBySource in lib/ai/retrieval.ts (SEB-13
 * DEF-3). Run with: pnpm tsx scripts/test-retrieval-diversity.ts
 * Exits non-zero on the first failed assertion. No DB or API key needed.
 */
import assert from "node:assert/strict";

import {
  diversifyBySource,
  type RetrievedSource,
} from "../lib/ai/retrieval";

const CISA = "CISA Cyber Essentials Starter Kit";
const NIST = "NIST Cybersecurity Framework (CSF) 2.0";
const FTC = "FTC Data Breach Response: A Guide for Business";

let nextPage = 1;
const row = (sourceTitle: string, similarity: number): RetrievedSource => ({
  content: `chunk ${similarity}`,
  sourceTitle,
  sourceUrl: "https://example.gov/doc.pdf",
  page: nextPage++,
  similarity,
});

const bySimilarityDesc = (rows: RetrievedSource[]) =>
  [...rows].sort((a, b) => b.similarity - a.similarity);

const sources = (rows: RetrievedSource[]) =>
  new Set(rows.map((r) => r.sourceTitle));

// DEF-3 repro shape: one document dominates the ranking but others have
// relevant chunks further down. The cap must let the other documents in.
{
  const candidates = bySimilarityDesc([
    row(CISA, 0.6),
    row(CISA, 0.58),
    row(CISA, 0.56),
    row(CISA, 0.54),
    row(CISA, 0.52),
    row(CISA, 0.5),
    row(NIST, 0.45),
    row(NIST, 0.44),
    row(FTC, 0.42),
    row(CISA, 0.41),
  ]);
  const picked = diversifyBySource(candidates, 8, 4);
  assert.equal(picked.length, 8);
  assert.equal(picked.filter((r) => r.sourceTitle === CISA).length, 5); // 4 capped + 1 backfill
  assert.equal(picked.filter((r) => r.sourceTitle === NIST).length, 2);
  assert.equal(picked.filter((r) => r.sourceTitle === FTC).length, 1);
  assert.ok(sources(picked).size >= 2, "cross-doc question must span >=2 sources");
}

// Only one document is relevant: backfill must still return a full topK so
// focused single-document questions don't lose context.
{
  const candidates = bySimilarityDesc(
    Array.from({ length: 12 }, (_, i) => row(NIST, 0.6 - i * 0.01)),
  );
  const picked = diversifyBySource(candidates, 8, 4);
  assert.equal(picked.length, 8);
  assert.ok(picked.every((r) => r.sourceTitle === NIST));
}

// Fewer candidates than topK: return all of them, still capped-then-backfilled.
{
  const candidates = bySimilarityDesc([
    row(FTC, 0.5),
    row(FTC, 0.45),
    row(NIST, 0.4),
  ]);
  const picked = diversifyBySource(candidates, 8, 4);
  assert.equal(picked.length, 3);
  assert.equal(sources(picked).size, 2);
}

// Empty retrieval (out-of-corpus question) stays empty — the honest-decline
// path in the prompt depends on this.
{
  assert.deepEqual(diversifyBySource([], 8, 4), []);
}

// Output is always ordered by similarity descending, even after backfill
// interleaves capped-out rows.
{
  const candidates = bySimilarityDesc([
    ...Array.from({ length: 6 }, (_, i) => row(CISA, 0.6 - i * 0.01)),
    row(NIST, 0.5),
    row(FTC, 0.48),
  ]);
  const picked = diversifyBySource(candidates, 8, 4);
  for (let i = 1; i < picked.length; i++) {
    assert.ok(picked[i - 1].similarity >= picked[i].similarity);
  }
  assert.equal(picked.length, 8);
  assert.equal(sources(picked).size, 3);
}

// Per-source cap is respected whenever other sources can fill the slots.
{
  const candidates = bySimilarityDesc([
    ...Array.from({ length: 10 }, (_, i) => row(CISA, 0.6 - i * 0.01)),
    ...Array.from({ length: 10 }, (_, i) => row(NIST, 0.45 - i * 0.01)),
  ]);
  const picked = diversifyBySource(candidates, 8, 4);
  assert.equal(picked.filter((r) => r.sourceTitle === CISA).length, 4);
  assert.equal(picked.filter((r) => r.sourceTitle === NIST).length, 4);
}

console.log("test-retrieval-diversity: all assertions passed");
