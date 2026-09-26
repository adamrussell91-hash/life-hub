import { describe, expect, it } from 'vitest';
import { caseSummaryText } from '@/lib/case-summary';

describe('caseSummaryText', () => {
  it('writes goals, sessions and open promises as plain text', () => {
    const text = caseSummaryText({
      title: 'Fletcher W. · case management',
      goals: [{ id: 'g1', text: 'Maths C → B', progress: 62, note: '31/50' }],
      sessions: [
        { label: 'Session 7 · fillable bar', at: '2026-09-22T22:40:00.000Z', summary: 'Fillable bar introduced.' },
        { label: 'Session 6', at: '2026-09-08T22:40:00.000Z', summary: '' }
      ],
      open: [{ text: 'Check in with Ms D’Souza', direction: 'you_owe' }, { text: '2 hrs maths on the bar', direction: 'they_owe' }],
      kept: 19,
      made: 24
    });
    expect(text).toBe([
      'Fletcher W. · case management',
      '',
      'Goals',
      '- Maths C → B: 62% (31/50)',
      '',
      'Sessions (newest first)',
      '- 23/09/26 Session 7 · fillable bar: Fillable bar introduced.',
      '- 09/09/26 Session 6',
      '',
      'Open promises',
      '- Mr Russell: Check in with Ms D’Souza',
      '- Student/family: 2 hrs maths on the bar',
      '',
      'Promises kept: 19 of 24'
    ].join('\n'));
  });
});
