import { el } from '@/quiz/dom';
import { endsAtEpoch, phaseDue } from './rules';
import { PHASE_LABELS, type SprintPhase, type SprintPhaseKey } from './schema';

type PhaseTimes = Pick<SprintPhase, 'key' | 'where' | 'due_date' | 'due_time' | 'ends_at'>;

export type PhaseSpan = {
  key: SprintPhaseKey;
  where: 'class' | 'home';
  /** Null for Understand: it opens when the sprint starts. */
  opens: number | null;
  closes: number | null;
  /** A class phase's lock after the lesson ends. */
  lock: { from: number; until: number } | null;
  problems: string[];
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * When each phase opens and closes. The teacher sets only the closes; each
 * phase opens when the one before it closes. A class phase that ended (or
 * has a lesson end time) locks for lockHours after it. Pure.
 */
export function phaseSpans(phases: readonly PhaseTimes[], lockHours: number, ended: Partial<Record<SprintPhaseKey, { at: string }>> = {}): PhaseSpan[] {
  const spans: PhaseSpan[] = [];
  phases.forEach((p, i) => {
    const closes = phaseDue(p);
    const prev = spans[i - 1];
    const problems: string[] = [];
    if (closes === null) problems.push('Set a close time');
    else if (prev?.closes != null && closes <= prev.closes) problems.push(`Closes before ${PHASE_LABELS[prev.key]} closes`);
    let lock: PhaseSpan['lock'] = null;
    if (p.where === 'class') {
      const endAt = ended[p.key] ? Date.parse(ended[p.key]!.at) : endsAtEpoch(p.ends_at ?? '');
      if (endAt !== null && closes !== null && !ended[p.key] && endAt > closes) problems.push('The lesson ends after the phase closes');
      if (endAt !== null && lockHours > 0) lock = { from: endAt, until: endAt + lockHours * HOUR };
    }
    spans.push({ key: p.key, where: p.where, opens: i === 0 ? null : prev?.closes ?? null, closes, lock, problems });
  });
  return spans;
}

const DAY_FMT = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric' });
const WHEN_FMT = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** "Mon 26 Oct, 3:00 pm" in Sydney. */
export function whenText(epoch: number): string {
  return WHEN_FMT.format(new Date(epoch)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`);
}

/** Midnight Sydney at or before `epoch`. */
function sydneyMidnight(epoch: number): number {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(epoch));
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  return epoch - (get('hour') * HOUR + get('minute') * 60_000) - (epoch % 60_000);
}

export type GanttOptions = {
  /** Draws the red now line. */
  now?: number;
  /** Bars become buttons that pick a phase. */
  onPick?: (key: SprintPhaseKey) => void;
  picked?: SprintPhaseKey | null;
  /** A note under a bar, e.g. "Open early for 2 groups". */
  note?: Partial<Record<SprintPhaseKey, string>>;
};

/** One row per phase: name, Opens and Closes in words, and a bar on a shared day axis. */
export function renderPhaseGantt(spans: readonly PhaseSpan[], o: GanttOptions = {}): HTMLElement {
  const root = el('div', 'pgantt');
  const known = spans.flatMap((s) => [s.closes, s.opens, s.lock?.until ?? null]).filter((x): x is number => x !== null);
  if (o.now !== undefined) known.push(o.now);
  const first = known.length ? Math.min(...known) : Date.now();
  const start = sydneyMidnight(first);
  const end = Math.max(start + DAY, sydneyMidnight(Math.max(first, ...known)) + DAY);
  const pct = (t: number) => `${(((Math.min(Math.max(t, start), end) - start) / (end - start)) * 100).toFixed(3)}%`;

  const days = Math.round((end - start) / DAY);
  const axis = el('div', 'pgantt__axis');
  axis.setAttribute('aria-hidden', 'true');
  for (let d = 0; d < days; d += 1) {
    const at = start + d * DAY + 2 * HOUR;
    const label = DAY_FMT.format(new Date(at));
    const tick = el('span', 'pgantt__tick', days > 14 && !label.startsWith('Mon') ? '' : label);
    tick.style.left = pct(start + d * DAY);
    tick.style.width = `${(100 / days).toFixed(3)}%`;
    axis.append(tick);
  }
  root.append(el('div', 'pgantt__corner'), axis);

  for (const [i, s] of spans.entries()) {
    const name = el('div', 'pgantt__name');
    name.append(el('b', '', PHASE_LABELS[s.key]), el('span', `pill ${s.where === 'class' ? 'pill--class' : 'pill--home'}`, s.where === 'class' ? 'Class' : 'Home'));
    const times = el('span', 'pgantt__times');
    times.append(
      el('span', '', `Opens ${s.opens === null ? (i === 0 ? 'when you start' : `when ${PHASE_LABELS[spans[i - 1]!.key]} closes`) : whenText(s.opens)}`),
      el('span', s.closes === null ? 'pgantt__bad' : '', `Closes ${s.closes === null ? 'not set' : whenText(s.closes)}`)
    );
    if (i > 0) times.append(el('span', 'pgantt__soon', 'Sooner if the whole group finishes'));
    name.append(times);
    const track = el('div', 'pgantt__track');
    const from = s.opens ?? (s.closes !== null ? Math.max(start, s.closes - DAY) : start);
    const to = s.closes ?? from + DAY;
    const bar = el(o.onPick ? 'button' : 'div', `pgantt__bar pgantt__bar--${s.where}${s.closes === null ? ' pgantt__bar--missing' : ''}${o.picked === s.key ? ' is-picked' : ''}`);
    bar.dataset.phase = s.key;
    bar.style.left = pct(from);
    bar.style.width = `calc(${pct(to)} - ${pct(from)})`;
    bar.append(el('span', '', s.closes === null ? 'Set a close time' : s.problems[0] ?? PHASE_LABELS[s.key]));
    if (bar instanceof HTMLButtonElement) {
      bar.type = 'button';
      bar.setAttribute('aria-label', `Edit ${PHASE_LABELS[s.key]}`);
      bar.addEventListener('click', () => o.onPick?.(s.key));
    }
    track.append(bar);
    if (s.lock) {
      const lock = el('div', 'pgantt__lock');
      lock.style.left = pct(s.lock.from);
      lock.style.width = `calc(${pct(s.lock.until)} - ${pct(s.lock.from)})`;
      lock.title = `Locked until ${whenText(s.lock.until)}`;
      track.append(lock);
    }
    if (o.now !== undefined) {
      const line = el('div', 'pgantt__now');
      line.style.left = pct(o.now);
      track.append(line);
    }
    const row = el('div', `pgantt__row${s.problems.length ? ' pgantt__row--bad' : ''}`);
    row.append(name, track);
    if (s.problems.length && s.closes !== null) row.append(el('p', 'pgantt__problem', s.problems.join('. ')));
    if (o.note?.[s.key]) row.append(el('p', 'pgantt__note', o.note[s.key]!));
    root.append(row);
  }
  if (o.now !== undefined) {
    const legend = el('p', 'pgantt__legend');
    legend.append(el('span', 'pgantt__key pgantt__key--now'), `Now: ${whenText(o.now)}`);
    root.append(legend);
  }
  return root;
}

/** The phases a group opened before their time, as "Open early for N groups" notes. */
export function earlyNotes(spans: readonly PhaseSpan[], groupsOpen: ReadonlyArray<readonly SprintPhaseKey[]>, now: number): Partial<Record<SprintPhaseKey, string>> {
  const out: Partial<Record<SprintPhaseKey, string>> = {};
  for (const s of spans) {
    if (s.opens === null || s.opens <= now) continue;
    const n = groupsOpen.filter((open) => open.includes(s.key)).length;
    if (n) out[s.key] = `Open early for ${n} ${n === 1 ? 'group' : 'groups'}`;
  }
  return out;
}

