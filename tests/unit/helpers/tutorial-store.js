// In-memory store + fixtures shared by the tutorial server tests. Invented names only.
import { tutorialKeys } from '../../../netlify/functions/_shared/tutorial-status.mjs';
import { classKey, publishedLessonKey } from '../../../netlify/functions/_shared/teaching-blobs.mjs';

export const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
export const ROSTER = [
  { id: 'st_ann', name: 'Ann Bell', initials: 'AB' },
  { id: 'st_cy', name: 'Cy Dale', initials: 'CD' },
  { id: 'st_ed', name: 'Ed Fox', initials: 'EF' }
];

export function storeFor() {
  const data = new Map([
    [publishedLessonKey('tut1'), { lesson_id: 'tut1', pedagogical_mode: 'tutorial', blocks: [block('h1', 'heading', { text: 'Demo' })] }],
    [classKey('class1'), { id: 'class1', status: 'active', title: '7B', students: ROSTER }],
    [tutorialKeys('tut1').tabs, { version: 'v1', class_id: 'class1', groups: [
      { id: 'ga', goal: 'Today: the effect', students: ['st_ann'], blocks: [block('f1', 'faded_example', {}), block('w1', 'with_teacher', { talking_points: [] }), block('y1', 'self_check', {})] },
      { id: 'gb', goal: 'Today: telling them apart', students: ['st_cy'], blocks: [block('w2', 'with_teacher', { talking_points: [] })] }
    ] }]
  ]);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
