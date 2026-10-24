// apps/teaching/tests/unit/sprint-forms-mid.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountDecide } from '@/sprint/phase-decide';
import { mountPrototype } from '@/sprint/phase-prototype';
import type { FormContext } from '@/sprint/form-kit';
import type { SprintStatus } from '@/sprint/api';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }] });
const idea = (id: string, title: string) => ({ id, title, idea: `What if ${title}?`, answers: 'a', evidence: 'e', file: null, strongest: false });
const base = (over: Partial<SprintStatus> = {}): SprintStatus => ({
  identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 2, mates: [] }, mine: {},
  gallery: [{ id: 's1', ideas: [idea('i1', 'Ash'), idea('i2', 'Streets')] }, { id: 's2', ideas: [idea('i3', 'Baker')] }],
  heat: null, votes_closed: false, chosen: null, parts: [], ...over
});
const row = (key: 'decide' | 'prototype') => ({ key, open: true, due_date: '', due_time: '', state: 'none' as const, late: false, frozen: false, closed: false, count_in: 0 });
const ctx = (status: SprintStatus, key: 'decide' | 'prototype' = 'decide'): FormContext => ({
  status, sprint, blocks: [], row: row(key), editable: true,
  client: { save: vi.fn(async () => status), submit: vi.fn(async () => status), parts: vi.fn(async () => status), claimPart: vi.fn(async () => status), upload: vi.fn(), pitch: vi.fn(async () => status), fileUrl: vi.fn() } as never,
  frames: ['I think ___ because ___.'], valueCheck: null, support: 'standard', onStatus: vi.fn()
});

describe('decide form', () => {
  it('keeps each set folded until opened, then one vote per criterion moves between ideas', () => {
    const f = mountDecide(ctx(base()));
    const sets = f.el.querySelectorAll<HTMLDetailsElement>('.sprint-set');
    expect(sets).toHaveLength(2);
    expect(f.el.querySelectorAll('.sprint-vote')).toHaveLength(0);
    sets.forEach((s) => { s.open = true; s.dispatchEvent(new Event('toggle')); });
    const chips = [...f.el.querySelectorAll<HTMLButtonElement>('.sprint-vote')].filter((b) => b.dataset.criterion === 'c1');
    chips[0]!.click();
    chips[2]!.click();
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(f.el.textContent).not.toMatch(/Ann|AB/);
  });

  it('says votes are saved while the group’s idea is still being chosen', () => {
    const c = ctx(base({ opened: undefined } as never));
    const f = mountDecide(c);
    f.el.querySelector<HTMLButtonElement>('.sprint-submit .btn--primary')!.click();
    expect(f.el.querySelector('.sprint-checks')?.textContent).toContain('Your votes are saved.');
    expect(c.client.submit).not.toHaveBeenCalled();
  });

  it('after voting shows the chosen idea, the heat and the parts editor', () => {
    const f = mountDecide(ctx(base({ votes_closed: true, chosen: { id: 'i3', title: 'Baker', idea: 'What if Baker?' }, heat: { i1: { c1: 1, c2: 0 }, i2: { c1: 0, c2: 0 }, i3: { c1: 3, c2: 3 } }, parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1', claimed: 0, mine: false }] })));
    expect(f.el.querySelector('.sprint-chosen')?.textContent).toContain('Baker');
    expect(f.el.querySelectorAll('.sprint-heat i[data-level="3"]')).toHaveLength(2);
    expect([...f.el.querySelectorAll<HTMLInputElement>('.sprint-parts input')].map((i) => i.value)).toContain('Panel text');
    expect(f.el.textContent).not.toMatch(/\b\d+ votes?\b/);
  });
});

describe('prototype form', () => {
  it('shows the part brief, upload, pitch file and the self-check', () => {
    const s = base({ chosen: { id: 'i3', title: 'Baker', idea: 'x' }, parts: [{ id: 'p1', text: 'Panel text', shows: 'The baker’s morning', criterion: 'c1', claimed: 1, mine: true }] });
    const f = mountPrototype(ctx(s, 'prototype'));
    expect(f.el.querySelector('.sprint-brief-part')?.textContent).toContain('The baker’s morning');
    expect(f.el.querySelector('input[type="file"]')).not.toBeNull();
    expect(f.el.querySelectorAll('.sprint-levels')).toHaveLength(2);
    expect(f.el.textContent).toContain('Pitch file');
  });
});
