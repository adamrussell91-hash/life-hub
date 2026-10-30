import { z } from 'zod';

/**
 * How a written quiz answer was typed: paste attempts, typing time, chunks of
 * text that arrived at once, times the student left the page, and every change
 * so the teacher can replay it. Nothing here calls a model; the browser counts
 * and the server only cleans and sums.
 *
 * Shared by the student player, the server (bundled into quiz-core.mjs) and
 * the teacher's Results view.
 */

export const WRITING_CHECKS = ['off', 'flag', 'block'] as const;
export const WritingCheckSchema = z.enum(WRITING_CHECKS);
export type WritingCheck = z.infer<typeof WritingCheckSchema>;
export const DEFAULT_WRITING_CHECK: WritingCheck = 'flag';
/** The question kinds with a written answer box. */
export const WRITTEN_KINDS: readonly string[] = ['extended_response', 'explain_effect'];

/** One change: tenths of a second since the log began, where, how much was cut, what was put in. */
export type WritingStep = [t: number, at: number, cut: number, put: string];

export type WritingLog = {
  /** Epoch ms of the first change, so a reload carries on the same clock. */
  start: number;
  /** Text already there when recording began (an answer from before this feature). */
  base: string;
  /** Active typing time: gaps under a minute between changes. */
  ms: number;
  /** Paste or drop attempts, blocked or not. */
  pastes: number;
  /** Times the window lost focus while this box had it. */
  away: number;
  /** Single changes that put in a big chunk without a paste (another tool, voice typing). */
  jumps: number;
  steps: WritingStep[];
  /** The replay stopped recording at its size limit; the counts still run. */
  full?: boolean;
};

export const WRITING_LIMITS = { steps: 3000, chars: 20_000, base: 4000, jump: 40, idleMs: 60_000 } as const;

export function emptyWritingLog(base = '', now = Date.now()): WritingLog {
  return { start: now, base: base.slice(0, WRITING_LIMITS.base), ms: 0, pastes: 0, away: 0, jumps: 0, steps: [] };
}

/** The smallest single edit that turns `before` into `after`. */
export function diffText(before: string, after: string): { at: number; cut: number; put: string } {
  let head = 0;
  const max = Math.min(before.length, after.length);
  while (head < max && before[head] === after[head]) head += 1;
  let tail = 0;
  while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  return { at: head, cut: before.length - head - tail, put: after.slice(head, after.length - tail) };
}

const putChars = (steps: WritingStep[]): number => steps.reduce((n, s) => n + s[3].length, 0);

/**
 * Records one change into the log. Typing runs of under two seconds fold into
 * one step, which keeps a long answer to a few hundred steps.
 */
export function recordChange(log: WritingLog, before: string, after: string, now = Date.now(), pasted = false): WritingLog {
  if (before === after) return log;
  const { at, cut, put } = diffText(before, after);
  const t = Math.max(0, Math.round((now - log.start) / 100));
  const last = log.steps[log.steps.length - 1];
  const lastT = last ? last[0] : null;
  const gap = lastT === null ? null : (t - lastT) * 100;
  if (gap !== null && gap < WRITING_LIMITS.idleMs) log.ms += gap;
  if (!pasted && put.length >= WRITING_LIMITS.jump) log.jumps += 1;
  if (log.full) return log;
  const folds = last && !pasted && cut === 0 && last[2] === 0 && gap !== null && gap < 2000 && last[1] + last[3].length === at && put.length < WRITING_LIMITS.jump;
  if (folds) {
    last[0] = t;
    last[3] += put;
  } else if (log.steps.length >= WRITING_LIMITS.steps || putChars(log.steps) + put.length > WRITING_LIMITS.chars) {
    log.full = true;
  } else {
    log.steps.push([t, at, cut, put]);
  }
  return log;
}

/** Rebuilds the text step by step for the replay. `upTo` is a step count. */
export function replayText(log: Pick<WritingLog, 'base' | 'steps'>, upTo = log.steps.length): string {
  let text = log.base;
  for (const [, at, cut, put] of log.steps.slice(0, upTo)) text = text.slice(0, at) + put + text.slice(at + cut);
  return text;
}

const count = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);

/** A log sent by a browser, trimmed to the limits. Null when there's nothing usable. */
export function cleanWritingLog(raw: unknown): WritingLog | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const steps: WritingStep[] = [];
  let chars = 0;
  let full = r.full === true;
  for (const s of Array.isArray(r.steps) ? r.steps : []) {
    if (!Array.isArray(s) || s.length !== 4 || typeof s[3] !== 'string') continue;
    if (steps.length >= WRITING_LIMITS.steps || chars + s[3].length > WRITING_LIMITS.chars) {
      full = true;
      break;
    }
    chars += s[3].length;
    steps.push([count(s[0], 1e8), count(s[1], 1e5), count(s[2], 1e5), s[3]]);
  }
  return {
    start: count(r.start, 1e14),
    base: typeof r.base === 'string' ? r.base.slice(0, WRITING_LIMITS.base) : '',
    ms: count(r.ms, 1e9),
    pastes: count(r.pastes, 1e4),
    away: count(r.away, 1e4),
    jumps: count(r.jumps, 1e4),
    steps,
    ...(full ? { full: true } : {})
  };
}

export type WritingSummary = {
  /** Length of the answer handed in. */
  chars: number;
  /** Seconds of active typing. */
  typed_s: number;
  pastes: number;
  away: number;
  jumps: number;
  /** Characters deleted while writing. */
  cut: number;
  /** Plain reasons a teacher may want to look. Empty means nothing stood out. */
  flags: string[];
};

/**
 * Sums a log into what the teacher sees. Each flag says what happened; none
 * of them is a verdict, since voice typing and fast typists trip some of them.
 */
export function summariseWriting(log: WritingLog, text: string, check: WritingCheck = 'flag'): WritingSummary {
  const typed_s = Math.round(log.ms / 1000);
  const cut = log.steps.reduce((n, s) => n + s[2], 0);
  const chars = text.length;
  const flags: string[] = [];
  if (log.pastes) flags.push(check === 'block' ? `Tried to paste ${times(log.pastes)}` : `Pasted ${times(log.pastes)}`);
  if (log.jumps) flags.push(`${log.jumps === 1 ? 'A chunk' : `${log.jumps} chunks`} of text appeared at once`);
  if (log.away >= 3) flags.push(`Left the page ${times(log.away)}`);
  if (chars >= 300 && typed_s > 0 && (chars / typed_s) * 60 > 250) flags.push('Typed faster than most people write');
  if (chars >= 300 && !log.base && cut < chars * 0.01) flags.push('Almost no edits');
  return { chars, typed_s, pastes: log.pastes, away: log.away, jumps: log.jumps, cut, flags };
}

const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** "Typed 4 min · 2 paste attempts · left the page 6 times", for the attempt line. */
export function writingLine(s: WritingSummary): string {
  const mins = s.typed_s < 60 ? `${s.typed_s} s` : `${Math.round(s.typed_s / 60)} min`;
  return [`Typed ${mins}`, s.pastes ? `${s.pastes} paste ${s.pastes === 1 ? 'attempt' : 'attempts'}` : '', s.jumps ? `${s.jumps} big ${s.jumps === 1 ? 'jump' : 'jumps'}` : '', s.away ? `left the page ${times(s.away)}` : '']
    .filter(Boolean)
    .join(' · ');
}
