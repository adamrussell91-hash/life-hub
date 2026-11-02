import { describe, expect, it } from 'vitest';
import { aiReadCount, flowItems, type QuizLoad } from '@/marking/to-mark-items';
import type { ToMarkTask } from '@/marking/to-mark-view';

const base = { class_id: 'c1', class_title: '8 English', lesson_id: 'l1', roster: 2 };
const answer = (initials: string, ai_ready = false) => ({ attempt_id: `a${initials}`, student_id: initials, initials, name: initials, submitted_at: '', response: { text: 'x' }, awarded: null, by: null, ai_ready });
const load: QuizLoad = { lesson_id: 'l1', title: 'Week 5', questions: [
  { id: 'qa', kind: 'short_answer', marks: 1, prompt: 'Name it.', answers: [answer('PQ', true), answer('WA', true)] },
  { id: 'qb', kind: 'extended_response', marks: 4, prompt: 'Explain.', answers: [answer('PQ'), answer('WA', true)] }
] };
const tasks = [
  { ...base, kind: 'quiz', title: 'Week 5', waiting: 4 },
  { ...base, kind: 'voice', title: 'Viva', block_id: 'b1', waiting: 1, ai_ready: 1, rows: [{ id: 't1', initials: 'PQ', has_transcript: true }] },
  { ...base, kind: 'piece', title: 'Paragraph', column_id: 'col1', waiting: 1, rows: [{ student_id: 's1', initials: 'WA' }] },
  { ...base, kind: 'voice', title: 'Finished', block_id: 'b2', waiting: 0, rows: [{ id: 't2', initials: 'PQ' }] }
] as unknown as ToMarkTask[];
const quizzes = new Map([['c1:l1', load]]);

describe('the To mark flow items', () => {
  it('stacks short answers, gives written answers a screen each, and skips finished tasks', () => {
    const items = flowItems(tasks, quizzes);
    expect(items.map((i) => [i.kind, i.who])).toEqual([['quiz', '2'], ['quiz', 'PQ'], ['quiz', 'WA'], ['voice', 'PQ'], ['writing', 'WA']]);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('counts only what the AI has not read yet', () => {
    expect(aiReadCount(tasks, quizzes)).toBe(4);
  });
});
