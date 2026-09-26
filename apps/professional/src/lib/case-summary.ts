import type { ThreadGoal } from '@/domain/types';

function ddmmyy(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: '2-digit', year: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/** Plain text for pasting into an email to Learning Support or a parent. */
export function caseSummaryText(input: {
  title: string;
  goals: ThreadGoal[];
  sessions: Array<{ label: string; at: string; summary: string }>;
  open: Array<{ text: string; direction: 'you_owe' | 'they_owe' }>;
  kept: number;
  made: number;
}): string {
  const lines = [input.title, '', 'Goals'];
  for (const goal of input.goals) {
    const progress = goal.progress === null ? '' : `: ${goal.progress}%`;
    lines.push(`- ${goal.text}${progress}${goal.note ? ` (${goal.note})` : ''}`);
  }
  lines.push('', 'Sessions (newest first)');
  for (const session of input.sessions) {
    lines.push(`- ${ddmmyy(session.at)} ${session.label}${session.summary ? `: ${session.summary}` : ''}`);
  }
  lines.push('', 'Open promises');
  for (const promise of input.open) {
    lines.push(`- ${promise.direction === 'you_owe' ? 'Mr Russell' : 'Student/family'}: ${promise.text}`);
  }
  lines.push('', `Promises kept: ${input.kept} of ${input.made}`);
  return lines.join('\n');
}
