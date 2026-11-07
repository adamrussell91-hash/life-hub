import { piecesFor, TIERS, type DeepUnderstanding, type Tier } from '@/deep/schema';
import { formatDay } from '@/markbook/calc';
import { OVER_TIME } from './constants';
import type { Source } from './markbook-evidence';
import type { Evidence } from './types';

/**
 * One student's tagged evidence over time, for the teacher-only Over time tab:
 * school weeks, the student's and the class's weekly means, the events behind
 * them, a row per tag, and what is rising, slipping or stuck. Pure: no DOM.
 * Every score is a whole percent. Each item counts once, at its latest attempt.
 */

export type OverTimeRange = 'unit' | 'term' | 'year';
/** A school term as dates, YYYY-MM-DD. */
export type TermSpan = { number: number; start: string; end: string };

/** The filter chips: `kp` and `du` tags both sit under Deep understandings. */
export type ChipKind = 'dp' | 'out' | 'skill' | 'fam' | 'tech' | 'du' | 'vocab';
export const CHIP_KINDS: ChipKind[] = ['dp', 'out', 'skill', 'fam', 'tech', 'du', 'vocab'];
export const CHIP_LABEL: Record<ChipKind, string> = {
  dp: 'Syllabus',
  out: 'Outcomes',
  skill: 'Thinking skills',
  fam: 'Families',
  tech: 'Techniques',
  du: 'Deep understandings',
  vocab: 'Vocabulary'
};
/** The kind as one row's subtitle reads it. */
export const KIND_NAME: Record<ChipKind, string> = {
  dp: 'Syllabus dot point',
  out: 'Outcome',
  skill: 'Thinking skill',
  fam: 'Technique family',
  tech: 'Technique',
  du: 'Deep understanding',
  vocab: 'Knowledge organiser'
};
export const VOCAB_TAG = 'vocab:organiser';

export function chipKindOf(tag: string): ChipKind | null {
  const prefix = tag.slice(0, Math.max(0, tag.indexOf(':')));
  if (prefix === 'kp') return 'du';
  return (CHIP_KINDS as string[]).includes(prefix) ? (prefix as ChipKind) : null;
}

export type OtWeek = { start: string; label: string; /** School holidays (or a skipped week) sit just before this week. */ gapBefore: boolean };
export type OtEventKind = 'quiz' | 'writing' | 'viva' | 'sprint';
export type OtEvent = { week: number; kind: OtEventKind; title: string; source: string; date: string };
export type OtEvidence = { date: string; source: string; title: string; part: string; mark: string };
export type OtBand = 'secure' | 'growing' | 'gap' | 'new';
export const BAND_LABEL: Record<OtBand, string> = { secure: 'Secure', growing: 'Growing', gap: 'Needs work', new: 'New' };

export type OtTag = {
  tag: string;
  kind: ChipKind;
  /** Separate pieces of work (quizzes, tasks, pieces, organiser weeks) behind the row. */
  pieces: number;
  history: (number | null)[];
  clsHistory: (number | null)[];
  first: number | null;
  now: number | null;
  /** Latest minus first, with two or more weeks of evidence. */
  change: number | null;
  /** The class's latest on this tag: each student's latest week, averaged. */
  cls: number | null;
  band: OtBand;
  /** The newest evidence's day. */
  last: string;
  /** Newest first. */
  evidence: OtEvidence[];
};

export type OtMove = { tag: string; from: number | null; to: number | null; lo?: number; hi?: number; reason: string };
export type OtMoves = { rising?: OtMove; slipping?: OtMove; stuck?: OtMove };

export type OverTime = {
  start: string;
  weeks: OtWeek[];
  me: (number | null)[];
  cls: (number | null)[];
  events: OtEvent[];
  tags: OtTag[];
  moves: OtMoves;
};

export type VocabWeek = { week_start: string; right: number; seen: number };

export type OverTimeOptions = {
  range: OverTimeRange;
  /** YYYY-MM-DD. */
  today: string;
  terms: readonly TermSpan[];
  /** The first lesson of the unit the class is on today. */
  unitStart?: string | null;
  sources?: readonly Source[];
  /** Students still in the class. Without it, everyone counts towards the class line. */
  active?: ReadonlySet<string> | null;
  label?: (tag: string) => string;
  /** Names the part of a source an item is (e.g. "Q4"). */
  partOf?: (source: string, item: string) => string | null;
  /** The organiser's weekly reviews, for the Vocabulary row. */
  vocab?: readonly VocabWeek[] | null;
};

