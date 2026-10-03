import type { Origin, PageManifestEntry } from "../domain/page";
import { bookKey } from "../shelf/model";
import { rankCandidates, type VectorHit } from "./candidates";
import { blockedIdsFor } from "./apply";
import { linkBoth, makeProposal } from "./proposals";
import {
  CROSS_BOOK_ONGOING_CAP,
  routeConfidence,
  type AutoApproved,
  type DismissedPair,
  type PendingProposal,
} from "./schema";
import type { JudgedLink } from "./propose";

export function bookLabelFromOrigins(origins: Origin[] | undefined): string | undefined {
  const label = origins?.find(origin => origin.kind === "book")?.label.trim();
  return label || undefined;
}

/** One book-key function for the rail tag and the Bookshelf exits. */
export function isCrossBookPair(bookA?: string, bookB?: string) {
  if (!bookA || !bookB) return false;
  return bookKey(bookA) !== bookKey(bookB);
}

export type CrossBookNote = {
  id: string;
  title: string;
  body: string;
  excerpt: string;
  connected: string[];
  book: string;
};

export function addCrossBookCandidates(input: {
  sourceBook?: string;
  linking: VectorHit[];
  sourceId: string;
  sourceVector: ArrayLike<number>;
  corpus: { pageId: string; title: string; excerpt?: string; vector: ArrayLike<number>; book?: string }[];
  connected: string[];
  skip: Set<string>;
  query: string;
  lexicalDocs?: { id: string; title: string; excerpt: string; book?: string }[];
  bookOf: (pageId: string) => string | undefined;
}): VectorHit[] {
  if (!input.sourceBook) return input.linking;
  const otherBook = (id: string) => {
    const book = input.bookOf(id);
    return Boolean(book && bookKey(book) !== bookKey(input.sourceBook!));
  };
  const have = new Set(input.linking.map(hit => hit.pageId));
  const crossCorpus = input.corpus.filter(entry => otherBook(entry.pageId));
  const crossDocs = (input.lexicalDocs ?? []).filter(doc => otherBook(doc.id));
  const useVectors = crossCorpus.some(entry => entry.vector.length) && input.sourceVector.length > 0;
  const ranked = rankCandidates({
    sourceId: input.sourceId,
    sourceVector: useVectors ? input.sourceVector : [],
    corpus: useVectors ? crossCorpus : [],
    connected: input.connected,
    skip: input.skip,
    k: CROSS_BOOK_ONGOING_CAP,
    query: input.query,
    lexicalDocs: crossDocs,
  }).linking;
  const extra = ranked
    .filter(hit => !have.has(hit.pageId))
    .slice(0, CROSS_BOOK_ONGOING_CAP)
    .map(hit => ({ ...hit, book: hit.book ?? input.bookOf(hit.pageId) }));
  return [...input.linking, ...extra];
}

export function mergeManifestConnected(
  rows: PageManifestEntry[],
  updates: { id: string; connected: string[] }[],
): PageManifestEntry[] {
  const byId = new Map(updates.map(update => [update.id, update.connected]));
  const missing = [...byId.keys()].filter(id => !rows.some(row => row.id === id));
  if (missing.length) throw new Error(`manifest has no entry for ${missing.join(", ")}`);
  return rows.map(row => {
    if (!byId.has(row.id)) return row;
    const connected = byId.get(row.id) ?? [];
    if (!connected.length) {
      const rest = { ...row };
      delete rest.connected;
      return rest;
    }
    return { ...row, connected };
  });
}

export type CrossBookResult = {
  notesProcessed: number;
  pairsJudged: number;
  autoApproved: AutoApproved[];
  queued: PendingProposal[];
  connected: { id: string; connected: string[] }[];
};

