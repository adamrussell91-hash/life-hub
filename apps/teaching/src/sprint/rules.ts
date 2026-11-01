import { SPRINT_PHASES, type SprintPhaseKey } from './schema';

/**
 * The rules both the browser and the server use, so a phase opens, locks and
 * is late the same way on each side. Generated to
 * netlify/functions/_shared/sprint-rules.mjs. Pure: pass `now` in.
 */

const SYDNEY = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
});

/** Sydney wall time minus UTC at this instant, in ms. */
function sydneyOffset(epoch: number): number {
  const parts = SYDNEY.formatToParts(new Date(epoch));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - Math.floor(epoch / 60000) * 60000;
}

/** "2026-10-24" + "09:00" in Sydney → epoch ms, or null when the date is empty. */
export function sydneyEpoch(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const t = /^(\d{2}):(\d{2})$/.exec(time) ?? ['', '23', '59'];
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let epoch = wall - sydneyOffset(wall);
  epoch = wall - sydneyOffset(epoch);
  return epoch;
}

/** A phase's deadline; no time means the end of that day. */
export function phaseDue(phase: { due_date: string; due_time: string }): number | null {
  return sydneyEpoch(phase.due_date, phase.due_time || '23:59');
}

/** "2026-10-28T15:00" → epoch, or null. */
export function endsAtEpoch(endsAt: string): number | null {
  const [date, time] = endsAt.split('T');
  return date && time ? sydneyEpoch(date, time) : null;
}

export type LockRecord = { phase: SprintPhaseKey; until: string; unlocked: string[] };
export type EndedRecord = Partial<Record<SprintPhaseKey, { at: string; present: string[] }>>;

/** What a group has done that opens phases: how many submitted each phase, which class parts ended, the lock. */
export type GroupFacts = {
  size: number;
  submitted: Partial<Record<SprintPhaseKey, number>>;
  ended: EndedRecord;
  lock: LockRecord | null;
};

/**
 * The phases open for a group at `now`, in order. Understand is always open.
 * Each next phase opens when the one before it is due, or everyone in the
 * group has submitted it, or its class part has ended. While the class lock
 * that followed the previous phase runs, the next phase stays shut.
 */
export function openPhases(
  phases: ReadonlyArray<{ key: string; due_date: string; due_time: string }>,
  facts: GroupFacts,
  now: number
): SprintPhaseKey[] {
  const open: SprintPhaseKey[] = ['understand'];
  for (let i = 1; i < SPRINT_PHASES.length; i += 1) {
    const prev = SPRINT_PHASES[i - 1]!;
    const due = phaseDue(phases[i - 1]!);
    const allIn = facts.size > 0 && (facts.submitted[prev] ?? 0) >= facts.size;
    const triggered = (due !== null && due <= now) || allIn || !!facts.ended[prev];
    const held = facts.lock?.phase === prev && Date.parse(facts.lock.until) > now;
    if (!triggered || held) break;
    open.push(SPRINT_PHASES[i]!);
  }
  return open;
}

/** Whether this student is held by the class lock right now. */
export function lockState(lock: LockRecord | null, studentId: string, now: number): { locked: boolean; until: string | null } {
  if (!lock || lock.unlocked.includes(studentId) || Date.parse(lock.until) <= now) return { locked: false, until: null };
  return { locked: true, until: lock.until };
}

/** Class work is frozen for a student who was there when the class part ended. */
export function isFrozen(ended: EndedRecord, phase: SprintPhaseKey, studentId: string): boolean {
  return !!ended[phase]?.present.includes(studentId);
}

export function isLate(phase: { due_date: string; due_time: string }, submittedAt: string): boolean {
  const due = phaseDue(phase);
  return due !== null && Date.parse(submittedAt) > due;
}

export type Tally = {
  counts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  /** The idea with the most votes, or null when nobody voted or two ideas tie. */
  top: string | null;
  tie: boolean;
};

/** Each ballot gives one vote per criterion: { criterionId: ideaId }. Votes for unknown ideas are ignored. */
export function tally(ballots: ReadonlyArray<Record<string, string>>, criteria: readonly string[], ideas: readonly string[]): Tally {
  const counts: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  for (const idea of ideas) {
    counts[idea] = Object.fromEntries(criteria.map((c) => [c, 0]));
    totals[idea] = 0;
  }
  for (const ballot of ballots) {
    for (const c of criteria) {
      const idea = ballot[c];
      if (idea && counts[idea]) {
        counts[idea]![c]! += 1;
        totals[idea]! += 1;
      }
    }
  }
  const best = Math.max(0, ...Object.values(totals));
  const leaders = Object.keys(totals).filter((idea) => totals[idea] === best);
  const tie = best > 0 && leaders.length > 1;
  return { counts, totals, top: best > 0 && !tie ? leaders[0]! : null, tie };
}

