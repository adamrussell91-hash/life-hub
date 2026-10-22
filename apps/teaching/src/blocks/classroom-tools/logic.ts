/**
 * Classroom tools: the parts with no DOM. Timer stacks, name and number
 * draws, groups, the countdown and which class a lesson is most likely being
 * taught to. Kept pure so the tools stay honest under test.
 */
import type { ClassroomToolId, TimerSegment } from '@/schemas/block';
import type { ClassStudent } from '@/schemas/class';

export const TOOL_LABEL: Record<ClassroomToolId, string> = {
  timer: 'Timer',
  stopwatch: 'Stopwatch',
  names: 'Names',
  number: 'Number',
  groups: 'Groups',
  technique: 'Technique',
  scores: 'Scores',
  coin: 'Coin',
  dice: 'Dice'
};

/** Tray order. */
export const ALL_TOOLS: ClassroomToolId[] = ['timer', 'stopwatch', 'names', 'number', 'groups', 'technique', 'scores', 'coin', 'dice'];

/** Students get these and nothing that uses names. */
export const STUDENT_TOOLS: ClassroomToolId[] = ['timer', 'stopwatch', 'technique', 'coin', 'dice'];

export function toolsFor(viewer: 'teacher' | 'student'): ClassroomToolId[] {
  return viewer === 'teacher' ? ALL_TOOLS : ALL_TOOLS.filter((tool) => STUDENT_TOOLS.includes(tool));
}

export const DEFAULT_TIMER_STACK: TimerSegment[] = [{ label: 'Timer', minutes: 5 }];

export const TIMER_PRESETS: Array<{ label: string; stack: TimerSegment[] }> = [
  { label: 'Read, Write', stack: [{ label: 'Reading time', minutes: 5 }, { label: 'Writing time', minutes: 10 }] },
  { label: 'Think, Pair, Share', stack: [{ label: 'Think', minutes: 1 }, { label: 'Pair', minutes: 2 }, { label: 'Share', minutes: 3 }] },
  { label: 'Plan, Draft, Edit', stack: [{ label: 'Plan', minutes: 5 }, { label: 'Draft', minutes: 15 }, { label: 'Edit', minutes: 5 }] },
  { label: 'Silent reading 15', stack: [{ label: 'Silent reading', minutes: 15 }] }
];

/** A usable stack: at least one timer, sensible minutes, a label on each. */
export function cleanTimerStack(stack: readonly TimerSegment[] | undefined): TimerSegment[] {
  const out = (stack ?? [])
    .filter((seg) => Number.isFinite(seg.minutes) && seg.minutes > 0)
    .slice(0, 8)
    .map((seg) => ({ label: seg.label.trim() || 'Timer', minutes: Math.min(180, Math.max(0.25, seg.minutes)) }));
  return out.length ? out : DEFAULT_TIMER_STACK.map((seg) => ({ ...seg }));
}

// ---------------------------------------------------------------- timer stack

export type TimerRun = {
  stack: TimerSegment[];
  index: number;
  /** Milliseconds left in the current timer. */
  left: number;
  running: boolean;
  done: boolean;
};

export function startTimerRun(stack: readonly TimerSegment[]): TimerRun {
  const clean = cleanTimerStack(stack);
  return { stack: clean, index: 0, left: clean[0].minutes * 60_000, running: false, done: false };
}

/**
 * Move the clock on by `elapsed` ms. Rolls straight into the next timer,
 * carrying any overshoot. `changed` counts timers that ended on the way.
 */
export function tickTimerRun(run: TimerRun, elapsed: number): { run: TimerRun; changed: number; finished: boolean } {
  if (!run.running || run.done) return { run, changed: 0, finished: false };
  let { index, left } = run;
  left -= Math.max(0, elapsed);
  let changed = 0;
  while (left <= 0) {
    if (index >= run.stack.length - 1) {
      return { run: { ...run, index, left: 0, running: false, done: true }, changed, finished: true };
    }
    index += 1;
    changed += 1;
    left += run.stack[index].minutes * 60_000;
  }
  return { run: { ...run, index, left }, changed, finished: false };
}

export function skipTimer(run: TimerRun): TimerRun {
  if (run.done) return run;
  if (run.index >= run.stack.length - 1) return { ...run, left: 0, running: false, done: true };
  const index = run.index + 1;
  return { ...run, index, left: run.stack[index].minutes * 60_000 };
}

export function addMinute(run: TimerRun): TimerRun {
  return run.done ? run : { ...run, left: run.left + 60_000 };
}

/** How far through each timer is, 0 to 1, for the segmented bar. */
export function timerProgress(run: TimerRun): number[] {
  return run.stack.map((seg, i) => {
    if (run.done || i < run.index) return 1;
    if (i > run.index) return 0;
    return Math.min(1, Math.max(0, 1 - run.left / (seg.minutes * 60_000)));
  });
}

export function stackTotalMinutes(stack: readonly TimerSegment[]): number {
  return stack.reduce((sum, seg) => sum + seg.minutes, 0);
}

