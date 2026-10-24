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

describe('decide: stand-out dots and parts', () => {
  it('places up to the Kit’s dots on parts of any idea, with an optional note, and checks they are all placed', () => {
    const c = ctx(base({ dots: 2 }));
    const f = mountDecide(c);
    f.el.querySelectorAll<HTMLDetailsElement>('.sprint-set').forEach((s) => { s.open = true; s.dispatchEvent(new Event('toggle')); });
    const dots = () => [...f.el.querySelectorAll<HTMLButtonElement>('.sd-dot')];
    expect(dots()).toHaveLength(9);
    expect(f.el.querySelector('.sd-counter')?.textContent).toBe('Stand-out dots: 0 of 2 placed.');
    dots()[0]!.click();
    dots()[5]!.click();
    expect(f.el.querySelector('.sd-counter')?.textContent).toBe('Stand-out dots: 2 of 2 placed.');
    expect(dots()[1]!.disabled).toBe(true);
    const note = dots()[0]!.parentElement!.querySelector<HTMLInputElement>('.sd-note')!;
    expect(note.hidden).toBe(false);
    dots()[5]!.click();
    expect(dots()[1]!.disabled).toBe(false);
    f.el.querySelector<HTMLButtonElement>('.sprint-submit .btn--primary')!.click();
    expect(f.el.querySelector('.sprint-checks')?.textContent).toContain('Place all 2 stand-out dots. You have placed 1.');
  });

  it('gives a part to someone by their initials, says who still needs a part, and adds a borrowed part', () => {
    const status = base({
      votes_closed: true, chosen: { id: 'i3', title: 'Baker', idea: 'What if Baker?' },
      members: [{ key: 'm1', initials: 'AB', me: true }, { key: 'm2', initials: 'CD', me: false }],
      parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1', claimed: 0, mine: false, assigned: [] }, { id: 'p2', text: 'Artefacts', shows: '', criterion: 'c2', claimed: 1, mine: false, assigned: ['m2'] }],
      borrow: [{ idea_id: 'i1', title: 'Ash', part: 'evidence', text: 'Source B', count: 2, notes: ['Strong source'] }]
    });
    const c = ctx(status);
    (c.client as unknown as { assign: unknown }).assign = vi.fn(async () => status);
    const f = mountDecide(c);
    expect(f.el.querySelector('.sd-status')?.textContent).toBe('1 part has no one yet. Still without a part: AB.');
    const chip = [...f.el.querySelectorAll<HTMLButtonElement>('.sd-who .sprint-chip')].find((b) => b.textContent === 'AB (you)')!;
    chip.click();
    expect((c.client as unknown as { assign: ReturnType<typeof vi.fn> }).assign).toHaveBeenCalledWith('p1', ['m1']);
    expect(f.el.querySelector('.sd-borrow')?.textContent).toContain('Ash: Source B ●●');
    [...f.el.querySelectorAll<HTMLButtonElement>('.sd-borrow button')][0]!.click();
    expect([...f.el.querySelectorAll<HTMLInputElement>('.sprint-parts input')].map((i) => i.value)).toContain('From "Ash"');
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