/** Every pair of ideas once, as [a, b] in the order given. */
export function pairsOf(ideas: readonly string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  ideas.forEach((a, i) => ideas.slice(i + 1).forEach((b) => out.push([a, b])));
  return out;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** True once every pair of ideas has a winner. */
export function duelsDone(duels: ReadonlyArray<{ a: string; b: string; winner: string }>, ideas: readonly string[]): boolean {
  const done = new Set(duels.filter((d) => d.winner === d.a || d.winner === d.b).map((d) => pairKey(d.a, d.b)));
  return pairsOf(ideas).every(([a, b]) => done.has(pairKey(a, b)));
}

/**
 * Head-to-heads as a tally: a win is one point to the winner, and each
 * criterion it was "stronger in" counts toward that criterion.
 */
export function duelTally(ballots: ReadonlyArray<ReadonlyArray<{ a: string; b: string; winner: string; stronger: readonly string[] }>>, criteria: readonly string[], ideas: readonly string[]): Tally {
  const counts: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  for (const idea of ideas) {
    counts[idea] = Object.fromEntries(criteria.map((c) => [c, 0]));
    totals[idea] = 0;
  }
  for (const duels of ballots) {
    for (const d of duels) {
      if (!counts[d.a] || !counts[d.b] || (d.winner !== d.a && d.winner !== d.b)) continue;
      totals[d.winner]! += 1;
      for (const c of d.stronger) if (c in counts[d.winner]!) counts[d.winner]![c]! += 1;
    }
  }
  const best = Math.max(0, ...Object.values(totals));
  const leaders = Object.keys(totals).filter((idea) => totals[idea] === best);
  const tie = best > 0 && leaders.length > 1;
  return { counts, totals, top: best > 0 && !tie ? leaders[0]! : null, tie };
}

/** One student's order from their head-to-heads: most wins first; level ideas go by who won between them. */
export function rankIdeas(duels: ReadonlyArray<{ a: string; b: string; winner: string }>, ideas: readonly string[]): string[] {
  const wins = new Map(ideas.map((i) => [i, 0]));
  const beat = new Set<string>();
  for (const d of duels) {
    if (!wins.has(d.a) || !wins.has(d.b) || (d.winner !== d.a && d.winner !== d.b)) continue;
    wins.set(d.winner, wins.get(d.winner)! + 1);
    beat.add(`${d.winner}>${d.winner === d.a ? d.b : d.a}`);
  }
  return [...ideas].sort((x, y) => wins.get(y)! - wins.get(x)! || (beat.has(`${x}>${y}`) ? -1 : beat.has(`${y}>${x}`) ? 1 : 0));
}

/** 0 for no votes; otherwise 1–3 against the most any idea got on that criterion. */
export function heatLevels(counts: Tally['counts'], criteria: readonly string[]): Record<string, Record<string, 0 | 1 | 2 | 3>> {
  const out: Record<string, Record<string, 0 | 1 | 2 | 3>> = {};
  for (const c of criteria) {
    const max = Math.max(0, ...Object.values(counts).map((row) => row[c] ?? 0));
    for (const [idea, row] of Object.entries(counts)) {
      const n = row[c] ?? 0;
      (out[idea] ??= {})[c] = n === 0 || max === 0 ? 0 : (Math.max(1, Math.ceil((3 * n) / max)) as 1 | 2 | 3);
    }
  }
  return out;
}

const LABEL: Record<SprintPhaseKey, string> = { understand: 'Understand', sketch: 'Sketch', decide: 'Decide', prototype: 'Prototype', test: 'Test' };
const SHORT_WHEN = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit' });
const shortWhen = (epoch: number) => SHORT_WHEN.format(new Date(epoch)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`);

/**
 * The next moment the sprint changes on its own after `now`: a phase
 * closing, a class part's lesson ending, or the lock lifting. A practice run
 * skips to it. Null once nothing is left.
 */
export function nextChange(
  phases: ReadonlyArray<{ key: SprintPhaseKey; where: 'class' | 'home'; due_date: string; due_time: string; ends_at?: string }>,
  lockRec: { ended?: Partial<Record<SprintPhaseKey, unknown>>; lock?: { until: string } | null },
  now: number
): { at: number; label: string } | null {
  const events: Array<{ at: number; label: string }> = [];
  for (const p of phases) {
    const due = phaseDue(p);
    if (due !== null && due > now) events.push({ at: due, label: `${LABEL[p.key]} closing (${shortWhen(due)})` });
    const end = p.where === 'class' && !lockRec.ended?.[p.key] ? endsAtEpoch(p.ends_at ?? '') : null;
    if (end !== null && end > now) events.push({ at: end, label: `${LABEL[p.key]} lesson ending (${shortWhen(end)})` });
  }
  const until = lockRec.lock ? Date.parse(lockRec.lock.until) : NaN;
  if (until > now) events.push({ at: until, label: `Lock lifting (${shortWhen(until)})` });
  events.sort((a, b) => a.at - b.at);
  return events[0] ?? null;
}
