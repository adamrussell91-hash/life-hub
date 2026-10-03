import { CANDIDATE_CAP, DUPLICATE_HOLD, LINK_FLOOR } from "./schema";
import { lexicalRetrieve, type LexicalDoc } from "../lib/lexicalRetrieve";

export type VectorHit = {
  pageId: string;
  title: string;
  excerpt: string;
  score: number;
  book?: string;
};

function cosine(left: ArrayLike<number>, right: ArrayLike<number>) {
  const n = Math.min(left.length, right.length);
  let dot = 0;
  let leftMag = 0;
  let rightMag = 0;
  for (let i = 0; i < n; i++) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    dot += a * b;
    leftMag += a * a;
    rightMag += b * b;
  }
  const divisor = Math.sqrt(leftMag) * Math.sqrt(rightMag);
  return divisor ? dot / divisor : 0;
}

export function rankCandidates(input: {
  sourceId: string;
  sourceVector: ArrayLike<number>;
  corpus: { pageId: string; title: string; excerpt?: string; vector: ArrayLike<number>; book?: string }[];
  connected: string[];
  skip: Set<string>;
  k?: number;
  floor?: number;
  query?: string;
  lexicalDocs?: (LexicalDoc & { book?: string })[];
}): { linking: VectorHit[]; heldBack: VectorHit[] } {
  const k = input.k ?? CANDIDATE_CAP;
  const floor = input.floor ?? LINK_FLOOR;
  const blocked = new Set([input.sourceId, ...input.connected, ...input.skip]);
  const hasVectors = input.corpus.some(entry => entry.vector.length);
  if (!hasVectors && input.query && input.lexicalDocs?.length) {
    const docs = input.lexicalDocs.filter(doc => !blocked.has(doc.id));
    const books = new Map(docs.flatMap(doc => (doc.book ? [[doc.id, doc.book] as const] : [])));
    const linking = lexicalRetrieve(docs, input.query, k).map(hit => ({
      pageId: hit.id,
      title: hit.title,
      excerpt: hit.excerpt,
      score: hit.score,
      ...(books.get(hit.id) ? { book: books.get(hit.id) } : {}),
    }));
    return { linking, heldBack: [] };
  }
  const ranked = input.corpus
    .filter(entry => !blocked.has(entry.pageId))
    .map(entry => ({
      pageId: entry.pageId,
      title: entry.title,
      excerpt: entry.excerpt ?? "",
      score: cosine(input.sourceVector, entry.vector),
      ...(entry.book ? { book: entry.book } : {}),
    }))
    .filter(hit => hit.score >= floor)
    .sort((left, right) => right.score - left.score)
    .slice(0, k);

  return {
    linking: ranked.filter(hit => hit.score < DUPLICATE_HOLD),
    heldBack: ranked.filter(hit => hit.score >= DUPLICATE_HOLD),
  };
}
