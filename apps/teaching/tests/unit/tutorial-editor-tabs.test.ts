// apps/teaching/tests/unit/tutorial-editor-tabs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTutorialTabs, inTab, movedGroups } from '@/tutorial/editor-tabs';
import type { Block } from '@/schemas/block';
import type { TutorialSettings } from '@/tutorial/schema';
import type { TutorialSummary } from '@/tutorial/api';

const s = (id: string, extra: Record<string, unknown>) => ({ id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: id, blocks: [], ...extra } }) as Block;
const h = { id: 'h1', type: 'block', block_type: 'heading', variant: 'medium', visibility: 'student_teacher', content: { text: 'Demo' } } as Block;
const group = (id: string, name: string, students: string[] = []) => ({ id, name, why: '', goal: '', gap_type: 'knowledge' as const, students, evidence: [] });
const lesson = { blocks: [h, s('tA', { tutorial_group: 'ga' }), s('eA', { tutorial_group: 'ga', tutorial_exit: true })], tutorial: { class_id: 'c', groups: [group('ga', 'Re-tells')] } };

describe('tutorial editor tabs', () => {
  it('says which top-level blocks belong to a tab', () => {
    expect(inTab(h, 'common')).toBe(true);
    expect(inTab(lesson.blocks[1]!, 'common')).toBe(false);
    expect(inTab(lesson.blocks[1]!, 'ga')).toBe(true);
    expect(inTab(lesson.blocks[2]!, 'ga')).toBe(true);
    expect(inTab(lesson.blocks[1]!, 'all')).toBe(true);
    expect(inTab(h, 'ga')).toBe(false);
  });

  it('draws Common, one tab per group and All, and reports the choice', () => {
    const onTab = vi.fn();
    const tabs = createTutorialTabs({ getLesson: () => lesson, onTab });
    const labels = [...tabs.root.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(['Common', 'Re-tells', 'All']);
    expect(tabs.root.classList.contains('hub-pills')).toBe(true);
    (tabs.root.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(onTab).toHaveBeenCalledWith('ga');
    expect(tabs.current()).toBe('ga');
    const pressed = [...tabs.root.querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['false', 'true', 'false']);
    expect(tabs.root.querySelectorAll('button')[1]!.classList.contains('is-active')).toBe(true);
  });

  it('repaint picks up a renamed group, and falls back to Common when the open group is gone', () => {
    const live = { tutorial: { class_id: 'c', groups: [group('ga', 'Re-tells'), group('gb', 'Mix-up')] } as TutorialSettings };
    const onTab = vi.fn();
    const tabs = createTutorialTabs({ getLesson: () => live, onTab });
    (tabs.root.querySelectorAll('button')[2] as HTMLButtonElement).click();
    expect(tabs.current()).toBe('gb');
    live.tutorial = { ...live.tutorial, groups: [group('ga', 'Retells the plot')] };
    tabs.repaint();
    expect([...tabs.root.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Common', 'Retells the plot', 'All']);
    expect(tabs.current()).toBe('common');
    expect(onTab).toHaveBeenLastCalledWith('common');
  });
});

describe('movedGroups', () => {
  it('takes each group’s students from the board summary and keeps the rest of the group', () => {
    const settings: TutorialSettings = { class_id: 'c', groups: [{ ...group('ga', 'A', ['st_ann', 'st_ed']), evidence: [{ student: 'st_ann', quote: 'q' }] }, group('gb', 'B', ['st_cy'])] };
    const summary = {
      seen: 0,
      total: 2,
      groups: [
        { id: 'ga', students: [{ id: 'st_ann' }] },
        { id: 'gb', students: [{ id: 'st_cy' }, { id: 'st_ed' }] }
      ]
    } as unknown as TutorialSummary;
    const next = movedGroups(settings, summary);
    expect(next.groups.map((g) => g.students)).toEqual([['st_ann'], ['st_cy', 'st_ed']]);
    expect(next.groups[0]!.evidence).toEqual([{ student: 'st_ann', quote: 'q' }]);
    expect(next.class_id).toBe('c');
  });

  it('leaves a group the summary doesn’t mention as it was', () => {
    const settings: TutorialSettings = { class_id: 'c', groups: [group('ga', 'A', ['st_ann'])] };
    const next = movedGroups(settings, { seen: 0, total: 0, groups: [] });
    expect(next.groups[0]!.students).toEqual(['st_ann']);
  });
});
