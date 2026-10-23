import { describe, expect, it, vi } from 'vitest';
import { renderQuizInsight } from '@/evidence/views/quiz-insight';
import type { InsightPayload } from '@/evidence/types';

const row = (id: string, awarded: number, confidence: 1 | 2 | 3 | null, tags: string[], why: InsightPayload['attempts'][number]['rows'][number]['items'][number]['why'] = []) =>
  ({ id, awarded, max: 1, confidence, codes: [], outcomes: [], items: [{ item: id, tags, share: awarded, why }] });
const attempt = (student: string, rows: ReturnType<typeof row>[]) => ({
  student, attempt_id: `${student}~0`, submitted_at: '2026-10-20T01:00:00Z', score: rows.reduce((s, r) => s + r.awarded, 0), max: rows.length, pending: 0, rows
});
const payload: InsightPayload = {
  lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', record_version: 'v1', class_id: 'c1', closed: false, closed_by: null, built_at: '', saved: false, confidence: true,
  students: [{ id: 's1', name: 'Ada Ash', initials: 'AA' }, { id: 's2', name: 'Bo Birch', initials: 'BB' }, { id: 's3', name: 'Cy Cole', initials: 'CC' }],
  questions: [{ id: 'q1', prompt: 'Spot it', marks: 1, kind: 'quote_technique', outcomes: [] }, { id: 'q2', prompt: 'Name it', marks: 1, kind: 'quote_technique', outcomes: [] }],
  attempts: [
    attempt('s1', [row('q1', 0, 3, ['tech:~juxtaposition', 'out:X'], [{ type: 'named', as: 'tech:~contrast', target: 'tech:~juxtaposition' }]), row('q2', 0, 3, ['tech:~juxtaposition', 'out:X'])]),
    attempt('s2', [row('q1', 0, 3, ['tech:~juxtaposition', 'out:X'], [{ type: 'named', as: 'tech:~contrast', target: 'tech:~juxtaposition' }]), row('q2', 1, 2, ['tech:~juxtaposition', 'out:X'])]),
    attempt('s3', [row('q1', 1, 1, ['tech:~juxtaposition', 'out:X']), row('q2', 1, 1, ['tech:~juxtaposition', 'out:X'])])
  ],
  compare_with: null, follow_up_of: null, follow_up_flag: null, for_students: [], dismissed: [], follow_ups: [], siblings: []
};
const ctx = { table: null, outcomes: [], skills: null, codes: [] };

describe('renderQuizInsight', () => {
  it('shows the summary, tags, flags and mix-ups for the default (technique) grouping', () => {
    const node = renderQuizInsight(payload, { ctx, onDismiss: vi.fn(), openLesson: vi.fn() });
    expect(node.textContent).toContain('3/3');
    expect(node.textContent).toContain('Juxtaposition');
    expect(node.textContent).toContain('Sure but wrong on Juxtaposition · AA, BB');
    expect(node.textContent).toContain('Juxtaposition named as Contrast · 2');
  });
  it('switches grouping', () => {
    const node = renderQuizInsight(payload, { ctx, onDismiss: vi.fn(), openLesson: vi.fn() });
    [...node.querySelectorAll<HTMLButtonElement>('.ev-switch__pill')].find((b) => b.textContent === 'Outcome')!.click();
    expect(node.querySelector('.ev-tag__name')?.textContent).toBe('X');
  });
  it('hides dismissed flags and offers Close now while open', () => {
    const onClose = vi.fn();
    const node = renderQuizInsight({ ...payload, dismissed: ['sure_wrong:tech:~juxtaposition'] }, { ctx, onDismiss: vi.fn(), openLesson: vi.fn(), onClose });
    expect(node.textContent).not.toContain('Sure but wrong on');
    [...node.querySelectorAll('button')].find((b) => b.textContent === 'Close now')!.click();
    expect(onClose).toHaveBeenCalled();
  });
  it('links back to the quiz being followed up', () => {
    const openLesson = vi.fn();
    const node = renderQuizInsight({ ...payload, follow_up_of: 'l0', siblings: [{ lesson_id: 'l0', title: 'Earlier quiz' }] }, { ctx, onDismiss: vi.fn(), openLesson });
    [...node.querySelectorAll('button')].find((b) => b.textContent === 'Following up: Earlier quiz')!.click();
    expect(openLesson).toHaveBeenCalledWith('l0');
  });
});
