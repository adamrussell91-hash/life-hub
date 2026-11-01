// apps/teaching/tests/unit/sprint-forms-mid.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountDecide } from '@/sprint/phase-decide';
import { mountPrototype } from '@/sprint/phase-prototype';
import type { FormContext } from '@/sprint/form-kit';
import type { SprintStatus } from '@/sprint/api';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }] });
const idea = (id: string, title: string) => ({ id, title, idea: `What if ${title}?`, answers: 'a', evidence: 'e', file: null, strongest: true });
const base = (over: Partial<SprintStatus> = {}): SprintStatus => ({
  identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 3, mates: [] }, mine: {},
  pool: [idea('i1', 'Ash'), idea('i2', 'Streets'), idea('i3', 'Baker')],
  votes_closed: false, chosen: null, parts: [], ...over
});
const row = (key: 'decide' | 'prototype') => ({ key, open: true, due_date: '', due_time: '', state: 'none' as const, late: false, frozen: false, closed: false, count_in: 0 });
const ctx = (status: SprintStatus, key: 'decide' | 'prototype' = 'decide'): FormContext => ({
  status, sprint, blocks: [], row: row(key), editable: true,
  client: { save: vi.fn(async () => status), submit: vi.fn(async () => status), parts: vi.fn(async () => status), claimPart: vi.fn(async () => status), upload: vi.fn(), pitch: vi.fn(async () => status), fileUrl: vi.fn() } as never,
  frames: ['I think ___ because ___.'], valueCheck: null, support: 'standard', onStatus: vi.fn()
});

describe('decide form', () => {
  const winLeft = (f: { el: HTMLElement }) => f.el.querySelector<HTMLButtonElement>('.sdd-idea .sdd-win')!.click();
  const chip = (f: { el: HTMLElement }, n = 0) => f.el.querySelectorAll<HTMLButtonElement>('.sdd-why .sprint-vote')[n]!.click();
  const next = (f: { el: HTMLElement }) => [...f.el.querySelectorAll<HTMLButtonElement>('.sdd-nav button')].at(-1)!;

  it('shows two ideas at a time, a winner and what it is stronger in, then the next pair', () => {
    const f = mountDecide(ctx(base()));
    expect(f.el.querySelector('.sd-purpose')?.textContent).toContain('starred your strongest idea');
    expect(f.el.querySelectorAll('.sdd-idea')).toHaveLength(2);
    expect(f.el.querySelector('.sdd-progress__text')?.textContent).toBe('Match-up 1 of 3');
    expect(next(f).disabled).toBe(true);
    winLeft(f);
    expect(f.el.querySelector('.sdd-idea.is-winner')).not.toBeNull();
    expect(f.el.querySelector('.sdd-why__ask')?.textContent).toContain('is stronger in');
    expect(next(f).disabled).toBe(true);
    chip(f);
    expect(next(f).disabled).toBe(false);
    next(f).click();
    expect(f.el.querySelector('.sdd-progress__text')?.textContent).toBe('Match-up 2 of 3');
    expect(f.el.querySelectorAll('.sdd-pill.is-done')).toHaveLength(1);
    expect(f.el.textContent).not.toMatch(/Ann|AB/);
  });

  it('every pair once gives the student a 1st, 2nd and 3rd', () => {
    const f = mountDecide(ctx(base()));
    expect(f.el.querySelector('.sdd-rank')?.textContent).toContain('3 to go');
    for (let n = 0; n < 3; n++) { winLeft(f); chip(f); if (n < 2) next(f).click(); }
    const rows = [...f.el.querySelectorAll('.sdd-rank .sdd-podium__row')];
    expect(rows.map((r) => r.querySelector('.sdd-podium__place')?.textContent)).toEqual(['1st', '2nd', '3rd']);
    expect(rows[0]!.textContent).toContain('Won 2 of 2');
    expect(rows[0]!.textContent).toContain('stronger in Uses sources ×2');
  });

  it('asks for every match-up, then says picks are saved while the group’s idea is still being chosen', () => {
    const c = ctx(base());
    const f = mountDecide(c);
    f.el.querySelector<HTMLButtonElement>('.sprint-submit .btn--primary')!.click();
    expect(f.el.querySelector('.sprint-checks')?.textContent).toContain('Pick a winner in every match-up. 3 of 3 still to do.');
    expect(f.el.querySelector('.sprint-checks')?.textContent).toContain('Nothing to submit yet.');
    expect(c.client.submit).not.toHaveBeenCalled();
  });

  it('says who the group is still waiting on and what comes next', () => {
    const f = mountDecide(ctx(base({ decider: 'teacher', members: [{ key: 'm1', initials: 'AB', me: true, done: false }, { key: 'm2', initials: 'CD', me: false, done: true }, { key: 'm3', initials: 'EF', me: false, done: false }] })));
    for (let n = 0; n < 3; n++) { winLeft(f); chip(f); if (n < 2) next(f).click(); }
    const wait = f.el.querySelector('.sdd-wait')!.textContent!;
    expect(wait).toContain('2 of 3 in your group have finished. Still going: EF.');
    expect(wait).toContain('your teacher confirms the idea');
    expect(wait).toContain('give each part to someone by their initials');
    const held = mountDecide(ctx(base({ awaiting: { kind: 'question' } })));
    expect(held.el.querySelector('.sdd-wait')!.textContent).toContain('still has to confirm your group’s problem');
  });

  it('after voting shows the chosen idea, the top three, the strongest in each criterion and the parts editor', () => {
    const f = mountDecide(ctx(base({
      votes_closed: true, chosen: { id: 'i3', title: 'Baker', idea: 'What if Baker?' },
      results: { ranking: [{ id: 'i3', title: 'Baker' }, { id: 'i1', title: 'Ash' }], best_at: [{ criterion: 'c1', ideas: [{ id: 'i1', title: 'Ash', idea: 'What if Ash?' }] }], unanimous: true },
      parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1', claimed: 0, mine: false }]
    })));
    expect(f.el.querySelector('.sprint-chosen')?.textContent).toContain('Everyone in your group picked this idea 1st.');
    expect([...f.el.querySelectorAll('.sdd-result .sdd-podium__row')].map((r) => r.textContent)).toEqual(['1stIdea C · Baker', '2ndIdea A · Ash']);
    expect(f.el.querySelector('.sdd-best')?.textContent).toContain('Uses sources: Idea A · Ash');
    expect([...f.el.querySelectorAll<HTMLInputElement>('.sprint-parts input')].map((i) => i.value)).toContain('Panel text');
    expect(f.el.textContent).not.toMatch(/\b\d+ (votes?|wins?)\b/);
  });
});

