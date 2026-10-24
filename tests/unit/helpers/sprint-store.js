// tests/unit/helpers/sprint-store.js
// In-memory store and fixture for the sprint server tests. Invented names only.
import { sprintKeys } from '../../../netlify/functions/_shared/sprint-keys.mjs';
import { classKey, publishedLessonKey, draftLessonKey } from '../../../netlify/functions/_shared/teaching-blobs.mjs';

export const ROSTER = [
  { id: 'st_ann', name: 'Ann Bell', initials: 'AB' },
  { id: 'st_cy', name: 'Cy Dale', initials: 'CD' },
  { id: 'st_ed', name: 'Ed Fox', initials: 'EF' },
  { id: 'st_gus', name: 'Gus Hale', initials: 'GH' }
];
const phase = (key, where, due) => ({ key, where, due_date: due, due_time: '15:00', ends_at: '' });
export const CONFIG = () => ({
  version: 'v1',
  class_id: 'class1',
  decider: 'top_vote',
  lock_hours: 2,
  groups: [{ id: 'g1', name: 'Kestrel', students: ['st_ann', 'st_cy'] }, { id: 'g2', name: 'Heron', students: ['st_ed', 'st_gus'] }],
  phases: [phase('understand', 'class', '2026-11-02'), phase('sketch', 'home', '2026-11-04'), phase('decide', 'class', '2026-11-06'), phase('prototype', 'home', '2026-11-10'), phase('test', 'class', '2026-11-12')],
  ideas: { understand: 3, sketch: 3 },
  criteria: ['c1', 'c2'],
  reflection_criteria: ['reflect'],
  requirements: [{ id: 'r1', phases: ['sketch'] }]
});
export const DRAFT = () => ({ id: 'sp1', title: 'Pompeii', pedagogical_mode: 'design_sprint', sprint: { ...CONFIG(), criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }], groups: CONFIG().groups } });

export function storeFor(config = CONFIG()) {
  const data = new Map([
    [publishedLessonKey('sp1'), { lesson_id: 'sp1', pedagogical_mode: 'design_sprint', blocks: [], sprint: { criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }] } }],
    [draftLessonKey('sp1'), DRAFT()],
    [classKey('class1'), { id: 'class1', status: 'active', title: '7B', students: ROSTER }],
    [sprintKeys('sp1').config, config]
  ]);
  const etags = new Map();
  let n = 0;
  const store = {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) ?? 'e0' } : null; },
    async set(key, bytes, opts = {}) { data.set(key, { bytes, metadata: opts.metadata ?? {} }); return { modified: true }; },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfMatch !== undefined && (etags.get(key) ?? (data.has(key) ? 'e0' : undefined)) !== opts.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value));
      etags.set(key, `e${++n}`);
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
  return store;
}

export const tok = (n) => String(n).repeat(48).slice(0, 48);
export const who = (n) => ({ class_id: 'class1', class_token: tok(n) });
/** Device n claims initials; 1 Ann, 2 Cy, 3 Ed, 4 Gus. */
export const INITIALS = { 1: 'AB', 2: 'CD', 3: 'EF', 4: 'GH' };
