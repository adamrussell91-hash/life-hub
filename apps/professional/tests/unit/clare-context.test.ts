import { describe, expect, it } from 'vitest';
import { buildClareContext } from '@/lib/clare-context';

describe('buildClareContext', () => {
  it('maps the page into Clare’s context with days late and plain notes', () => {
    const ctx = buildClareContext({
      title: 'Alex J. · essay feedback', kind: 'comm', when: 'Wed 14/10/26 11:50',
      withPeople: [{ ref: 'shared:person:p_alex', name: 'Alex J.' }],
      alsoConcerned: [{ ref: 'shared:person:p_morgan', name: 'Morgan J.' }],
      previousSummaries: [{ when: '25/09/26', summary: 'Quote bank agreed.' }],
      ledger: [{ direction: 'you_owe', text: 'Email Morgan', status: 'open', due: '2026-09-22' }],
      blocks: [{ id: 'a', block_type: 'rich_text', content: { html: '<p>Tighter redraft.</p>' } }],
      todayKey: '2026-09-26'
    });
    expect(ctx.people).toEqual([
      { ref: 'shared:person:p_alex', name: 'Alex J.', role: 'with' },
      { ref: 'shared:person:p_morgan', name: 'Morgan J.', role: 'also concerned' }
    ]);
    expect(ctx.open_promises).toEqual([{ direction: 'you_owe', text: 'Email Morgan', days_late: 4 }]);
    expect(ctx.notes).toBe('Tighter redraft.');
  });
});