describe('decide: parts', () => {
  it('gives a part to someone by their initials, says who still needs a part, and borrows the strongest bit of another idea', () => {
    const status = base({
      votes_closed: true, chosen: { id: 'i3', title: 'Baker', idea: 'What if Baker?' },
      results: { ranking: [], best_at: [{ criterion: 'c2', ideas: [{ id: 'i1', title: 'Ash', idea: 'What if Ash?' }] }], unanimous: false },
      members: [{ key: 'm1', initials: 'AB', me: true }, { key: 'm2', initials: 'CD', me: false }],
      parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1', claimed: 0, mine: false, assigned: [] }, { id: 'p2', text: 'Artefacts', shows: '', criterion: 'c2', claimed: 1, mine: false, assigned: ['m2'] }]
    });
    const c = ctx(status);
    (c.client as unknown as { assign: unknown }).assign = vi.fn(async () => status);
    const f = mountDecide(c);
    expect(f.el.querySelector('.sd-status')?.textContent).toBe('1 part has no one yet. Still without a part: AB.');
    const chip = [...f.el.querySelectorAll<HTMLButtonElement>('.sd-who .sprint-chip')].find((b) => b.textContent === 'AB (you)')!;
    chip.click();
    expect((c.client as unknown as { assign: ReturnType<typeof vi.fn> }).assign).toHaveBeenCalledWith('p1', ['m1']);
    expect(f.el.querySelector('.sd-borrow')?.textContent).toContain('Why it matters: “Ash”. What if Ash?');
    [...f.el.querySelectorAll<HTMLButtonElement>('.sd-borrow button')][0]!.click();
    expect([...f.el.querySelectorAll<HTMLInputElement>('.sprint-parts input')].map((i) => i.value)).toContain('From "Ash"');
    const selects = [...f.el.querySelectorAll<HTMLSelectElement>('.sprint-parts select')];
    expect(selects.map((x) => x.value)).toEqual(['c1', 'c2', 'c2']);
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

  it('a rebuilt form keeps what was typed and sends the waiting autosave', () => {
    const s = base({ chosen: { id: 'i3', title: 'Baker', idea: 'x' } });
    const c = { ...ctx(s, 'prototype'), drafts: {} };
    const first = mountPrototype(c);
    const area = first.el.querySelector<HTMLTextAreaElement>('textarea')!;
    area.value = 'The panel opens with the baker at dawn.';
    area.dispatchEvent(new Event('input'));
    first.dispose();
    expect(c.client.save).toHaveBeenCalledWith('prototype', expect.objectContaining({ text: 'The panel opens with the baker at dawn.' }));
    const again = mountPrototype(c);
    expect(again.el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('The panel opens with the baker at dawn.');
  });
});

describe('assembler', () => {
  const members = [{ key: 'm1', initials: 'AB', me: true }, { key: 'm2', initials: 'CD', me: false }];
  const parts = [{ id: 'p1', text: 'Panel text', shows: 'The morning', criterion: 'c1', claimed: 1, mine: true, assigned: ['m1'] }, { id: 'p2', text: 'Artefacts', shows: '', criterion: 'c2', claimed: 1, mine: false, assigned: ['m2'] }];
  const groupParts = [
    { part_id: 'p1', part: 'Panel text', who: 'AB', me: true, text: 'The baker at dawn.', link: '', files: [], in: true, started: true },
    { part_id: 'p2', part: 'Artefacts', who: 'CD', me: false, text: '', link: 'https://example.com/list', files: [{ id: 'f1', name: 'list.pdf' }], in: false, started: true }
  ];

  it('is picked in Decide by initials, and Decide asks for one until it is', () => {
    const status = base({ votes_closed: true, chosen: { id: 'i3', title: 'Baker', idea: 'x' }, members, parts, assemble: true, assembler: null });
    const c = ctx(status);
    (c.client as unknown as { setAssembler: unknown }).setAssembler = vi.fn(async () => status);
    const f = mountDecide(c);
    expect(f.el.querySelector('.sd-status')?.textContent).toBe('No assembler yet.');
    [...f.el.querySelectorAll<HTMLButtonElement>('.sd-assembler .sprint-chip')].find((b) => b.textContent === 'CD')!.click();
    expect((c.client as unknown as { setAssembler: ReturnType<typeof vi.fn> }).setAssembler).toHaveBeenCalledWith('m2');
    f.el.querySelector<HTMLButtonElement>('.sprint-submit .btn--primary')!.click();
    expect(f.el.querySelector('.sprint-checks')?.textContent).toContain('Pick who puts the prototype together.');
  });

  it('in Prototype everyone sees the group’s parts; only the assembler can upload the finished prototype', () => {
    const others = mountPrototype(ctx(base({ chosen: { id: 'i3', title: 'Baker', idea: 'x' }, parts, members, assemble: true, assembler: { key: 'm2', initials: 'CD', me: false }, group_parts: groupParts }), 'prototype'));
    expect(others.el.querySelector('.sp-parts summary')?.textContent).toBe('Your group’s parts · 1 of 2 in');
    expect(others.el.querySelector('.sp-parts')?.textContent).toContain('The baker at dawn.');
    expect(others.el.querySelector('.sp-parts')?.textContent).toContain('Open list.pdf');
    expect(others.el.textContent).toContain('Waiting for CD to put it together.');
    expect(others.el.querySelector('[aria-label="Upload the finished prototype"]')).toBeNull();
    const assembler = mountPrototype(ctx(base({ chosen: { id: 'i3', title: 'Baker', idea: 'x' }, parts, members, assemble: true, assembler: { key: 'm1', initials: 'AB', me: true }, group_parts: groupParts }), 'prototype'));
    expect(assembler.el.querySelector('[aria-label="Upload the finished prototype"]')).not.toBeNull();
    expect(assembler.el.textContent).toContain('You’re the assembler.');
  });
});
