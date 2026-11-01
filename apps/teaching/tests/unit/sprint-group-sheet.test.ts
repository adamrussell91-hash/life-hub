// apps/teaching/tests/unit/sprint-group-sheet.test.ts
import { describe, it, expect } from 'vitest';
import { createGroupSheet } from '@/sprint/group-sheet';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';
import type { SprintStatus } from '@/sprint/api';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }], requirements: [{ id: 'r1', text: 'A labelled diagram', phases: ['prototype'] }] });
const challenge = [
  { id: 'h1', type: 'block', block_type: 'heading', variant: 'section', visibility: 'student_teacher', content: { text: 'The challenge' } },
  { id: 'h2', type: 'block', block_type: 'heading', variant: 'section', visibility: 'student_teacher', content: { text: 'Make the museum friendlier for Year 7' } }
] as never;
const base = (over: Partial<SprintStatus> = {}): SprintStatus => ({ identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 2, mates: [] }, ...over });
const labels = (el: HTMLElement) => [...el.querySelectorAll('.sprint-sheet__label > span')].map((x) => x.textContent);

describe('group sheet', () => {
  it('shows only the rows that have something in them', () => {
    const sheet = createGroupSheet({ sprint, challenge });
    sheet.update(base(), 'understand');
    expect(labels(sheet.el)).toEqual(['Challenge']);
    expect(sheet.el.querySelector('.sprint-sheet__challenge')?.textContent).toContain('Make the museum friendlier');
    expect(sheet.el.querySelector('.sprint-sheet__challenge')?.textContent).not.toContain('The challenge');
    expect(sheet.el.textContent).not.toMatch(/Comes later/);
  });

  it('builds through the phases: brief, idea, parts and who, assembler, prototype', () => {
    const members = [{ key: 'm1', initials: 'AB', me: true }, { key: 'm2', initials: 'CD', me: false }];
    const sheet = createGroupSheet({ sprint, challenge });
    sheet.update(base({
      brief: { problem: 'Year 7s get lost.', audience: { who: 'Year 7 students', why: 'They are new.' }, limits: { can_known: [{ text: 'Canva', count: 2 }], cant_unknown: [{ text: 'The budget', count: 1 }] }, answers: [{ question: 'The budget?', answer: 'Small.' }] },
      chosen: { id: 'i1', title: 'A map app', idea: 'Pets you feed.' }, members, assembler: { key: 'm2', initials: 'CD', me: false },
      parts: [{ id: 'p1', text: 'Screens', shows: '', how: '', criterion: 'c1', claimed: 1, mine: true, assigned: ['m1', 'm2'] }],
      pitch: { kind: 'link', name: '', file: null, link: 'https://example.com/proto' }
    }), 'prototype');
    expect(labels(sheet.el)).toEqual(['Challenge', 'Must include', 'Problem', 'Audience', 'Limits', 'Our idea', 'Parts and who', 'Puts it together', 'Prototype']);
    expect(sheet.el.querySelector('.sprint-sheet__limits')?.textContent).toBe('Have: CanvaAsk the expert: The budget');
    expect(sheet.el.querySelector('.sprint-sheet__expert summary')?.textContent).toBe('What the expert said (1)');
    expect(sheet.el.querySelector('.sprint-sheet__row--parts')?.textContent).toContain('Screens · AB (you), CD');
  });

  it('keeps parts out of Decide until the plan is in, and explains each label behind an i', () => {
    const sheet = createGroupSheet({ sprint, challenge });
    const parts = [{ id: 'p1', text: 'Screens', shows: '', how: '', criterion: 'c1', claimed: 0, mine: false, assigned: [] }];
    const row = (state: 'none' | 'in') => [{ key: 'decide' as const, open: true, due_date: '', due_time: '', state, late: false, frozen: false, closed: false, count_in: 0 }];
    sheet.update(base({ parts, phases: row('none') }), 'decide');
    expect(labels(sheet.el)).not.toContain('Parts and who');
    sheet.update(base({ parts, phases: row('in') }), 'decide');
    expect(labels(sheet.el)).toContain('Parts and who');
    const info = sheet.el.querySelector<HTMLButtonElement>('.sprint-info')!;
    const meaning = sheet.el.querySelector<HTMLElement>('.sprint-sheet__meaning')!;
    expect(meaning.hidden).toBe(true);
    info.click();
    expect(info.getAttribute('aria-expanded')).toBe('true');
    expect(meaning.hidden).toBe(false);
    expect(meaning.textContent).toBe('The problem your teacher set for the whole class.');
  });
});
