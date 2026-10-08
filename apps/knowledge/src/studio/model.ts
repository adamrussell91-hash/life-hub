// Pure Studio maths: research coverage, words already in your notes, shared
// research between ideas, and the things Clementine points out. No DOM, no fetch.
import { lexicalRetrieve, tokenize, type LexicalDoc } from "../lib/lexicalRetrieve";
import type { StudioBook, StudioChapter, StudioData, StudioNote } from "./schema";

export type FlatChapter = StudioChapter & { part: number; index: number };

export function flatChapters(book: StudioBook): FlatChapter[] {
  let index = 0;
  return (book.parts ?? []).flatMap((part, p) => part.chapters.map(ch => ({ ...ch, part: p, index: index++ })));
}

export function chapterCount(book: StudioBook): number {
  if (book.parts) return flatChapters(book).length;
  if (book.interview) return book.interview.cast.length;
  if (book.history) return book.history.schools.length;
  return 0;
}

const known = (data: StudioData, ref: string): StudioNote | undefined => data.notes[ref];
export const inKnowledge = (data: StudioData, ref: string) => known(data, ref)?.in_knowledge === true;

/** Chapters with at least one note that actually lives in Knowledge. */
export function researchedChapters(book: StudioBook, data: StudioData): FlatChapter[] {
  return flatChapters(book).filter(ch => ch.notes.some(ref => inKnowledge(data, ref)));
}

export function chapterWords(ch: StudioChapter, data: StudioData): number {
  return [...new Set(ch.notes)].reduce((sum, ref) => sum + (inKnowledge(data, ref) ? known(data, ref)!.words : 0), 0);
}

export type AlreadyWritten = {
  /** Words across the distinct Knowledge notes tied to this book's chapters. */
  words: number;
  /** Same, for every note the book cites (chapter or not). */
  allWords: number;
  notes: number;
  missing: number;
  /** 0–1: share of chapters with material behind them. */
  ink: number;
};

export function alreadyWritten(book: StudioBook, data: StudioData): AlreadyWritten {
  const chapterRefs = new Set(flatChapters(book).flatMap(ch => ch.notes));
  const allRefs = new Set([...book.notes, ...chapterRefs]);
  const sum = (refs: Set<string>) =>
    [...refs].reduce((total, ref) => total + (inKnowledge(data, ref) ? known(data, ref)!.words : 0), 0);
  const count = chapterCount(book);
  return {
    words: sum(chapterRefs),
    allWords: sum(allRefs),
    notes: [...allRefs].filter(ref => inKnowledge(data, ref)).length,
    missing: [...allRefs].filter(ref => known(data, ref) && !inKnowledge(data, ref)).length,
    ink: book.parts && count ? researchedChapters(book, data).length / count : 0,
  };
}

export function knowledgeRefs(book: StudioBook, data: StudioData): string[] {
  const refs = new Set([...book.notes, ...flatChapters(book).flatMap(ch => ch.notes)]);
  return [...refs].filter(ref => inKnowledge(data, ref));
}

export function sharedNotes(a: StudioBook, b: StudioBook, data: StudioData): string[] {
  const other = new Set(knowledgeRefs(b, data));
  return knowledgeRefs(a, data).filter(ref => other.has(ref));
}

export type NoteUse = { ref: string; books: StudioBook[] };

/** Notes ranked by how many book ideas lean on them. */
export function cornerstones(data: StudioData): NoteUse[] {
  const uses = new Map<string, StudioBook[]>();
  for (const book of data.books) {
    for (const ref of knowledgeRefs(book, data)) uses.set(ref, [...(uses.get(ref) ?? []), book]);
  }
  return [...uses.entries()]
    .map(([ref, books]) => ({ ref, books }))
    .sort((a, b) => b.books.length - a.books.length || data.notes[b.ref].words - data.notes[a.ref].words);
}

export type NextMove = {
  part: number;
  partName: string;
  researched: number;
  total: number;
  chapter: FlatChapter;
  chapterWords: number;
};

/** The part with the most research behind it, and its best-covered chapter. */
export function nextMove(book: StudioBook, data: StudioData): NextMove | null {
  if (!book.parts?.length) return null;
  const chapters = flatChapters(book);
  let best: { part: number; score: number; researched: number } | null = null;
  book.parts.forEach((part, p) => {
    const researched = part.chapters.filter(ch => ch.notes.some(ref => inKnowledge(data, ref))).length;
    const score = researched / part.chapters.length + researched * 0.01;
    if (!best || score > best.score) best = { part: p, score, researched };
  });
  const pick = best as { part: number; score: number; researched: number } | null;
  if (!pick || pick.researched === 0) return null;
  const inPart = chapters.filter(ch => ch.part === pick.part);
  const chapter = inPart.reduce((top, ch) => (chapterWords(ch, data) > chapterWords(top, data) ? ch : top), inPart[0]);
  return {
    part: pick.part,
    partName: book.parts[pick.part].name,
    researched: pick.researched,
    total: inPart.length,
    chapter,
    chapterWords: chapterWords(chapter, data),
  };
}

