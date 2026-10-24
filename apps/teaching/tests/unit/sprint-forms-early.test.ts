// apps/teaching/tests/unit/sprint-forms-early.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountUnderstand } from '@/sprint/phase-understand';
import { mountSketch } from '@/sprint/phase-sketch';
import type { FormContext } from '@/sprint/form-kit';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }], requirements: [{ id: 'r1', text: 'Two sources', phases: ['sketch'] }] });
const ctx = (over: Partial<FormContext> = {}): FormContext => ({
  status: { identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 2, mates: [] }, notes: [{ id: 'n1', text: 'How might we a?', mine: false }], mine: {} },
  sprint, blocks: [], row: { key: 'understand', open: true, due_date: '', due_time: '', state: 'none', late: false, frozen: false, closed: false, count_in: 0 },
  editable: true,
  client: { save: vi.fn(async () => ({})), submit: vi.fn(async () => ({})) } as never,
  frames: ['What if ___?'], valueCheck: { question: 'Is there another way to look at this?', asks: 'Name a different view.' }, support: 'guided', onStatus: vi.fn(),
  ...over
});

describe('understand form', () => {
  it('shows the frame, three boxes and the group’s notes to star', () => {
    const f = mountUnderstand(ctx());
    expect(f.el.querySelectorAll('.sprint-note-input')).toHaveLength(3);
    expect(f.el.textContent).toContain('How might we [action] for [who] so that [result]?');
    const star = f.el.querySelector<HTMLButtonElement>('.sprint-star')!;
    star.click();
    expect(star.getAttribute('aria-pressed')).toBe('true');
  });

  it('lists what to add before it submits', () => {
    const c = ctx();
    const f = mountUnderstand(c);
    f.el.querySelector<HTMLButtonElement>('.sprint-submit .btn--primary')!.click();
    expect(f.el.querySelector('.sprint-checks')?.textContent).toContain('Write 3 "How might we" questions');
    expect(c.client.submit).not.toHaveBeenCalled();
  });
});

describe('sketch form', () => {
  it('has a tab per idea, the idea card fields and the requirement ticks', () => {
    const f = mountSketch(ctx({ row: { key: 'sketch', open: true, due_date: '', due_time: '', state: 'none', late: false, frozen: false, closed: false, count_in: 0 } }));
    expect(f.el.querySelectorAll('.sprint-tab')).toHaveLength(3);
    expect(f.el.textContent).toContain('It answers our question because…');
    expect(f.el.textContent).toContain('Two sources');
    expect(f.el.textContent).toContain('Is there another way to look at this?');
  });
});