export async function runCrossBook(input: {
  notes: CrossBookNote[];
  pending: PendingProposal[];
  dismissed: DismissedPair[];
  book?: string;
  limit?: number;
  judge: (note: CrossBookNote, candidates: VectorHit[]) => Promise<JudgedLink[]>;
  now: () => string;
  vectors?: { pageId: string; title: string; excerpt?: string; vector: number[] }[];
}): Promise<CrossBookResult> {
  const wanted = input.book ? bookKey(input.book) : "";
  const selected = input.notes
    .filter(note => !wanted || bookKey(note.book) === wanted)
    .sort((a, b) => bookKey(a.book).localeCompare(bookKey(b.book)) || a.id.localeCompare(b.id));
  const slice = input.limit && input.limit > 0 ? selected.slice(0, input.limit) : selected;
  const connected = new Map(input.notes.map(note => [note.id, [...note.connected]]));
  const seen = new Set<string>();
  const autoApproved: AutoApproved[] = [];
  const queued: PendingProposal[] = [];
  let pairsJudged = 0;

  for (const note of slice) {
    const skip = blockedIdsFor(note.id, [...input.pending, ...queued], input.dismissed);
    for (const id of connected.get(note.id) ?? []) skip.add(id);
    for (const key of seen) {
      const [left, right] = key.split("||");
      if (left === note.id && right) skip.add(right);
      if (right === note.id && left) skip.add(left);
    }
    const pool = input.notes.filter(other => other.id !== note.id && isCrossBookPair(note.book, other.book));
    const poolIds = new Set(pool.map(other => other.id));
    const vectorRows = (input.vectors ?? []).filter(row => poolIds.has(row.pageId) && row.vector.length);
    const sourceVector = input.vectors?.find(row => row.pageId === note.id)?.vector ?? [];
    const hits = rankCandidates({
      sourceId: note.id,
      sourceVector: vectorRows.length && sourceVector.length ? sourceVector : [],
      corpus: vectorRows.length && sourceVector.length
        ? vectorRows.map(row => ({
            ...row,
            book: pool.find(other => other.id === row.pageId)?.book,
          }))
        : [],
      connected: [],
      skip,
      query: `${note.title}\n\n${note.excerpt}`,
      lexicalDocs: pool.map(other => ({
        id: other.id,
        title: other.title,
        excerpt: other.excerpt,
        book: other.book,
      })),
    }).linking;
    if (!hits.length) continue;
    const judgements = await input.judge(note, hits);
    for (const judgement of judgements) {
      const other = pool.find(item => item.id === judgement.pageId);
      if (!other) continue;
      const proposal = makeProposal({
        noteA: note.id,
        noteB: other.id,
        titleA: note.title,
        titleB: other.title,
        excerptA: note.excerpt,
        excerptB: other.excerpt,
        relation: judgement.relation,
        rationale: judgement.rationale,
        proposedAt: input.now(),
        confidence: judgement.confidenceExplicit ? judgement.confidence : undefined,
        bookA: note.book,
        bookB: other.book,
      });
      if (seen.has(proposal.id) || skip.has(other.id)) continue;
      seen.add(proposal.id);
      pairsJudged += 1;
      if (routeConfidence(judgement) === "auto" && judgement.confidence !== undefined && proposal.bookA && proposal.bookB) {
        const linked = linkBoth(connected.get(proposal.noteA), connected.get(proposal.noteB), proposal.noteA, proposal.noteB);
        connected.set(proposal.noteA, linked.a);
        connected.set(proposal.noteB, linked.b);
        autoApproved.push({
          noteA: proposal.noteA,
          noteB: proposal.noteB,
          titleA: proposal.titleA,
          titleB: proposal.titleB,
          bookA: proposal.bookA,
          bookB: proposal.bookB,
          relation: proposal.relation,
          rationale: proposal.rationale,
          confidence: judgement.confidence,
          approvedAt: input.now(),
        });
      } else {
        queued.push(proposal);
      }
    }
  }

  const changed = [...connected.entries()]
    .filter(([id, next]) => {
      const previous = input.notes.find(note => note.id === id)?.connected ?? [];
      return next.join("\0") !== previous.join("\0");
    })
    .map(([id, next]) => ({ id, connected: next }));

  return {
    notesProcessed: slice.length,
    pairsJudged,
    autoApproved,
    queued,
    connected: changed,
  };
}
