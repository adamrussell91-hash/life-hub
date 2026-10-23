import { describe, expect, it, vi } from 'vitest';
import { renderPatterns } from '@/markbook/patterns-view';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import type { MarkbookView } from '@/markbook/types';
import { studentPanelBody } from '@/markbook/student-panel';

export const view: MarkbookView = {
  markbook: {
    columns: [{ id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-01', weight: 40, criteria: [{ id: 'c1', label: 'Analysis', max: 20, outcomes: ['o1'], skill: 'reading.inference' }] }],
    hidden_quizzes: [],
    marks: { essay0001: { s1: { criteria: { c1: 10 }, codes: { c1: ['code-e'] } }, s2: { criteria: {}, exempt: true } } },
    focus: {},
    updated_at: ''
  },
  students: [{ id: 's1', name: 'Ada Ash', initials: 'AA' }, { id: 's2', name: 'Bo Birch', initials: 'BB' }],
  quizzes: [
    {
      kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Pre-test', date: '2026-10-20', hidden: false, confidence: true,
      questions: [{ id: 'q1', prompt: 'Name it', marks: 1, outcomes: [] }],
      scores: {
        s1: { attempt_id: 'a~0', submitted_at: '2026-10-20T01:00:00Z', score: 0, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 0, max: 1, confidence: 3, outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: 0, why: [] }] }] },
        s2: { attempt_id: 'b~0', submitted_at: '2026-10-20T01:00:00Z', score: 1, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 1, max: 1, confidence: 1, outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: 1, why: [] }] }] }
      }
    },
    { kind: 'quiz', id: 'quiz:l2', lesson_id: 'l2', title: 'Hidden', date: '2026-10-21', hidden: true, confidence: false, questions: [], scores: {} }
  ]
};

describe('markbookEvidence', () => {
  it('reads quiz items and assessment criteria, skipping hidden quizzes and exempt marks', () => {
    const { evidence, sources } = markbookEvidence(view);
    expect(sources.map((s) => s.title)).toEqual(['Pre-test', 'Essay']);
    expect(evidence.filter((e) => e.source === 'quiz:l1').map((e) => [e.student, e.share, e.confidence])).toEqual([
      ['s1', 0, 3],
      ['s2', 1, 1]
    ]);
    const essay = evidence.filter((e) => e.source === 'assess:essay0001');
    expect(essay).toEqual([
      { item: 'essay0001:c1', tags: ['out:o1', 'skill:reading.inference'], share: 0.5, why: [{ type: 'code', id: 'code-e' }], student: 's1', source: 'assess:essay0001', date: '2026-11-01', confidence: null }
    ]);
  });
});

describe('renderPatterns', () => {
  const ctx = { table: null, outcomes: [], skills: null, codes: [] };
  it('draws the class trend, tag table and heatmap; groups open a student list', () => {
    const openStudent = vi.fn();
    const node = renderPatterns(view, view.students, ctx, { openStudent });
    expect(node.querySelector('.mb-trend')).not.toBeNull();
    expect(node.querySelector('.mb-patterns__tags')?.textContent).toContain('simile');
    const weak = node.querySelector<HTMLButtonElement>('[data-group="weak"]');
    expect(weak).toBeNull(); // one question per student: below the group minimum
    const cell = node.querySelector<HTMLButtonElement>('.mb-patterns__cell[data-student="s1"]');
    expect(cell?.textContent).toBe('0');
    node.querySelector<HTMLButtonElement>('.mb-patterns__name[data-student="s2"]')!.click();
    expect(openStudent).toHaveBeenCalledWith('s2');
  });
});

describe('student panel', () => {
  it('lists focus areas with pin and dismiss, secure tags and confidence', () => {
    const ev = [0, 0.2, 0.4].map((share, i) => ({ item: `q${i}`, tags: ['tech:jux'], share, why: [], student: 's1', source: 'quiz:l1', date: '2026-10-20', confidence: 3 as const }));
    const onPins = vi.fn();
    const node = studentPanelBody({
      student: { id: 's1', name: 'Ada Ash', initials: 'AA' }, evidence: ev, kind: 'tech', label: (t) => t.slice(5), codeLabel: (id) => id,
      pins: { pinned: [], dismissed: [] }, onPins, overall: '64%'
    });
    expect(node.textContent).toContain('Focus areas');
    expect(node.textContent).toContain('jux');
    expect(node.textContent).toContain('Sure but wrong 3 times');
    [...node.querySelectorAll('button')].find((b) => b.textContent === 'Pin')!.click();
    expect(onPins).toHaveBeenCalledWith({ pinned: ['tech:jux'], dismissed: [] });
  });
});
