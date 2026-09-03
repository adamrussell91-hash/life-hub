import { RecurrenceRuleSchema, type RecurrenceRule } from '@/schemas/recurrence';
import { addDays, parseDue, toDateKey } from '@/domain/queries';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function parseRecurrenceRule(raw: string | null | undefined): RecurrenceRule | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return RecurrenceRuleSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function serializeRecurrenceRule(rule: RecurrenceRule | null): string | null {
  if (!rule) return null;
  return JSON.stringify(RecurrenceRuleSchema.parse(rule));
}

export function defaultRecurrenceRule(
  partial: Pick<RecurrenceRule, 'frequency'> & Partial<RecurrenceRule>
): RecurrenceRule {
  return RecurrenceRuleSchema.parse({
    v: 1,
    interval: 1,
    count: null,
    completed_count: 0,
    ...partial
  });
}

export function hasMoreOccurrences(rule: RecurrenceRule): boolean {
  if (rule.count == null) return true;
  return rule.completed_count + 1 < rule.count;
}

export function advanceRecurrence(rule: RecurrenceRule): RecurrenceRule {
  return {
    ...rule,
    completed_count: rule.completed_count + 1
  };
}

function anchorDate(dueDate: string | null, from: Date = new Date()): Date {
  return parseDue(dueDate) ?? from;
}

/** Next due date after the current anchor. Returns YYYY-MM-DD or null when the series ends. */
export function nextDueDate(
  currentDue: string | null,
  rule: RecurrenceRule,
  from: Date = new Date()
): string | null {
  if (!hasMoreOccurrences(rule)) return null;
  const base = anchorDate(currentDue, from);

  let next: Date;
  switch (rule.frequency) {
    case 'daily':
      next = addDays(base, rule.interval);
      break;
    case 'weekly':
      next = addDays(base, 7 * rule.interval);
      break;
    case 'monthly': {
      next = new Date(base);
      next.setMonth(next.getMonth() + rule.interval);
      break;
    }
    case 'yearly': {
      next = new Date(base);
      next.setFullYear(next.getFullYear() + rule.interval);
      break;
    }
    default:
      return null;
  }

  return toDateKey(next);
}

export function formatRecurrenceLabel(rule: RecurrenceRule): string {
  const every = rule.interval === 1 ? '' : `every ${rule.interval} `;
  const freq =
    rule.frequency === 'daily'
      ? 'day'
      : rule.frequency === 'weekly'
        ? 'week'
        : rule.frequency === 'monthly'
          ? 'month'
          : 'year';
  const weekday =
    rule.frequency === 'weekly' && rule.weekday != null
      ? ` on ${WEEKDAY_NAMES[rule.weekday]}`
      : '';
  const limit =
    rule.count == null ? '' : ` · ${rule.completed_count}/${rule.count} done`;
  return `Repeats ${every}${freq}${weekday}${limit}`;
}