export type SingleSource = { ref: string; leaning: number; researched: number };

/** One note carrying most researched chapters (60%+ of at least six). */
export function singleSourceRisk(book: StudioBook, data: StudioData): SingleSource | null {
  const researched = researchedChapters(book, data);
  if (researched.length < 6) return null;
  const counts = new Map<string, number>();
  for (const ch of researched) for (const ref of new Set(ch.notes)) if (inKnowledge(data, ref)) counts.set(ref, (counts.get(ref) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] / researched.length < 0.6) return null;
  return { ref: top[0], leaning: top[1], researched: researched.length };
}

export type Insight = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  why?: string;
  open?: string;
  action?: { label: string; confirm: string; choice: string };
};

const listNames = (books: StudioBook[], max = 3) => {
  const names = books.map(b => b.short);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
};

/** Everything Clementine notices, worked out from the data. Decided insights drop out. */
export function insights(data: StudioData): Insight[] {
  const out: Insight[] = [];
  const books = data.books;
  const byId = new Map(books.map(b => [b.id, b]));

  // Blank idea that lives inside a planned one: same area, same subject, audience covered.
  for (const blank of books.filter(b => b.kind === "blank" && b.audience?.length)) {
    const host = books.find(
      b =>
        b !== blank &&
        b.kind !== "blank" &&
        b.area === blank.area &&
        (b.subjects ?? []).some(s => blank.subjects?.includes(s)) &&
        blank.audience!.every(a => b.audience?.includes(a)),
    );
    if (!host) continue;
    const stolen = host.interview?.questions.find(([q]) => /stolen|borrow/i.test(q));
    out.push({
      id: `merge:${blank.id}:${host.id}`,
      eyebrow: "Possible merge",
      title: stolen
        ? `${blank.short} is “${stolen[0]}” from ${host.short}, grown into a series.`
        : `${blank.short} looks like part of ${host.short}.`,
      body: `${blank.short} has no plan yet. ${host.short} already has ${chapterCount(host)} planned ${host.interview ? "interviews" : "chapters"} for the same readers.`,
      why: `Same area, same subject (${(host.subjects ?? []).join(", ")}), same audience.`,
      open: host.id,
      action: { label: `Fold into ${host.short}`, confirm: `Fold ${blank.short} into ${host.short} as a recurring strand?`, choice: "fold" },
    });
  }

  // A book whose research mostly sits inside a series volume.
  for (const a of books) {
    const mine = knowledgeRefs(a, data);
    if (mine.length < 3 || a.series) continue;
    let best: { b: StudioBook; n: number } | null = null;
    for (const b of books) {
      if (b === a || !b.series) continue;
      const n = sharedNotes(a, b, data).length;
      if (!best || n > best.n) best = { b, n };
    }
    if (best && best.n / mine.length >= 0.8) {
      out.push({
        id: `series:${a.id}:${best.b.series}`,
        eyebrow: "Series fit",
        title: `${a.short} shares ${best.n} of its ${mine.length} notes with ${best.b.short}.`,
        body: `Its research already sits inside ${best.b.series}. It could open the series rather than stand beside it.`,
        open: a.id,
        action: { label: `Add to ${best.b.series}`, confirm: `Add ${a.short} to ${best.b.series}?`, choice: "series" },
      });
    }
  }

  const top = cornerstones(data)[0];
  if (top && top.books.length >= 4) {
    out.push({
      id: `cornerstone:${top.ref}`,
      eyebrow: "Cornerstone",
      title: `One note holds up ${top.books.length} of your ${books.length} ideas.`,
      body: `“${data.notes[top.ref].title}” is cited by ${listNames(top.books)}.`,
      why: "If it's thin or out of date, a lot of your shelf is too.",
    });
  }

  for (const book of books) {
    const risk = singleSourceRisk(book, data);
    if (!risk) continue;
    out.push({
      id: `thin:${book.id}:${risk.ref}`,
      eyebrow: "Thin floor",
      title: `${book.short} rests on one source.`,
      body: `${risk.leaning} of its ${risk.researched} researched chapters cite “${data.notes[risk.ref].title}”.`,
      why: "Add more sources before you outline.",
      open: book.id,
    });
  }

  const citing = books.flatMap(b => (b.cites_books ?? []).filter(id => byId.has(id)).map(id => [b, byId.get(id)!] as const));
  if (citing.length) {
    out.push({
      id: `cites:${citing.map(([a, b]) => `${a.id}>${b.id}`).join(",")}`,
      eyebrow: "Ideas citing ideas",
      title: "Your ideas already cite each other.",
      body: citing.map(([a, b]) => `${a.short} cites ${b.short}.`).join(" "),
      why: "One could start as a chapter of the other.",
      open: citing[0][0].id,
    });
  }

  const missing = Object.values(data.notes).filter(n => !n.in_knowledge);
  if (missing.length) {
    out.push({
      id: `missing:${missing.length}`,
      eyebrow: "Lost in the move",
      title: `${missing.length} notes your book pages cite never reached Knowledge.`,
      body: `They're still in Notion: ${missing.slice(0, 3).map(n => `“${n.title}”`).join(", ")}${missing.length > 3 ? " and more" : ""}.`,
      why: "Until they're imported they add nothing to Already Written.",
    });
  }

  for (const book of books.filter(b => b.history?.web_sources)) {
    out.push({
      id: `web:${book.id}`,
      eyebrow: "Capture",
      title: `${book.history!.web_sources} web sources behind ${book.short} aren't in Knowledge.`,
      body: `Each case study needs a research floor. ${book.history!.schools.filter(([, n]) => n === 0).length} of ${book.history!.schools.length} schools have no source at all.`,
      open: book.id,
    });
  }

  return out.filter(item => !data.decisions[item.id]);
}

