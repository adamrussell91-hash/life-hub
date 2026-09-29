/**
 * "Day changed": a small, coherent set of proposals for the rest of today.
 * Pure: Tideline model in, ghost specs out. Nothing is written here; the server
 * validates and queues them (POST /api/calendar-rescue) and Accept goes through the
 * existing confirmation path.
 *
 * Never moved: lessons, appointments, meetings, iCloud events, Corey, protected
 * time, social/family, walls. Unfinished work stays unfinished; tasks due today
 * stay due today unless Adam says he feels worse (then they are listed, not moved).
 */
import { canMoveItem, itemType } from './calendar-item-actions.js';
import { isOverCapacity } from './capacity-model.js';

export const RESCUE_REASONS = Object.freeze({
  late: 'Running late',
  derailed: 'Got derailed',
  worse: 'Feeling worse',
  changed: 'Plans changed'
});

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (hours) => {
  const total = Math.round(hours * 12) * 5; // 5-minute grid
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
};
const clock = (hours) => {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h % 12 || 12}${m ? `:${pad(m)}` : ''} ${h >= 12 ? 'pm' : 'am'}`;
};
const weekday = (date) => new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Rescue moves only Tasks work blocks; everything else on the day is held fixed. */
function isFlexible(chip) {
  return !chip.ghost && !chip.isClass && !chip.ambient && !chip.protected
    && chip.kind !== 'corey' && canMoveItem(chip) && itemType(chip) === 'work_block';
}

function loadOf(day) {
  return (day.chips ?? [])
    .filter((c) => !c.isClass && !c.protected && !c.ghost && !c.ambient && c.kind !== 'corey')
    .reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0);
}

function clashes(day, start, end, ignoreId) {
  return (day.chips ?? []).some((c) => c.id !== ignoreId && !c.ghost && c.start < end && start < c.end);
}

/** Best later day this week with capacity room and no clash at that time; else tomorrow. */
function pickDay(days, today, chip, extraLoad) {
  const length = chip.end - chip.start;
  const ranked = (days ?? [])
    .filter((day) => day.date > today)
    .map((day) => ({ day, pct: day.cap?.pct ?? 60, load: loadOf(day) + (extraLoad.get(day.date) ?? 0) }))
    .filter(({ day, pct, load }) => !isOverCapacity(pct, load + length) && !clashes(day, chip.start, chip.end, chip.id))
    .sort((a, b) => b.pct - a.pct);
  return ranked[0]?.day.date ?? addDays(today, 1);
}

/** Earliest free start at or after `from` that fits `length` before `limit`, or null. */
function freeStart(day, from, length, limit, ignore) {
  const skip = ignore instanceof Set ? ignore : new Set([ignore]);
  let start = Math.ceil(from * 12) / 12;
  const busy = (day.chips ?? []).filter((c) => !skip.has(c.id) && !c.ghost).sort((a, b) => a.start - b.start);
  for (let guard = 0; guard < 48 && start + length <= limit; guard++) {
    const hit = busy.find((c) => c.start < start + length && start < c.end);
    if (!hit) return start;
    start = Math.ceil(hit.end * 12) / 12;
  }
  return null;
}

/**
 * @param {{ model: object, today: string, nowHour: number, reason: keyof RESCUE_REASONS, lateMinutes?: number, note?: string, lightsOut?: number }} input
 * @returns {{ ghosts: object[], moved: string[], kept: string[], dueToday: string[], why: string,
 *   interrupted: Array<{ taskId: string, title: string, previous: string }> }}
 */
export function buildRescuePlan({ model, today, nowHour, reason, lateMinutes = 0, note = '', lightsOut = 22 }) {
  const day = model?.days?.find((row) => row.date === today);
  const label = RESCUE_REASONS[reason] ?? RESCUE_REASONS.changed;
  const why = reason === 'late'
    ? `${label} (${lateMinutes} min)`
    : note ? `${label}: ${String(note).replace(/\s+/g, ' ').trim().slice(0, 80)}` : label;
  const out = { ghosts: [], moved: [], kept: [], dueToday: [], why, interrupted: [] };
  if (!day) return out;

  const remaining = (day.chips ?? []).filter((c) => c.end > nowHour && !c.ghost);
  const flexible = remaining.filter(isFlexible).sort((a, b) => a.start - b.start);
  out.kept = remaining.filter((c) => !isFlexible(c)).map((c) => `${c.title} (${clock(c.start)})`);
  out.dueToday = (day.due ?? [])
    .filter((row) => row.kind !== 'allday' && row.kind !== 'promise' && itemType(row) === 'task' && row.record?.status !== 'done')
    .map((row) => row.title);

  const extraLoad = new Map();
  const moveToLaterDay = (chip) => {
    const to = pickDay(model.days, today, chip, extraLoad);
    extraLoad.set(to, (extraLoad.get(to) ?? 0) + (chip.end - chip.start));
    out.ghosts.push(moveBlock(chip, to, chip.start, chip.end, today, why));
    out.moved.push(`${chip.title} → ${weekday(to)} ${clock(chip.start)}`);
  };

  if (reason === 'late') {
    const shift = Math.max(0, lateMinutes) / 60;
    const newNow = nowHour + shift;
    for (const chip of flexible) {
      if (chip.start >= newNow) continue; // later blocks are unaffected
      const length = chip.end - chip.start;
      const start = freeStart(day, Math.max(newNow, chip.start + shift), length, lightsOut, chip.id);
      if (start != null) {
        out.ghosts.push(moveBlock(chip, today, start, start + length, today, why));
        out.moved.push(`${chip.title} → ${clock(start)}`);
      } else {
        moveToLaterDay(chip);
      }
    }
    return withInterrupted(out, flexible, nowHour);
  }

  // Derailed: keep the first remaining block that serves something due today; move the rest.
  // Plans changed / feeling worse: clear the rest of today's flexible work.
  const dueIds = new Set((day.due ?? []).map((row) => row.id));
  const keep = reason === 'derailed'
    ? flexible.find((chip) => dueIds.has(chip.record?.task_id)) ?? null
    : null;
  for (const chip of flexible) {
    if (chip === keep) {
      out.kept.unshift(`${chip.title} (${clock(chip.start)}, due today)`);
      continue;
    }
    moveToLaterDay(chip);
  }

  if (reason === 'worse') {
    // Room to recover: 45 minutes at the next free slot before lights-out. Nothing medical.
    // Blocks this rescue moves away no longer hold their slots.
    const leaving = new Set(out.ghosts.filter((g) => g.kind === 'move_block' && g.date !== today).map((g) => g.blockId));
    const start = freeStart(day, nowHour + 1 / 12, 0.75, lightsOut, leaving);
    if (start != null) {
      out.ghosts.push({
        kind: 'protect_block',
        date: today,
        start: hhmm(start),
        end: hhmm(start + 0.75),
        title: 'Rest, protected',
        reason: why
      });
    }
  }
  return withInterrupted(out, flexible, nowHour);
}

/** Work cut off mid-block: the receipt offers a way back in for each task. */
function withInterrupted(out, flexible, nowHour) {
  const movedIds = new Set(out.ghosts.filter((g) => g.kind === 'move_block').map((g) => g.blockId));
  const seen = new Set();
  for (const chip of flexible) {
    const taskId = chip.record?.task_id;
    if (!taskId || seen.has(taskId) || !movedIds.has(chip.id) || !(chip.start <= nowHour && nowHour < chip.end)) continue;
    seen.add(taskId);
    out.interrupted.push({ taskId, title: chip.title, previous: chip.bookmark?.note ?? '' });
  }
  return out;
}

function moveBlock(chip, date, start, end, today, why) {
  return {
    kind: 'move_block',
    blockId: chip.id,
    from: chip.date ?? today,
    date,
    start: hhmm(start),
    end: hhmm(end),
    title: chip.title,
    reason: why
  };
}
