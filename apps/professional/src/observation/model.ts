/**
 * Classroom observation: pure logic over the Observation record. No DOM, no fetch. Every function
 * returns a new record and leaves its input alone.
 */
import { descriptorByCode } from './descriptors';
import type {
  Decision, LogEntry, LogKind, LookFor, Observation, ObservationPhase, ObservationSummary,
  PlannedDescriptor, ReflectionRow, WriteUpRow
} from './types';

export const MAX_DESCRIPTORS = 4;
/** Extra descriptors watched for future evidence sets, on top of the agreed ones. */
export const MAX_EXTRA = 2;
export const MIN_DESCRIPTORS = 2;
/** Quick-key rows: the first descriptor's look-fors use Q W E, the second A S D, and so on. */
export const LOOK_FOR_ROWS = ['QWE', 'ASD', 'ZXC', 'RTY', 'FGH', 'VBN'] as const;

type Instant = Date | number | string;
const ms = (t: Instant): number => (t instanceof Date ? t.getTime() : typeof t === 'number' ? t : Date.parse(t));
const iso = (t: Instant): string => new Date(ms(t)).toISOString();

export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${raw.toLowerCase()}`;
}

export function newObservation(input: {
  teacher: { person_ref: string; name: string; email?: string; school?: string; nesa_number?: string };
  supervisorName: string;
  plannedOn: string;
  meetingId: string;
  phase: ObservationPhase;
  now: Instant;
}): Observation {
  const stamp = iso(input.now);
  return {
    id: newId('obs'),
    kind: 'nesa_proficient',
    status: 'open',
    teacher: {
      person_ref: input.teacher.person_ref,
      name: input.teacher.name,
      nesa_number: input.teacher.nesa_number ?? '',
      email: input.teacher.email ?? '',
      school: input.teacher.school ?? ''
    },
    supervisor: { name: input.supervisorName, nesa_number: '' },
    planned_on: input.plannedOn,
    meetings: { [input.phase]: input.meetingId },
    lesson: { title: '', link: '', syllabus_link: '' },
    plan_all_students: '',
    plan_measure: '',
    descriptors: [],
    clock: { started_at: null, paused_ms: 0, paused_at: null, ended_at: null },
    log: [],
    write_up: {},
    reflection: {},
    signatures: { teacher: { name: '', date: '' }, supervisor: { name: '', date: '' } },
    created_at: stamp,
    updated_at: stamp
  };
}

// ---------------------------------------------------------------- descriptors and look-fors

/** Give each descriptor's first three look-fors the keys of its row; any more get ''. */
export function assignLookForKeys(descriptors: PlannedDescriptor[]): PlannedDescriptor[] {
  return descriptors.map((d, i) => {
    const row = LOOK_FOR_ROWS[i] ?? '';
    return { ...d, look_fors: d.look_fors.map((lf, j) => ({ ...lf, key: row[j] ?? '' })) };
  });
}

export type ChangeResult = { ok: true; observation: Observation } | { ok: false; reason: string };

/** The 2-4 descriptors agreed with the teacher: the ones on the NESA report. */
export const agreedDescriptors = (obs: Observation): PlannedDescriptor[] => obs.descriptors.filter((d) => !d.extra);
/** Extra descriptors watched quietly for future evidence sets. */
export const extraDescriptors = (obs: Observation): PlannedDescriptor[] => obs.descriptors.filter((d) => d.extra);

/** Agreed first, then extras, each keeping its order; look-for keys follow the order. */
const ordered = (ds: PlannedDescriptor[]): PlannedDescriptor[] => assignLookForKeys([...ds.filter((d) => !d.extra), ...ds.filter((d) => d.extra)]);

/** Adds as agreed while there's room (4), then as an extra (2 more). */
export function addDescriptor(obs: Observation, code: string, opts: { extra?: boolean } = {}): ChangeResult {
  if (obs.descriptors.some((d) => d.code === code)) return { ok: false, reason: 'That descriptor is already picked.' };
  if (!descriptorByCode(code)) return { ok: false, reason: 'That isn’t a Proficient descriptor.' };
  const agreed = agreedDescriptors(obs).length;
  const extras = extraDescriptors(obs).length;
  const extra = opts.extra ?? agreed >= MAX_DESCRIPTORS;
  if (!extra && agreed >= MAX_DESCRIPTORS) return { ok: false, reason: `The report takes at most ${MAX_DESCRIPTORS} agreed descriptors.` };
  if (extra && extras >= MAX_EXTRA) {
    return { ok: false, reason: `That’s ${MAX_DESCRIPTORS} agreed and ${MAX_EXTRA} extra already. Remove one first.` };
  }
  const added: PlannedDescriptor = { code, why: '', practice: '', demonstrate: '', planned_impact: '', how_know: '', look_fors: [], ...(extra ? { extra: true } : {}) };
  return { ok: true, observation: { ...obs, descriptors: ordered([...obs.descriptors, added]) } };
}

/** Move a descriptor between agreed (on the report) and extra (for future sets). */
export function setDescriptorExtra(obs: Observation, code: string, extra: boolean): ChangeResult {
  const d = obs.descriptors.find((x) => x.code === code);
  if (!d) return { ok: false, reason: 'That descriptor isn’t picked.' };
  if (!!d.extra === extra) return { ok: true, observation: obs };
  if (!extra && agreedDescriptors(obs).length >= MAX_DESCRIPTORS) return { ok: false, reason: `The report already has ${MAX_DESCRIPTORS} agreed descriptors.` };
  if (extra && extraDescriptors(obs).length >= MAX_EXTRA) return { ok: false, reason: `There are already ${MAX_EXTRA} extra descriptors.` };
  const descriptors = ordered(obs.descriptors.map((x) => {
    if (x.code !== code) return x;
    const { extra: _drop, ...rest } = x;
    return extra ? { ...rest, extra: true } : rest;
  }));
  return { ok: true, observation: { ...obs, descriptors } };
}

export function removeDescriptor(obs: Observation, code: string): Observation {
  const write_up = { ...obs.write_up };
  const reflection = { ...obs.reflection };
  delete write_up[code];
  delete reflection[code];
  return {
    ...obs,
    descriptors: assignLookForKeys(obs.descriptors.filter((d) => d.code !== code)),
    write_up,
    reflection,
    // Lines already logged stay in the log, as general lines.
    log: obs.log.map((l) => (l.descriptor === code ? { ...l, descriptor: null, look_for: null } : l))
  };
}

function mapDescriptor(obs: Observation, code: string, change: (d: PlannedDescriptor) => PlannedDescriptor): Observation {
  return { ...obs, descriptors: assignLookForKeys(obs.descriptors.map((d) => (d.code === code ? change(d) : d))) };
}

export function addLookFor(obs: Observation, code: string, label: string): Observation {
  const text = label.trim();
  if (!text) return obs;
  const lf: LookFor = { id: newId('lf'), label: text, key: '' };
  return mapDescriptor(obs, code, (d) => ({ ...d, look_fors: [...d.look_fors, lf] }));
}

export function renameLookFor(obs: Observation, code: string, lookForId: string, label: string): Observation {
  return mapDescriptor(obs, code, (d) => ({ ...d, look_fors: d.look_fors.map((l) => (l.id === lookForId ? { ...l, label } : l)) }));
}

export function removeLookFor(obs: Observation, code: string, lookForId: string): Observation {
  const next = mapDescriptor(obs, code, (d) => ({ ...d, look_fors: d.look_fors.filter((l) => l.id !== lookForId) }));
  return { ...next, log: next.log.map((l) => (l.look_for === lookForId ? { ...l, look_for: null } : l)) };
}

// ---------------------------------------------------------------- lesson clock

export function clockMs(obs: Observation, now: Instant): number {
  const { started_at, paused_ms, paused_at, ended_at } = obs.clock;
  if (!started_at) return 0;
  const end = ended_at ? ms(ended_at) : paused_at ? ms(paused_at) : ms(now);
  return Math.max(0, end - ms(started_at) - paused_ms);
}

/** 'mm:ss'. Hours roll into minutes, so 1h05m is '65:00'. */
export function clockLabel(totalMs: number): string {
  const total = Math.max(0, Math.floor(totalMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function startClock(obs: Observation, now: Instant): Observation {
  if (obs.clock.started_at) return obs;
  return { ...obs, clock: { started_at: iso(now), paused_ms: 0, paused_at: null, ended_at: null } };
}

export function pauseClock(obs: Observation, now: Instant): Observation {
  const c = obs.clock;
  if (!c.started_at || c.paused_at || c.ended_at) return obs;
  return { ...obs, clock: { ...c, paused_at: iso(now) } };
}

export function resumeClock(obs: Observation, now: Instant): Observation {
  const c = obs.clock;
  if (!c.paused_at || c.ended_at) return obs;
  return { ...obs, clock: { ...c, paused_ms: c.paused_ms + Math.max(0, ms(now) - ms(c.paused_at)), paused_at: null } };
}

/** Ending while paused ends the lesson at the moment of the pause. */
export function endClock(obs: Observation, now: Instant): Observation {
  const c = obs.clock;
  if (!c.started_at || c.ended_at) return obs;
  return { ...obs, clock: { ...c, ended_at: c.paused_at ?? iso(now), paused_at: null } };
}

/** 'mm:ss' (minutes may exceed 59) back to ms. */
function clockToMs(label: string): number {
  const m = /^(\d+):(\d{2})$/.exec(label);
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : 0;
}

/**
 * Set when the lesson started, after the fact (e.g. Start lesson was never pressed). A clock that hadn't
 * started starts running from `start`. Every log line's clock is redone: lines already timed shift by the
 * change (so earlier pauses still count); lines logged before the old start, or with no start, are timed
 * from `start`. Lines logged before `start` read 00:00. A start in the future is refused.
 */
export function setLessonStart(obs: Observation, start: Instant, now: Instant): Observation {
  const startMs = ms(start);
  if (!Number.isFinite(startMs) || startMs > ms(now)) return obs;
  const c = obs.clock;
  const oldStart = c.started_at ? ms(c.started_at) : null;
  const log = obs.log.map((l) => {
    const atMs = ms(l.at);
    const t = oldStart !== null && atMs >= oldStart ? clockToMs(l.clock) + (oldStart - startMs) : atMs - startMs;
    return { ...l, clock: clockLabel(t) };
  });
  const clock = c.started_at ? { ...c, started_at: iso(start) } : { started_at: iso(start), paused_ms: 0, paused_at: null, ended_at: null };
  return { ...obs, clock, log };
}

/**
 * Set or move when the lesson ended, after the fact (End lesson pressed late, early or never). Ends a running
 * or paused clock at `end`; an open pause is dropped, so the time up to `end` counts. Log lines keep their
 * times. Refused before the lesson has a start, at or before the start, or in the future.
 */
export function setLessonEnd(obs: Observation, end: Instant, now: Instant): Observation {
  const endMs = ms(end);
  const c = obs.clock;
  if (!c.started_at || !Number.isFinite(endMs) || endMs <= ms(c.started_at) || endMs > ms(now)) return obs;
  return { ...obs, clock: { ...c, ended_at: iso(end), paused_at: null } };
}

// ---------------------------------------------------------------- log

export function logEntry(
  obs: Observation,
  entry: { descriptor?: string | null; look_for?: string | null; kind: LogKind; text: string },
  now: Instant
): Observation {
  const line: LogEntry = {
    id: newId('log'),
    at: iso(now),
    clock: clockLabel(clockMs(obs, now)),
    descriptor: entry.descriptor ?? null,
    look_for: entry.look_for ?? null,
    kind: entry.kind,
    text: entry.text.trim()
  };
  return { ...obs, log: [...obs.log, line] };
}

/** Parse a typed lesson-clock time: 'mm:ss', 'm:ss' or plain minutes ('12'). Null when it isn't one. */
export function parseClock(input: string): string | null {
  const t = input.trim();
  const mins = /^(\d{1,3})$/.exec(t);
  if (mins) return clockLabel(Number(mins[1]) * 60_000);
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  return m ? clockLabel((Number(m[1]) * 60 + Number(m[2])) * 1000) : null;
}

/** Keep the log in lesson-clock order (stable, so equal times keep their order). */
const byClock = (log: LogEntry[]): LogEntry[] =>
  log.map((l, i) => ({ l, i })).sort((a, b) => clockToMs(a.l.clock) - clockToMs(b.l.clock) || a.i - b.i).map((x) => x.l);

/** The moment a lesson-clock time stands for, so a later start change shifts it too. */
const atForClock = (obs: Observation, clock: string, fallback: Instant): string =>
  obs.clock.started_at ? iso(ms(obs.clock.started_at) + clockToMs(clock)) : iso(fallback);

/** Look-for only survives if it belongs to the line's descriptor. */
function keepLook(obs: Observation, descriptor: string | null, lookFor: string | null): string | null {
  if (!descriptor || !lookFor) return null;
  return obs.descriptors.find((d) => d.code === descriptor)?.look_fors.some((l) => l.id === lookFor) ? lookFor : null;
}

export function editLogEntry(
  obs: Observation,
  id: string,
  patch: Partial<Pick<LogEntry, 'text' | 'kind' | 'descriptor' | 'look_for' | 'clock' | 'counts_partial'>>
): Observation {
  const clock = patch.clock !== undefined ? parseClock(patch.clock) : null;
  if (patch.clock !== undefined && !clock) return obs;
  const log = obs.log.map((l) => {
    if (l.id !== id) return l;
    const next: LogEntry = { ...l, ...patch, text: (patch.text ?? l.text).trim() };
    if (clock && clock !== l.clock) { next.clock = clock; next.at = atForClock(obs, clock, l.at); }
    else next.clock = l.clock;
    if (next.kind === 'transition') { next.descriptor = null; next.look_for = null; }
    next.look_for = keepLook(obs, next.descriptor, next.look_for);
    return next;
  });
  return { ...obs, log: clock ? byClock(log) : log };
}

/** Add a line after the fact at a typed lesson-clock time, slotted into clock order. */
export function addLogLineAt(
  obs: Observation,
  entry: { descriptor?: string | null; look_for?: string | null; kind: LogKind; text: string; clock: string },
  now: Instant
): Observation {
  const clock = parseClock(entry.clock);
  if (!clock) return obs;
  const transition = entry.kind === 'transition';
  const descriptor = transition ? null : entry.descriptor ?? null;
  const line: LogEntry = {
    id: newId('log'),
    at: atForClock(obs, clock, now),
    clock,
    descriptor,
    look_for: keepLook(obs, descriptor, entry.look_for ?? null),
    kind: entry.kind,
    text: entry.text.trim() || (transition ? 'Transition' : '')
  };
  return { ...obs, log: byClock([...obs.log, line]) };
}

export function deleteLogEntry(obs: Observation, id: string): Observation {
  return { ...obs, log: obs.log.filter((l) => l.id !== id) };
}

// ---------------------------------------------------------------- tally, write-up, feedback

export interface DescriptorTally {
  strengths: number;
  /** All next steps, including ones Adam set not to count toward Partially. */
  next: number;
  lookHits: Record<string, number>;
  suggestion: Decision | null;
}

/** Counts per planned descriptor. Only strength and next-step lines count toward the suggestion. */
export function tally(obs: Observation): Record<string, DescriptorTally> {
  const out: Record<string, DescriptorTally> = {};
  for (const d of obs.descriptors) {
    const lookHits: Record<string, number> = {};
    for (const lf of d.look_fors) lookHits[lf.id] = 0;
    let strengths = 0;
    let next = 0;
    let partial = 0;
    for (const l of obs.log) {
      if (l.descriptor !== d.code) continue;
      if (l.kind === 'strength') strengths += 1;
      else if (l.kind === 'next') { next += 1; if (l.counts_partial !== false) partial += 1; }
      else continue;
      if (l.look_for && l.look_for in lookHits) lookHits[l.look_for] += 1;
    }
    out[d.code] = {
      strengths,
      next,
      lookHits,
      suggestion: partial > 0 ? 'partial' : strengths > 0 ? 'observed' : null
    };
  }
  return out;
}

const sentence = (t: string): string => {
  const s = t.trim();
  return !s || /[.!?]$/.test(s) ? s : `${s}.`;
};

const emptyRow = (): WriteUpRow => ({ practice: '', strengths: '', decision: null, comments: '', edited: [] });

/** Lines in a Strengths cell that came from Planning, not the lesson; feedback drafting skips them. */
export const PLANNED_PREFIXES = ['Planned impact:', 'How we will know:'] as const;
const isPlannedLine = (l: string): boolean => PLANNED_PREFIXES.some((p) => l.startsWith(p));

/** Plain text of the Planning and Observing meetings' Notes, one paragraph per line. */
export interface GatherNotes {
  planning?: string;
  observing?: string;
}

/** Paragraphs that name this descriptor code ('4.5.2', not '14.5.2' or '4.5.21'). */
export function notesFor(code: string, text: string | undefined): string[] {
  if (!text) return [];
  const re = new RegExp(`(?<![\\d.])${code.replace(/\./g, '\\.')}(?![\\d]|\\.\\d)`);
  return text.split('\n').map((l) => l.trim()).filter((l) => l && re.test(l));
}

/**
 * Fill each row's Teaching practice and Strengths from the Planning meeting, then the log; cells Adam
 * edited are left alone (a cell cleared back to empty fills again). Teaching practice opens with what was planned to demonstrate the descriptor and
 * its look-fors; Strengths opens with the planned impact and how it will be known. Paragraphs in either
 * meeting's Notes that name the descriptor join Teaching practice: Planning's marked, Observing's as written.
 */
export function gatherWriteUp(obs: Observation, notes: GatherNotes = {}): Observation['write_up'] {
  const out: Observation['write_up'] = {};
  for (const d of obs.descriptors) {
    const row = obs.write_up[d.code] ?? emptyRow();
    const lines = obs.log.filter((l) => l.descriptor === d.code);
    const labelOf = (id: string | null) => d.look_fors.find((l) => l.id === id)?.label ?? '';
    const planned = (d.demonstrate.trim() || d.practice.trim());
    const looks = d.look_fors.map((l) => l.label.trim()).filter(Boolean);
    const practice = [
      planned ? `Planned: ${sentence(planned)}` : '',
      looks.length ? `Look-fors: ${looks.join('; ')}.` : '',
      ...notesFor(d.code, notes.planning).map((l) => `From Planning notes: ${l}`),
      ...lines
        .filter((l) => l.kind !== 'next')
        .map((l) => {
          const label = labelOf(l.look_for);
          return `${l.clock} ${label ? `${label}: ` : ''}${l.text}`.trim();
        }),
      ...notesFor(d.code, notes.observing)
    ].filter((l, i, all) => l && all.indexOf(l) === i).join('\n');
    const strengths = [
      d.planned_impact.trim() ? `${PLANNED_PREFIXES[0]} ${sentence(d.planned_impact)}` : '',
      d.how_know.trim() ? `${PLANNED_PREFIXES[1]} ${sentence(d.how_know)}` : '',
      lines.filter((l) => l.kind === 'strength').map((l) => sentence(l.text)).filter(Boolean).join(' '),
      ...lines.filter((l) => l.kind === 'next').map((l) => `Next step: ${sentence(l.text)}`)
    ].filter(Boolean).join('\n');
    out[d.code] = {
      ...row,
      practice: row.edited.includes('practice') && row.practice.trim() ? row.practice : practice,
      strengths: row.edited.includes('strengths') && row.strengths.trim() ? row.strengths : strengths
    };
  }
  return out;
}

/** Draft the supervisor's feedback from the write-up decisions; rows Adam edited, or with no decision, stay. */
export function draftFeedback(obs: Observation): Observation['reflection'] {
  const out: Observation['reflection'] = {};
  for (const d of agreedDescriptors(obs)) {
    const existing: ReflectionRow = obs.reflection[d.code] ?? { teacher: '', feedback: '', feedback_edited: false };
    const row = obs.write_up[d.code];
    if (existing.feedback_edited || !row?.decision) {
      out[d.code] = existing;
      continue;
    }
    const lines = obs.log.filter((l) => l.descriptor === d.code);
    const strengths = row.strengths
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('Next step:') && !isPlannedLine(l))
      .join(' ')
      .trim();
    const nexts = lines.filter((l) => l.kind === 'next').map((l) => sentence(l.text)).filter(Boolean);
    const parts = [strengths];
    if (row.decision !== 'observed' && nexts.length) parts.push(`To develop: ${nexts.join(' ')}`);
    out[d.code] = { ...existing, feedback: parts.filter(Boolean).join('\n\n') };
  }
  return out;
}

// ---------------------------------------------------------------- two-week window

const DAY_MS = 86_400_000;

function dayStamp(t: string | Date): number {
  if (typeof t === 'string') return Date.parse(`${t.slice(0, 10)}T00:00:00Z`);
  return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
}

/** Day 1 is the planning day. `today` is a YYYY-MM-DD string or a Date (local calendar day). */
export function windowDay(plannedOn: string, today: string | Date): number {
  return Math.round((dayStamp(today) - dayStamp(plannedOn)) / DAY_MS) + 1;
}

export function windowTone(day: number): 'calm' | 'amber' | 'rose' {
  return day > 14 ? 'rose' : day >= 12 ? 'amber' : 'calm';
}

export function summaryOf(obs: Observation): ObservationSummary {
  return {
    id: obs.id,
    kind: obs.kind,
    status: obs.status,
    person_ref: obs.teacher.person_ref,
    teacher_name: obs.teacher.name,
    planned_on: obs.planned_on,
    meetings: obs.meetings,
    updated_at: obs.updated_at
  };
}