// ── Dates ────────────────────────────────────────────────────────────

const ms = (ymd: string): number => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
const ymdOf = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const addDays = (ymd: string, days: number): string => ymdOf(ms(ymd) + days * 86_400_000);
const daysBetween = (from: string, to: string): number => Math.round((ms(to) - ms(from)) / 86_400_000);
/** The Monday of the week a day falls in. */
export function mondayOf(ymd: string): string {
  const dow = new Date(ms(ymd)).getUTCDay();
  return addDays(ymd, -((dow + 6) % 7));
}

/** Where a range starts. Year is the first term of today's year; Term is the term today is in (or the last one before it); Unit falls back to Term. */
export function rangeStart(range: OverTimeRange, today: string, terms: readonly TermSpan[], unitStart?: string | null): string {
  const year = today.slice(0, 4);
  const mine = [...terms].filter((t) => t.start.slice(0, 4) === year).sort((a, b) => a.start.localeCompare(b.start));
  const yearStart = mine[0] && mine[0].start <= today ? mine[0].start : `${year}-01-01`;
  const termStart = [...mine].reverse().find((t) => t.start <= today)?.start ?? yearStart;
  if (range === 'year') return yearStart;
  if (range === 'term') return termStart;
  return unitStart && unitStart <= today ? unitStart : termStart;
}

function buildWeeks(from: string, today: string, terms: readonly TermSpan[]): OtWeek[] {
  const end = mondayOf(today);
  const termOf = (mon: string): TermSpan | undefined => terms.find((t) => mon <= t.end && addDays(mon, 6) >= t.start);
  const make = (useTerms: boolean): OtWeek[] => {
    const out: OtWeek[] = [];
    let prev: string | null = null;
    for (let w = mondayOf(from); w <= end; w = addDays(w, 7)) {
      const term = useTerms ? termOf(w) : undefined;
      if (useTerms && !term) continue;
      const label = term ? `T${term.number} W${Math.floor(daysBetween(mondayOf(term.start), w) / 7) + 1}` : formatDay(w);
      out.push({ start: w, label, gapBefore: prev !== null && daysBetween(prev, w) > 7 });
      prev = w;
    }
    return out;
  };
  // Terms that miss the range entirely (an old scope) fall back to plain weeks.
  const termed = terms.length ? make(true) : [];
  return termed.length ? termed : make(false);
}

// ── Helpers ──────────────────────────────────────────────────────────

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const pct = (share: number): number => Math.round(share * 100);
const firstOf = (xs: (number | null)[]): number | null => xs.find((x): x is number => x !== null) ?? null;
const lastOf = (xs: (number | null)[]): number | null => [...xs].reverse().find((x): x is number => x !== null) ?? null;

/** Each item once per student, at its latest attempt. Unmarked items drop out. */
export function latestOnly(evidence: readonly Evidence[]): Evidence[] {
  const latest = new Map<string, Evidence>();
  for (const e of evidence) {
    if (e.share === null) continue;
    const key = `${e.student}|${e.source}|${e.item}`;
    const prev = latest.get(key);
    if (!prev || e.date >= prev.date) latest.set(key, e);
  }
  return [...latest.values()];
}

export function eventKind(source: string, title: string, items: readonly string[]): OtEventKind {
  if (source.startsWith('quiz:')) return 'quiz';
  if (/sprint/i.test(title)) return 'sprint';
  if (items.some((i) => i.startsWith('v:')) || /viva/i.test(title)) return 'viva';
  return 'writing';
}

/** Students' means per week, averaged: a student with many items counts once. */
function weeklyClass(list: readonly Evidence[], weekOf: (date: string) => number, n: number): (number | null)[] {
  const by: Array<Map<string, number[]>> = Array.from({ length: n }, () => new Map());
  for (const e of list) {
    const w = weekOf(e.date);
    if (w < 0) continue;
    const m = by[w]!;
    m.set(e.student, [...(m.get(e.student) ?? []), e.share as number]);
  }
  return by.map((m) => (m.size ? Math.round(mean([...m.values()].map((xs) => mean(xs) * 100))) : null));
}

function bandOf(pieces: number, now: number | null, change: number | null): OtBand {
  if (pieces < 2 || now === null) return 'new';
  if (now >= OVER_TIME.secure) return 'secure';
  if ((change !== null && change <= -OVER_TIME.down) || now < OVER_TIME.needsWork) return 'gap';
  return 'growing';
}

