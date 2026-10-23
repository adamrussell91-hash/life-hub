// apps/teaching/tests/unit/tutorial-plan-sheet.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest';
import { openTutorialPlan, type TutorialPlanOptions } from '@/tutorial/plan-sheet';
import type { Evidence } from '@/evidence/types';

const ev = (student: string): Evidence => ({ item: 'q1', tags: ['tech:cyc'], share: 0, why: [{ type: 'not_found', target: 'cyclical' }], student, source: 'quiz1', date: '2026-10-20', confidence: null });
const students = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }, { id: 'st_ed', name: 'Ed Fox', initials: 'EF' }];
const flush = () => new Promise((r) => setTimeout(r, 0));
const reply = JSON.stringify({
  groups: [
    { name: 'Can’t find it', why: 'w', goal: 'Today: finding it', gap_type: 'knowledge', members: ['S1', 'S2'], quotes: { S1: 'Missed the return' }, notes: 'Target the return. Model S1 finding it.' },
    { name: 'Names it wrong', why: 'w2', goal: 'Today: naming it', gap_type: 'mix_up', members: ['S3'], quotes: {} }
  ]
});

function open(over: Partial<TutorialPlanOptions> = {}) {
  const group = vi.fn(async (_brief: string) => reply);
  const start = vi.fn(async () => 'tut1');
  const onDone = vi.fn();
  const sheet = openTutorialPlan({
    classId: 'class1', unitId: 'u1', sourceLessonId: 'quiz1', tag: 'tech:cyc', tagLabel: 'Cyclical structure',
    students, chosen: ['st_ann', 'st_cy', 'st_ed'], evidence: [ev('st_ann'), ev('st_cy'), ev('st_ed')], mistakeText: () => 'missed it',
    onDone, deps: { group, start }, ...over
  });
  return { sheet, group, start, onDone };
}

afterEach(() => document.body.replaceChildren());

describe('Plan a tutorial', () => {
  it('confirms, groups, lets the teacher move a student, then creates the tutorial', async () => {
    const { sheet, group, start, onDone } = open();
    expect(sheet.textContent).toContain('What Ann is told (no names)');
    expect(sheet.textContent).toContain('Cost: about 5 cents — one short call. Ann groups them and notes what each group needs; you build the tutorial.');
    expect(sheet.querySelector('.ev-plan__brief')?.textContent).not.toMatch(/Ann Bell|st_ann/);
    expect(sheet.querySelector('select')).toBeNull();
    (sheet.querySelector('.tut-plan__group-btn') as HTMLButtonElement).click();
    await flush();
    expect(group.mock.calls[0]![0]).not.toContain('st_ann');
    const host = sheet.querySelector('.tut-plan__groups')!;
    expect(host.textContent).toContain('Missed the return');
    expect(host.textContent).toContain('AB');
    expect((host.querySelector('.tut-plan__notes') as HTMLTextAreaElement).value).toBe('Target the return. Model finding it.');
    expect(sheet.querySelector('select')).toBeNull();
    // Move Cy into the second group with its pill.
    const cy = [...host.querySelectorAll<HTMLElement>('.tut-plan__student')].find((n) => n.textContent?.includes('CD'))!;
    const pills = cy.querySelector('.hub-pills.hub-pills--loose')!;
    [...pills.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find((b) => b.textContent === 'Names it wrong')!.click();
    (sheet.querySelector('.tut-plan__draft') as HTMLButtonElement).click();
    await flush();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      classId: 'class1', unitId: 'u1', afterLessonId: 'quiz1', tag: 'tech:cyc',
      groups: [expect.objectContaining({ students: ['st_ann'], notes: 'Target the return. Model finding it.' }), expect.objectContaining({ students: ['st_ed', 'st_cy'] })]
    }));
    expect(onDone).toHaveBeenCalledWith('tut1');
  });

  it('renames a group and leaves a student out', async () => {
    const { sheet, start } = open();
    (sheet.querySelector('.tut-plan__group-btn') as HTMLButtonElement).click();
    await flush();
    const name = sheet.querySelector<HTMLInputElement>('.tut-plan__name')!;
    name.value = 'Finds the return';
    name.dispatchEvent(new Event('input'));
    const ed = [...sheet.querySelectorAll<HTMLElement>('.tut-plan__student')].find((n) => n.textContent?.includes('EF'))!;
    [...ed.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find((b) => b.textContent === 'Leave out')!.click();
    expect(sheet.textContent).not.toContain('Names it wrong');
    (sheet.querySelector('.tut-plan__draft') as HTMLButtonElement).click();
    await flush();
    const groups = (start.mock.calls[0] as unknown as [{ groups: Array<{ name: string; students: string[] }> }])[0].groups;
    expect(groups.map((g) => [g.name, g.students])).toEqual([['Finds the return', ['st_ann', 'st_cy']]]);
  });

  it('keeps student names out of what Ann is told', () => {
    const { sheet } = open({ mistakeText: () => 'Picked “Cy Dale was right”, as AB said' });
    const brief = sheet.querySelector('.ev-plan__brief')!.textContent!;
    expect(brief).toContain('Picked “[name] was right”, as [name] said');
    expect(brief).not.toMatch(/\bCy\b|Dale|\bAB\b/);
  });

  it('shows Ann’s error and lets the teacher try again', async () => {
    const group = vi.fn(async () => 'nonsense');
    const { sheet } = open({ deps: { group, start: vi.fn() } });
    const btn = sheet.querySelector('.tut-plan__group-btn') as HTMLButtonElement;
    btn.click();
    await flush();
    expect(sheet.querySelector('.mb-form__error')?.textContent).toContain('unreadable');
    expect(btn.disabled).toBe(false);
    expect((sheet.querySelector('.tut-plan__draft') as HTMLButtonElement).hidden).toBe(true);
  });
});
