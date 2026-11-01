// apps/teaching/tests/unit/sprint-group-board.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountGroupBoard } from '@/sprint/group-board';
import type { GroupBoard, SprintTeacherApi } from '@/sprint/api';
import type { Lesson } from '@/schemas/lesson';

const idea = (id: string, title: string, strongest: boolean, index: number) => ({ id, title, idea: 'x', answers: '', evidence: '', file: null, strongest, index });
const board = (): GroupBoard => ({
  group: { id: 'g1', name: 'Kestrel' }, awaiting: { kind: 'idea', tie: false, empty: false }, question: { id: 'q', text: 'How might we?' }, chosen: null, notes: [],
  gallery: [
    { id: 's1', name: 'Ann Bell', student_id: 'st_ann', ideas: [idea('i1', 'A phone app', true, 0), idea('i2', 'A textbook', false, 1)] },
    { id: 's2', name: 'Cy Dale', student_id: 'st_cy', ideas: [idea('i3', 'A poster', false, 0), idea('i4', 'A catching game', true, 1)] }
  ],
  totals: { i1: 1, i4: 2 }, heat: { i1: { c1: 1 }, i4: { c1: 3 } }, reasons: [], parts: [], pitch: null, subs: { prototype: [], test: [] }, round: null,
  voted: { done: ['Ann Bell', 'Cy Dale'], waiting: [] }
} as unknown as GroupBoard);

describe('group board gallery', () => {
  it('lists the starred ideas that went head to head, most wins first, and folds away the rest', async () => {
    const host = document.createElement('div');
    const api = { board: vi.fn(async () => board()), confirm: vi.fn(async () => ({})) } as unknown as SprintTeacherApi;
    const lesson = { sprint: { criteria: [{ id: 'c1', text: 'Creativity' }] } } as unknown as Lesson;
    const b = mountGroupBoard(host, { api, groupId: 'g1', getLesson: () => lesson, emitLesson: vi.fn(), onChanged: vi.fn() });
    await b.refresh();
    const top = [...host.querySelectorAll('.sboard__part > .kit-row')].map((r) => r.querySelector('span')!.textContent);
    expect(top).toEqual(['A catching game · Cy Dale · 2 wins', 'A phone app · Ann Bell · 1 win']);
    const more = host.querySelector('.sboard__more')!;
    expect(more.querySelector('summary')!.textContent).toBe('Their other ideas (2, not in the head-to-heads)');
    expect(more.textContent).toContain('A textbook');
    expect(more.textContent).not.toContain('wins');
  });
});
