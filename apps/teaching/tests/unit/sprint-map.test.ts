// apps/teaching/tests/unit/sprint-map.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountSprintMap } from '@/sprint/map';
import type { SprintSummary, SprintTeacherApi } from '@/sprint/api';
import { newSprintSettings } from '@/sprint/defaults';
import type { Lesson } from '@/schemas/lesson';

const phases = (over: Record<string, string> = {}) => ({ understand: 'in', sketch: 'none', decide: 'none', prototype: 'none', test: 'none', ...over }) as never;
const opened = (over: Record<string, boolean> = {}) => ({ understand: true, sketch: false, decide: false, prototype: false, test: false, ...over }) as never;
const summary = (): SprintSummary => ({
  groups: [
    { id: 'g1', name: 'Kestrel', open: ['understand', 'sketch', 'decide'], awaiting: { kind: 'idea', tie: false, empty: false }, chosen: false, question: 'How might we?',
      students: [{ id: 'st_ann', initials: 'AB', name: 'Ann Bell', phases: phases({ sketch: 'in', decide: 'draft' }), opened: opened({ decide: true }) }, { id: 'st_cy', initials: 'CD', name: 'Cy Dale', phases: phases({ sketch: 'late' }), opened: opened() }] },
    { id: 'g2', name: 'Heron', open: ['understand'], awaiting: null, chosen: false, question: null,
      students: [{ id: 'st_ed', initials: 'EF', name: 'Ed Fox', phases: phases({ understand: 'draft' }), opened: opened() }] }
  ],
  class_parts: { understand: 'ended', decide: 'open', test: 'open' }, ended: {}, lock: null, extend: {}, running: null, spotlight: null
});
const api = (): SprintTeacherApi => ({ summary: vi.fn(async () => summary()), endClass: vi.fn(async () => summary()), board: vi.fn(async () => ({ group: { id: 'g1', name: 'Kestrel' }, notes: [], gallery: [], totals: {}, heat: {}, reasons: [], parts: [], pitch: null, subs: { prototype: [], test: [] }, round: null, awaiting: null, question: null, chosen: null })) }) as unknown as SprintTeacherApi;
const lesson = { id: 'l1', title: 'Pompeii', sprint: newSprintSettings('class1') } as unknown as Lesson;

describe('progress map', () => {
  it('draws a row per group with a dot per student and the waiting badge', async () => {
    const m = mountSprintMap({ getLesson: () => lesson, api: api(), emitLesson: vi.fn() });
    await m.refresh();
    expect(m.root.querySelectorAll('.smap-row:not(.smap-row--head)')).toHaveLength(2);
    const kestrel = m.root.querySelector('.smap-row:not(.smap-row--head)')!;
    expect(kestrel.querySelectorAll('.smap-cell')[1]!.querySelectorAll('.dot--in, .dot--late')).toHaveLength(2);
    expect(kestrel.textContent).toContain('Choose idea');
    expect(m.root.querySelector('.dot--late')?.getAttribute('title')).toBe('Cy Dale: in late');
  });

  it('warns when the Kit has deadlines students don’t have yet, and shows the published dates', async () => {
    const draft = lesson.sprint!.phases;
    const published = draft.map((p) => ({ key: p.key, where: p.where, due_date: p.due_date, due_time: p.due_time, ends_at: p.ends_at }));
    const same = { ...api(), summary: vi.fn(async () => ({ ...summary(), phases: published })) } as unknown as SprintTeacherApi;
    const m1 = mountSprintMap({ getLesson: () => lesson, api: same, emitLesson: vi.fn() });
    await m1.refresh();
    expect(m1.root.querySelector('.smap-unpublished')).toBeNull();
    const older = published.map((p, i) => (i === 0 ? { ...p, due_date: '2020-01-01' } : p));
    const moved = { ...api(), summary: vi.fn(async () => ({ ...summary(), phases: older })) } as unknown as SprintTeacherApi;
    const m2 = mountSprintMap({ getLesson: () => lesson, api: moved, emitLesson: vi.fn() });
    await m2.refresh();
    expect(m2.root.querySelector('.smap-unpublished')?.textContent).toContain('Publish the lesson');
  });

  it('lists groups waiting on the teacher at the top, and opens that group’s board', async () => {
    const a = api();
    const m = mountSprintMap({ getLesson: () => lesson, api: a, emitLesson: vi.fn() });
    await m.refresh();
    const waits = m.root.querySelector('.smap-waits')!;
    expect(waits.textContent).toContain('Waiting on you');
    expect(waits.textContent).toContain('Kestrel: choose the group’s idea');
    expect(waits.textContent).not.toContain('Heron');
    waits.querySelector<HTMLButtonElement>('button')!.click();
    expect(a.board).toHaveBeenCalledWith('g1');
  });

  it('End class part says who will be marked absent before it ends', async () => {
    const a = api();
    const m = mountSprintMap({ getLesson: () => lesson, api: a, emitLesson: vi.fn() });
    await m.refresh();
    m.root.querySelector<HTMLButtonElement>('[data-end="decide"]')!.click();
    const confirm = m.root.querySelector('.smap-confirm')!;
    expect(confirm.textContent).toContain('1 draft will be submitted as it is');
    expect(confirm.textContent).toContain('Mark 2 students absent (CD, EF)');
    confirm.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    expect(a.endClass).toHaveBeenCalledWith('decide');
  });

  it('opens a group board from its row', async () => {
    const a = api();
    const m = mountSprintMap({ getLesson: () => lesson, api: a, emitLesson: vi.fn() });
    await m.refresh();
    m.root.querySelector<HTMLElement>('.smap-cell')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(a.board).toHaveBeenCalledWith('g1');
    expect(m.root.querySelector('.sboard')).not.toBeNull();
  });
});
