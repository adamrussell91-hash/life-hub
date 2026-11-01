// apps/teaching/tests/unit/sprint-forms-test.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountTest, mountFeedbackCard } from '@/sprint/phase-test';
import type { FormContext } from '@/sprint/form-kit';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }] });
const status = { identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 2, mates: [] }, mine: {}, received: { levels: { c1: [0, 1, 2] as [number, number, number] }, lines: [{ worked: 'The graffiti felt real.', next: 'Try naming the source.', about: 'c1' }] } };
const ctx = (): FormContext => ({
  status, sprint, blocks: [], row: { key: 'test', open: true, due_date: '', due_time: '', state: 'none', late: false, frozen: false, closed: false, count_in: 0 }, editable: true,
  client: { save: vi.fn(), submit: vi.fn(), feedback: vi.fn(async () => status) } as never,
  frames: [], valueCheck: null, support: 'guided', onStatus: vi.fn()
});

describe('test phase', () => {
  it('shows the feedback the group received and the two reflection prompts', () => {
    const f = mountTest(ctx());
    expect(f.el.querySelector('.sprint-received')?.textContent).toContain('Try naming the source.');
    expect(f.el.querySelector('.sprint-tally__bar')?.getAttribute('aria-label')).toContain('Strong 2');
    expect(f.el.textContent).toContain('What did the feedback show your idea does well?');
  });

  it('feedback card checks before sending and sends once', async () => {
    const c = ctx();
    const card = mountFeedbackCard(c, { group_id: 'g2', group_name: 'Heron', sent: false });
    card.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    expect(card.querySelector('.sprint-checks')?.textContent).toContain('Pick a level for "Uses sources".');
    expect(c.client.feedback).not.toHaveBeenCalled();
  });
});
