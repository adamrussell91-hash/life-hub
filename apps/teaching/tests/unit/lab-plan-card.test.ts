import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePairs, mountLabPlanCard, movedPair, switchLevel } from '@/lab/plan-card';
import { LAB_EXPLAIN_BLOCK_ID, seedLab } from '@/lab/schema';
import type { Lesson } from '@/schemas/lesson';

// An invented class.
const ROSTER = ['KT', 'RV', 'JM', 'AS', 'BN'].map((initials, i) => ({ id: `st_${i + 1}`, name: `Student ${initials}`, initials }));
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(lab = seedLab('class1')) {
  let lesson = {
    id: 'lesson1', type: 'lesson', title: 'Lab', slug: 'lab', unit_id: 'unit1', sequence: 1, status: 'active', blocks: [],
    created_at: '2026-11-19T00:00:00.000Z', updated_at: '2026-11-19T00:00:00.000Z', schema_version: 1, pedagogical_mode: 'lab', lab
  } as unknown as Lesson;
  const emitLesson = vi.fn((next: Lesson) => { lesson = next; });
  const card = mountLabPlanCard({ getLesson: () => lesson, emitLesson, classes: [{ id: 'class1', name: '9 English' }], loadRoster: async () => ROSTER, random: () => 0.5 });
  document.body.append(card.root);
  const rows = () => [...card.root.querySelectorAll('.lab-row dt')].map((dt) => dt.textContent);
  const press = (key: string) => (card.root.querySelector(`[data-key="${key}"]`) as HTMLButtonElement).click();
  return { card, emitLesson, rows, press, lesson: () => lesson };
}

afterEach(() => document.body.replaceChildren());

describe('the Lab card', () => {
  it('You supply it shows the supplied rows', () => {
    const { rows } = mount();
    expect(rows()).toEqual(['Class', 'Question', 'Why we are doing this', 'Kept the same', 'Changed', 'One text per option', 'Who decides the change', 'How readers judge', 'Lab notes', 'Counts as a win', 'Explain prompt', 'My debrief notes']);
  });

  it('switching level swaps the rows and the level’s defaults', () => {
    const { rows, press, lesson } = mount();
    press('level-students');
    expect(rows()).toContain('What students write');
    expect(rows()).not.toContain('One text per option');
    expect(lesson().lab).toMatchObject({ level: 'students', judge: 'pick', threshold: 8, notes_on: false });
    press('level-pairs');
    expect(rows()).toEqual(['Class', 'Question', 'Claim to test', 'Why we are doing this', 'Control text', 'Who decides the change', 'What readers rate', 'Lab notes', 'Features to name', 'Pairs', 'Counts as a change', 'Explain prompt', 'My debrief notes']);
    expect(lesson().lab).toMatchObject({ level: 'pairs', judge: 'rate', threshold: 1, notes_on: true });
    expect(lesson().lab?.features).toHaveLength(6);
  });

  it('typing a line saves it and keeps the Explain block in the lesson', () => {
    const { card, lesson, emitLesson } = mount();
    const question = card.root.querySelector('input[aria-label="Question"]') as HTMLInputElement;
    question.value = 'Does the passive voice shrink the blame?';
    question.dispatchEvent(new Event('input', { bubbles: true }));
    expect(emitLesson).toHaveBeenCalled();
    expect(lesson().lab?.question).toBe('Does the passive voice shrink the blame?');
    expect(lesson().blocks.map((b) => b.id)).toEqual([LAB_EXPLAIN_BLOCK_ID]);
    // The input the teacher is typing in is still the same element.
    expect(question.isConnected).toBe(true);
  });

  it('the Lab notes switch turns notes on and off', () => {
    const { press, lesson } = mount();
    press('notes-on');
    expect(lesson().lab?.notes_on).toBe(true);
    press('notes-off');
    expect(lesson().lab?.notes_on).toBe(false);
  });

  it('Make pairs puts every student in exactly one pair, the odd one in a three', async () => {
    const { card, press, lesson } = mount();
    press('level-pairs');
    (card.root.querySelector('[data-act="make-pairs"]') as HTMLButtonElement).click();
    await flush();
    const pairs = lesson().lab?.pairs ?? [];
    expect(pairs.map((p) => p.students.length)).toEqual([2, 3]);
    expect(pairs.flatMap((p) => p.students).sort()).toEqual(ROSTER.map((r) => r.id).sort());
    expect(card.root.querySelectorAll('.lab-pair')).toHaveLength(2);
    expect(card.root.querySelectorAll('.lab-pair [data-student]')).toHaveLength(5);
  });

  it('a selected student moves to another pair', async () => {
    const { card, press, lesson } = mount();
    press('level-pairs');
    (card.root.querySelector('[data-act="make-pairs"]') as HTMLButtonElement).click();
    await flush();
    const first = lesson().lab!.pairs![0]!;
    const mover = first.students[0]!;
    (card.root.querySelector(`[data-student="${mover}"]`) as HTMLButtonElement).click();
    (card.root.querySelector('[data-act="move-here"]') as HTMLButtonElement).click();
    const after = lesson().lab!.pairs!;
    expect(after.find((p) => p.id === first.id)?.students).not.toContain(mover);
    expect(after.flatMap((p) => p.students).filter((s) => s === mover)).toHaveLength(1);
  });
});

describe('pairs and levels', () => {
  it('makePairs covers every student once for any class size', () => {
    for (const n of [1, 2, 3, 4, 17]) {
      const ids = Array.from({ length: n }, (_, i) => `st_${i}`);
      const pairs = makePairs(ids);
      expect(pairs.flatMap((p) => p.students).sort()).toEqual([...ids].sort());
      expect(pairs.every((p) => p.students.length >= (n === 1 ? 1 : 2) && p.students.length <= 3)).toBe(true);
      expect(new Set(pairs.map((p) => p.id)).size).toBe(pairs.length);
    }
    expect(makePairs(Array.from({ length: 17 }, (_, i) => `st_${i}`))).toHaveLength(8);
  });

  it('moving the last student out of a pair removes the pair', () => {
    expect(movedPair([{ id: 'p1', students: ['a'] }, { id: 'p2', students: ['b', 'c'] }], 'a', 'p2')).toEqual([{ id: 'p2', students: ['b', 'c', 'a'] }]);
  });

  it('switching level keeps the question and resets how readers judge', () => {
    const lab = { ...seedLab('class1'), question: 'A question', debrief: 'Notes' };
    const next = switchLevel(lab, 'students');
    expect(next).toMatchObject({ question: 'A question', debrief: 'Notes', judge: 'pick', threshold: 8 });
    expect(switchLevel(next, 'supplied').texts).toHaveLength(2);
  });
});