/** 4:05, or 1:02:03 past an hour. Rounds up so 0:00 means time is really up. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Stopwatch reading with hundredths: 1:04.27. */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const cs = String(Math.floor(total / 10) % 100).padStart(2, '0');
  const s = Math.floor(total / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}.${cs}` : `${m}:${ss}.${cs}`;
}

// ---------------------------------------------------------------- draws

export type Rng = () => number;

export function randomIndex(length: number, rng: Rng = Math.random): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1, rng);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Names the picker may land on. Skipped students are left out without a trace. */
export function pickableNames(students: readonly ClassStudent[] | undefined): string[] {
  return (students ?? []).filter((s) => !s.skip_picker).map((s) => s.name.trim()).filter(Boolean);
}

/** Everyone on the list, for groups. Skip in picker does not apply here. */
export function allNames(students: readonly ClassStudent[] | undefined): string[] {
  return (students ?? []).map((s) => s.name.trim()).filter(Boolean);
}

/**
 * Split names into groups of about `size`. Group count is the nearest whole
 * number, and sizes never differ by more than one.
 */
export function makeGroups(names: readonly string[], size: number, rng: Rng = Math.random): string[][] {
  if (!names.length) return [];
  const per = Math.min(names.length, Math.max(2, Math.round(size) || 2));
  const count = Math.max(1, Math.round(names.length / per));
  const groups: string[][] = Array.from({ length: count }, () => []);
  shuffle(names, rng).forEach((name, i) => groups[i % count].push(name));
  return groups;
}

/** Whole numbers from lo to hi (either order), minus `used` when no repeats is on. */
export function numberChoices(lo: number, hi: number, used: ReadonlySet<number> = new Set(), noRepeats = false): number[] {
  let a = Math.round(lo);
  let b = Math.round(hi);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  if (a > b) [a, b] = [b, a];
  if (b - a > 10_000) b = a + 10_000;
  const out: number[] = [];
  for (let n = a; n <= b; n += 1) if (!noRepeats || !used.has(n)) out.push(n);
  return out;
}

// ---------------------------------------------------------------- countdown

/** A local calendar day as YYYY-MM-DD. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayNumber(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const t = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null;
}

/** Calendar days from `today` to `due`. Weekends and holidays count: students can study then. */
export function daysBetween(today: string, due: string): number | null {
  const a = dayNumber(today);
  const b = dayNumber(due);
  return a === null || b === null ? null : b - a;
}

export type CountdownState =
  | { kind: 'unset' }
  | { kind: 'upcoming'; days: number; total: number | null; gone: number | null }
  | { kind: 'today' }
  | { kind: 'past'; days: number };

export function countdownState(content: { due_date: string; set_date?: string }, today: string): CountdownState {
  const days = content.due_date ? daysBetween(today, content.due_date) : null;
  if (days === null) return { kind: 'unset' };
  if (days === 0) return { kind: 'today' };
  if (days < 0) return { kind: 'past', days: -days };
  const total = content.set_date ? daysBetween(content.set_date, content.due_date) : null;
  const usable = total !== null && total >= days && total > 0 && total <= 366 ? total : null;
  return { kind: 'upcoming', days, total: usable, gone: usable === null ? null : usable - days };
}

/** "Friday 30 October", the way the hub writes a day in prose. */
export function formatDueDay(iso: string): string {
  const n = dayNumber(iso);
  if (n === null) return '';
  return new Date(n * 86_400_000).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** "3:00 pm" from "15:00". */
export function formatDueTime(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return '';
  const h = Number(match[1]);
  const m = match[2];
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

// ---------------------------------------------------------------- which class

/**
 * The class this lesson is most likely being taught to right now: the one
 * that has it today, else the one that had it most recently, else the next.
 * A class the teacher picked last time wins while it still has students.
 */
export function defaultClassId(
  classIds: readonly string[],
  scheduled: ReadonlyArray<{ class_id: string; date: string }>,
  today: string,
  remembered?: string | null
): string | null {
  if (!classIds.length) return null;
  if (remembered && classIds.includes(remembered)) return remembered;
  const mine = scheduled.filter((row) => classIds.includes(row.class_id));
  const todays = mine.find((row) => row.date === today);
  if (todays) return todays.class_id;
  let recent: { class_id: string; date: string } | null = null;
  let next: { class_id: string; date: string } | null = null;
  for (const row of mine) {
    if (row.date < today && (!recent || row.date > recent.date)) recent = row;
    if (row.date > today && (!next || row.date < next.date)) next = row;
  }
  return recent?.class_id ?? next?.class_id ?? classIds[0];
}

/** Turn pasted text into a class list: one per line, or a spreadsheet column. Keeps skips by name. */
export function parseStudentList(text: string, previous: readonly ClassStudent[] = [], max = 60): ClassStudent[] {
  // A student already on the list keeps their skip, id and initials when it is pasted again.
  const before = new Map(previous.map((s) => [s.name.trim().toLowerCase(), s]));
  const seen = new Set<string>();
  const out: ClassStudent[] = [];
  for (const raw of text.split(/[\n\r\t]+/)) {
    const name = raw.replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const old = before.get(key);
    out.push({
      name,
      skip_picker: old?.skip_picker ?? false,
      ...(old?.id ? { id: old.id } : {}),
      ...(old?.initials ? { initials: old.initials } : {})
    });
    if (out.length >= max) break;
  }
  return out;
}