/** Knowledge notes that look relevant to a chapter but aren't linked yet. */
export function suggestNotes(
  book: StudioBook,
  chapter: StudioChapter,
  docs: LexicalDoc[],
  k = 4,
): Array<LexicalDoc & { score: number }> {
  const linked = new Set(chapter.notes);
  const query = `${chapter.title} ${chapter.title} ${book.short}`;
  const need = Math.max(2, Math.ceil(tokenize(chapter.title).length * 0.6));
  return lexicalRetrieve(docs, query, k * 4)
    .filter(hit => !linked.has(hit.id))
    .filter(hit => {
      const words = new Set(tokenize(`${hit.title} ${hit.excerpt} ${(hit.tags ?? []).join(" ")}`));
      return tokenize(chapter.title).filter(t => words.has(t)).length >= Math.min(need, tokenize(chapter.title).length);
    })
    .slice(0, k);
}

export type DraftSource = { id: string; title: string; body: string };
export type DraftParagraph = { text: string; source: { id: string; title: string }; score: number };

function paragraphsOf(body: string): string[] {
  return body
    .replace(/<[^>]+>/g, " ")
    .split(/\n\s*\n/)
    // Prose only: a block that is mostly bullet or numbered lines is an outline, not a paragraph.
    .filter(block => {
      const lines = block.split("\n").filter(line => line.trim());
      const listy = lines.filter(line => /^\s*(?:[-*+]|\d+\.)\s+/.test(line)).length;
      return lines.length > 0 && listy / lines.length < 0.5;
    })
    .map(p => p.replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim())
    .filter(p => !p.startsWith("#") && !p.startsWith(">") && !p.startsWith("|") && !/^!\[/.test(p))
    .filter(p => p.split(" ").length >= 20);
}

/**
 * First-draft scaffold for a chapter, assembled only from your own notes.
 * Paragraphs are quoted, never rewritten, and each keeps its source.
 */
export function assembleDraft(book: StudioBook, chapter: StudioChapter, sources: DraftSource[], max = 8): DraftParagraph[] {
  const focus = new Set([...tokenize(chapter.title), ...tokenize(book.short)]);
  const titleTokens = new Set(tokenize(chapter.title));
  const scored = sources.flatMap(src =>
    paragraphsOf(src.body).map((text, i) => {
      const tokens = tokenize(text);
      const hits = tokens.filter(t => focus.has(t)).length;
      const titleHits = new Set(tokens.filter(t => titleTokens.has(t))).size;
      return { text, source: { id: src.id, title: src.title }, score: titleHits * 3 + hits / Math.sqrt(tokens.length) - i * 0.05 };
    }),
  );
  const perSource = new Map<string, number>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter(p => {
      const n = perSource.get(p.source.id) ?? 0;
      if (n >= 3) return false;
      perSource.set(p.source.id, n + 1);
      return true;
    })
    .slice(0, max);
}

export function draftMarkdown(book: StudioBook, chapter: FlatChapter, paragraphs: DraftParagraph[], date: string): string {
  const lines = [
    `_Working draft for ${book.title}, chapter ${chapter.index + 1}. Assembled on ${date} from your own notes; every paragraph is quoted from the note named under it._`,
    "",
  ];
  for (const p of paragraphs) lines.push(p.text, "", `— from “${p.source.title}”`, "");
  return lines.join("\n").trim() + "\n";
}

export function formatWords(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