// ── The whole picture ────────────────────────────────────────────────

export function overTime(evidence: readonly Evidence[], studentId: string, opts: OverTimeOptions): OverTime {
  const label = opts.label ?? ((t: string) => t);
  const titleOf = new Map((opts.sources ?? []).map((s) => [s.source, s.title]));
  const title = (source: string): string => titleOf.get(source) ?? (source.startsWith('quiz:') ? 'Quiz' : 'Marked work');
  const start = rangeStart(opts.range, opts.today, opts.terms, opts.unitStart);
  const inRange = (d: string): boolean => d >= start && d <= opts.today;

  const all = latestOnly(evidence).filter((e) => inRange(e.date));
  const active = opts.active ?? null;
  const classList = all.filter((e) => e.student === studentId || !active || active.has(e.student));
  const mine = all.filter((e) => e.student === studentId);
  const vocab = (opts.vocab ?? []).filter((v) => v.seen > 0 && inRange(v.week_start));

  const dates = [...classList.map((e) => e.date), ...vocab.map((v) => v.week_start)];
  const empty: OverTime = { start, weeks: [], me: [], cls: [], events: [], tags: [], moves: {} };
  if (!mine.length && !vocab.length) return empty;
  const firstDate = dates.reduce((a, b) => (b < a ? b : a));
  // A year starts at the first evidence; a term or unit shows all its weeks.
  const weeks = buildWeeks(opts.range === 'year' && firstDate > start ? firstDate : start, opts.today, opts.terms);
  const n = weeks.length;
  const weekOf = (date: string): number => {
    const mon = mondayOf(date);
    let at = -1;
    for (let i = 0; i < n; i++) if (weeks[i]!.start <= mon) at = i;
    // Work dated in the holidays sits in the last school week before them; before the first week, in the first.
    return at < 0 && n ? 0 : at;
  };

  const me = weeklyClass(mine, weekOf, n);
  const cls = weeklyClass(classList, weekOf, n);

  // Events: each source the student has work in, at their latest day on it.
  const bySource = new Map<string, Evidence[]>();
  for (const e of mine) bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]);
  const events: OtEvent[] = [...bySource].map(([source, list]) => {
    const date = list.reduce((d, e) => (e.date > d ? e.date : d), list[0]!.date);
    return { week: weekOf(date), kind: eventKind(source, title(source), list.map((e) => e.item)), title: title(source), source, date };
  });
  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  // A row per tag.
  const byTag = new Map<string, Evidence[]>();
  for (const e of mine) for (const t of e.tags) if (chipKindOf(t)) byTag.set(t, [...(byTag.get(t) ?? []), e]);
  const tags: OtTag[] = [];
  for (const [tag, list] of byTag) {
    const history = weeklyClass(list, weekOf, n);
    const onTag = classList.filter((e) => e.tags.includes(tag));
    const clsHistory = weeklyClass(onTag, weekOf, n);
    const latestByStudent = new Map<string, { week: number; shares: number[] }>();
    for (const e of onTag) {
      const w = weekOf(e.date);
      const cur = latestByStudent.get(e.student);
      if (!cur || w > cur.week) latestByStudent.set(e.student, { week: w, shares: [e.share as number] });
      else if (w === cur.week) cur.shares.push(e.share as number);
    }
    const clsNow = latestByStudent.size ? Math.round(mean([...latestByStudent.values()].map((s) => mean(s.shares) * 100))) : null;
    const groups = new Map<string, Evidence[]>();
    for (const e of list) groups.set(e.source, [...(groups.get(e.source) ?? []), e]);
    const rows: OtEvidence[] = [...groups].map(([source, items]) => {
      const parts = [...new Set(items.map((e) => opts.partOf?.(source, e.item) ?? null).filter((p): p is string => !!p))];
      return {
        date: items.reduce((d, e) => (e.date > d ? e.date : d), items[0]!.date),
        source,
        title: title(source),
        part: parts.length ? parts.join(', ') : `${items.length} ${items.length === 1 ? 'item' : 'items'}`,
        mark: `${pct(mean(items.map((e) => e.share as number)))}%`
      };
    });
    rows.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
    const first = firstOf(history);
    const now = lastOf(history);
    const points = history.filter((x) => x !== null).length;
    const change = points >= 2 && first !== null && now !== null ? now - first : null;
    tags.push({ tag, kind: chipKindOf(tag)!, pieces: groups.size, history, clsHistory, first, now, change, cls: clsNow, band: bandOf(groups.size, now, change), last: rows[0]!.date, evidence: rows });
  }

  // Vocabulary from the organiser: the share right each week.
  if (vocab.length) {
    const right = new Array<number>(n).fill(0);
    const seen = new Array<number>(n).fill(0);
    for (const v of vocab) {
      const w = weekOf(v.week_start);
      if (w < 0) continue;
      right[w] += v.right;
      seen[w] += v.seen;
    }
    const history = seen.map((s, i) => (s > 0 ? Math.round((right[i]! / s) * 100) : null));
    const rows: OtEvidence[] = [...vocab]
      .sort((a, b) => b.week_start.localeCompare(a.week_start))
      .map((v) => ({ date: v.week_start, source: 'organiser', title: 'Organiser', part: `${v.seen} ${v.seen === 1 ? 'card' : 'cards'}, ${v.right} right`, mark: `${Math.round((v.right / v.seen) * 100)}%` }));
    const first = firstOf(history);
    const now = lastOf(history);
    const points = history.filter((x) => x !== null).length;
    const change = points >= 2 && first !== null && now !== null ? now - first : null;
    tags.push({ tag: VOCAB_TAG, kind: 'vocab', pieces: points, history, clsHistory: new Array(n).fill(null), first, now, change, cls: null, band: bandOf(points, now, change), last: rows[0]!.date, evidence: rows });
  }

  return { start, weeks, me, cls, events, tags, moves: movesFor(tags, mine, label, title) };
}

