import type { CheckColumn, CheckMark, HandinMark, HandinStatus } from './schema';

/** One tap moves a cell to its next value; past the last value it clears (null). */

export const HANDIN_LABEL: Record<HandinStatus, string> = { submitted: 'Submitted', late: 'Late', missing: 'Missing', exempt: 'Exempt' };

export function nextHandin(current: HandinMark | undefined, today: string): HandinMark | null {
  if (!current) return { status: 'submitted', at: today };
  if (current.status === 'submitted') return { status: 'late', at: current.at ?? today };
  if (current.status === 'late') return { status: 'missing' };
  if (current.status === 'missing') return { status: 'exempt' };
  return null;
}

export function nextCheck(scale: CheckColumn['scale'], current: CheckMark | undefined): CheckMark | null {
  if (scale === 'tick') return current === undefined ? true : current === true ? false : null;
  if (typeof current !== 'number') return 1;
  return current < 4 ? current + 1 : null;
}
