/** Grove's words. Plain, kind, and true to the data: nothing dies and nothing scolds. */
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { HUB_TZ } from '@/domain/queries';
import type { GrovePlan, GroveTree } from '@/domain/grove/plan';

function trees(n: number): string {
  return n === 1 ? '1 tree' : `${n} trees`;
}

function weekdayName(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' });
}

export function dayCaption(plan: GrovePlan): string {
  const key = plan.from;
  const day = plan.days[0];
  const n = day?.trees.length ?? 0;
  const when = key === plan.today ? 'Today' : weekdayName(key);
  const date = formatDisplayDate(key);
  if (day?.future) return `${when} ${date} · still to come`;
  if (n === 0) return key === plan.today ? `Today ${date} · the clearing is ready` : `${when} ${date} · a quiet meadow`;
  return `${when} ${date} · ${trees(n)}`;
}

export function weekCaption(plan: GrovePlan): string {
  const n = plan.trees.length;
  const range = `${formatDisplayDate(plan.from)} to ${formatDisplayDate(plan.to)}`;
  return n ? `Week of ${range} · ${trees(n)}` : `Week of ${range} · open meadow`;
}

export function finishedLine(tree: GroveTree): string {
  const time = new Date(tree.completedAt).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: HUB_TZ
  });
  const growing = tree.stage === 'mature' ? 'fully grown' : tree.stage === 'young' ? 'growing' : 'a new sapling';
  return `Finished ${formatDisplayDate(tree.dayKey)}, ${time} · ${growing}`;
}

/** Older done tasks with no finish time cannot be planted honestly. Say so once. */
export function undatedNote(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? '1 older finished task has no finish date, so it is not planted.'
    : `${count} older finished tasks have no finish date, so they are not planted.`;
}

export function periodCaption(plan: GrovePlan): string {
  const label = plan.periodLabel;
  const dates = `${formatDisplayDate(plan.from)} to ${formatDisplayDate(plan.to)}`;
  const growth = plan.trees.length ? trees(plan.trees.length) : 'open meadow';
  return `${label} · ${dates} · ${growth}${plan.provisionalCalendar ? ' · provisional dates' : ''}`;
}