// ── Rising, slipping, stuck ──────────────────────────────────────────

const classLine = (cls: number | null): string => (cls === null ? '' : ` Class sits at ${cls}%.`);

/** What has moved most. A card is left out when nothing qualifies: never padded. */
export function movesFor(tags: readonly OtTag[], mine: readonly Evidence[], label: (tag: string) => string, title: (source: string) => string): OtMoves {
  const moves: OtMoves = {};
  const firstTitle = (row: OtTag): string => title(row.evidence[row.evidence.length - 1]!.source);
  const changed = tags.filter((t) => t.change !== null);

  const up = changed.filter((t) => t.change! >= OVER_TIME.move).sort((a, b) => b.change! - a.change! || a.tag.localeCompare(b.tag))[0];
  if (up) {
    const since = up.kind === 'vocab' ? 'Since the first organiser week' : `Since ${firstTitle(up)}`;
    moves.rising = { tag: up.tag, from: up.first, to: up.now, reason: `${since}, across ${up.pieces} pieces.${classLine(up.cls)}` };
  }

  const down = changed.filter((t) => t.change! <= -OVER_TIME.move).sort((a, b) => a.change! - b.change! || a.tag.localeCompare(b.tag))[0];
  if (down) {
    const pts = down.history.filter((x): x is number => x !== null);
    let falls = 0;
    for (let i = pts.length - 1; i > 0 && pts[i]! < pts[i - 1]!; i--) falls += 1;
    const lead = falls >= 2 ? `Fell each of the last ${falls + 1} weeks it came up.` : `Down from ${down.first}% to ${down.now}% since ${down.kind === 'vocab' ? 'the first organiser week' : firstTitle(down)}.`;
    moves.slipping = { tag: down.tag, from: down.first, to: down.now, reason: `${lead}${classLine(down.cls)}` };
  }

  // Stuck: the same named mix-up three times, else three pieces in a narrow band, all low.
  const mixes = new Map<string, { target: string; as: string; items: Set<string>; first: Evidence }>();
  for (const e of [...mine].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const w of e.why) {
      if (w.type !== 'named') continue;
      const key = `${w.target}|${w.as}`;
      const row = mixes.get(key) ?? { target: w.target, as: w.as, items: new Set<string>(), first: e };
      row.items.add(`${e.source}|${e.item}`);
      mixes.set(key, row);
    }
  }
  // A mix-up the student has since got past (Secure now) is history, not stuck.
  const pastIt = (target: string): boolean => (tags.find((t) => t.tag === target)?.now ?? 0) >= OVER_TIME.secure;
  const mix = [...mixes.values()].filter((m) => m.items.size >= OVER_TIME.stuckMixUps && m.target !== down?.tag && !pastIt(m.target)).sort((a, b) => b.items.size - a.items.size || a.target.localeCompare(b.target))[0];
  const range = (row: OtTag | undefined): { lo?: number; hi?: number } => {
    const marks = (row?.evidence ?? []).map((e) => Number.parseInt(e.mark, 10)).filter((x) => Number.isFinite(x));
    return marks.length ? { lo: Math.min(...marks), hi: Math.max(...marks) } : {};
  };
  if (mix) {
    const row = tags.find((t) => t.tag === mix.target);
    moves.stuck = {
      tag: mix.target,
      from: row?.first ?? null,
      to: row?.now ?? null,
      ...range(row),
      reason: `Named it “${label(mix.as)}” ${mix.items.size} times. Same mix-up since ${title(mix.first.source)}.`
    };
  } else {
    const flat = tags
      .filter((t) => t.kind !== 'vocab' && t.tag !== down?.tag && t.evidence.length >= OVER_TIME.stuckPieces)
      .map((t) => ({ t, ...range(t) }))
      .filter((x) => x.hi !== undefined && x.hi < OVER_TIME.needsWork && x.hi - x.lo! <= OVER_TIME.stuckBand)
      .sort((a, b) => a.hi! - b.hi! || a.t.tag.localeCompare(b.t.tag))[0];
    if (flat) {
      moves.stuck = { tag: flat.t.tag, from: flat.t.first, to: flat.t.now, lo: flat.lo, hi: flat.hi, reason: `${flat.t.evidence.length} pieces, all between ${flat.lo}% and ${flat.hi}%.${classLine(flat.t.cls)}` };
    }
  }
  return moves;
}

