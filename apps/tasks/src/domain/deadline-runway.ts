/**
 * Deadline runway — backward plan from a hard deadline.
 * Never moves the deadline.
 */

export type RunwayInput = {
  deadline: string; // YYYY-MM-DD
  remaining_minutes: number;
  calibration_factor?: number | null; // Clare multiplier, default 1
  dependencies?: Array<{ id: string; title: string; satisfied: boolean }>;
  milestones?: Array<{ id: string; title: string; due_date: string | null }>;
  already_scheduled_minutes?: number;
  available_minutes_until_deadline?: number | null;
  buffer_minutes?: number | null;
  /** Labelled fallback when buffer not configured. */
  fallback_buffer_minutes?: number;
  today?: string;
};

export type RunwaySegment = {
  kind: 'work' | 'dependency' | 'target' | 'buffer' | 'deadline';
  label: string;
  minutes: number | null;
  date: string | null;
};

export type RunwayResult = {
  latest_safe_start: string | null;
  recommended_start: string | null;
  required_work_minutes: number;
  buffer_minutes: number;
  buffer_source: 'profile' | 'fallback';
  risk: 'clear' | 'tight' | 'impossible';
  unsatisfied_dependencies: Array<{ id: string; title: string }>;
  segments: RunwaySegment[];
  required_blocks: Array<{ minutes: number; depth: 'deep' | 'shallow' | 'admin' }>;
  note: string;
};

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function computeDeadlineRunway(input: RunwayInput): RunwayResult {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const factor =
    input.calibration_factor != null && Number.isFinite(input.calibration_factor)
      ? Math.max(0.5, input.calibration_factor)
      : 1;
  const remaining = Math.max(0, Math.round(input.remaining_minutes * factor));
  const scheduled = Math.max(0, input.already_scheduled_minutes ?? 0);
  const stillNeeded = Math.max(0, remaining - scheduled);

  const bufferConfigured = input.buffer_minutes;
  const buffer =
    bufferConfigured != null && Number.isFinite(bufferConfigured)
      ? Math.max(0, bufferConfigured)
      : (input.fallback_buffer_minutes ?? 60);
  const buffer_source: 'profile' | 'fallback' =
    bufferConfigured != null && Number.isFinite(bufferConfigured) ? 'profile' : 'fallback';

  const unsatisfied = (input.dependencies ?? []).filter((d) => !d.satisfied);
  const totalNeed = stillNeeded + buffer;
  const available = input.available_minutes_until_deadline;

  let risk: RunwayResult['risk'] = 'clear';
  if (available != null && available < stillNeeded) risk = 'impossible';
  else if (available != null && available < totalNeed) risk = 'tight';
  else if (daysBetween(today, input.deadline) <= 1 && stillNeeded > 120) risk = 'tight';

  const workDaysNeeded = Math.max(1, Math.ceil(stillNeeded / 120));
  const latest = addDays(input.deadline, -workDaysNeeded);
  const recommended = addDays(input.deadline, -(workDaysNeeded + (buffer_source === 'fallback' ? 1 : 0)));

  const blocks: Array<{ minutes: number; depth: 'deep' | 'shallow' | 'admin' }> = [];
  let left = stillNeeded;
  while (left > 0) {
    const chunk = Math.min(left, left > 90 ? 90 : left >= 45 ? 60 : Math.max(25, left));
    blocks.push({ minutes: chunk, depth: chunk >= 60 ? 'deep' : 'shallow' });
    left -= chunk;
  }

  const segments: RunwaySegment[] = [
    { kind: 'work', label: 'Required work', minutes: stillNeeded, date: recommended },
    ...unsatisfied.map((d) => ({
      kind: 'dependency' as const,
      label: d.title,
      minutes: null,
      date: null
    })),
    { kind: 'buffer', label: `Buffer (${buffer_source})`, minutes: buffer, date: latest },
    { kind: 'deadline', label: 'Deadline', minutes: null, date: input.deadline }
  ];

  let note = `Hard deadline ${input.deadline} unchanged.`;
  if (risk === 'impossible') {
    note = `Impossible under available capacity before ${input.deadline}. Deadline not moved.`;
  } else if (risk === 'tight') {
    note = `Tight runway before ${input.deadline}. Protect the required blocks.`;
  }
  if (unsatisfied.length) {
    note += ` ${unsatisfied.length} unsatisfied dependenc${unsatisfied.length === 1 ? 'y' : 'ies'}.`;
  }

  return {
    latest_safe_start: latest < today ? today : latest,
    recommended_start: recommended < today ? today : recommended,
    required_work_minutes: stillNeeded,
    buffer_minutes: buffer,
    buffer_source,
    risk,
    unsatisfied_dependencies: unsatisfied.map((d) => ({ id: d.id, title: d.title })),
    segments,
    required_blocks: blocks,
    note
  };
}