// ── Deep understandings ──────────────────────────────────────────────

export type DuRow = {
  id: string;
  claim: string;
  /** The best tier the student holds a piece at now, and where they started. Null for none. */
  now: Tier | null;
  was: Tier | null;
  /** Source titles, oldest first. Empty when nothing is tested yet. */
  sources: string[];
  /** The unit's pieces for this deep understanding. */
  pieces: string[];
};

const tierIndex = (t: Tier | null): number => (t === null ? -1 : TIERS.indexOf(t));
const best = (tiers: Tier[]): Tier | null => tiers.reduce<Tier | null>((b, t) => (tierIndex(t) > tierIndex(b) ? t : b), null);

/** For each deep understanding: the best piece held now, the best held on the first day it was tested, and the sources. */
export function duLadder(evidence: readonly Evidence[], studentId: string, deep: readonly DeepUnderstanding[], sources: readonly Source[] = []): DuRow[] {
  const titleOf = new Map(sources.map((s) => [s.source, s.title]));
  const mine = latestOnly(evidence).filter((e) => e.student === studentId).sort((a, b) => a.date.localeCompare(b.date));
  return deep.map((du) => {
    const pieces = piecesFor(du, deep);
    const tier = new Map(pieces.map((p) => [`kp:${p.id}`, p.tier]));
    const hits = mine.filter((e) => e.tags.some((t) => tier.has(t)));
    const held = (list: Evidence[]): Tier | null => {
      const latest = new Map<string, number>();
      for (const e of list) for (const t of e.tags) if (tier.has(t)) latest.set(t, e.share as number);
      return best([...latest].filter(([, s]) => s >= OVER_TIME.pieceHeld).map(([t]) => tier.get(t)!));
    };
    const now = held(hits);
    const firstDay = hits[0]?.date;
    const was = firstDay ? held(hits.filter((e) => e.date === firstDay)) : null;
    const names = [...new Set(hits.map((e) => titleOf.get(e.source) ?? (e.source.startsWith('quiz:') ? 'Quiz' : 'Marked work')))];
    return { id: du.id, claim: du.claim, now, was: was === now ? null : was, sources: names, pieces: pieces.map((p) => p.id) };
  });
}

// ── Marking codes ────────────────────────────────────────────────────

/**
 * Whether a marking code turns up more or less on later pieces than earlier
 * ones: hits in the newer half against the older half of the pieces it applies to.
 * Null with fewer than two such pieces.
 */
export function codeTrend(cells: readonly (number | null)[]): 'more' | 'fewer' | 'same' | null {
  const on = cells.filter((c): c is number => c !== null);
  if (on.length < 2) return null;
  const half = Math.floor(on.length / 2);
  const hit = (xs: number[]): number => xs.filter((c) => c > 0).length / xs.length;
  const older = hit(on.slice(0, half));
  const newer = hit(on.slice(on.length - half));
  return newer > older ? 'more' : newer < older ? 'fewer' : 'same';
}
