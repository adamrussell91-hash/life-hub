// In-memory store + fixtures shared by the lab server tests. An invented class of 17 in eight pairs; invented writing only.
import { classKey, draftLessonKey, publishedLessonKey } from '../../../netlify/functions/_shared/teaching-blobs.mjs';
import { prepareLabPublish } from '../../../netlify/functions/_shared/lab.mjs';
import { labKeys } from '../../../netlify/functions/_shared/lab-keys.mjs';

const NAMES = [
  'Kit Tran', 'Rae Voss', 'Jo Marsh', 'Abe Stone', 'Bea Nash', 'Cal Drew', 'Dee Frost', 'Eli Gant', 'Fay Hale',
  'Gus Ives', 'Hal Juno', 'Ida Kemp', 'Lou Mead', 'Mia Nord', 'Ned Oake', 'Pia Quill', 'Sol Reed'
];
const initialsOf = (name) => name.split(' ').map((w) => w[0]).join('');
export const ROSTER = NAMES.map((name, i) => ({ id: `st_${String(i + 1).padStart(2, '0')}`, name, initials: initialsOf(name) }));
/** Eight pairs: seven twos and one three. */
export const PAIRS = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, students: ROSTER.slice(i * 2, i === 7 ? 17 : i * 2 + 2).map((s) => s.id) }));

export const SUPPLIED = {
  class_id: 'class1', level: 'supplied', question: 'Does the passive voice shrink the blame?',
  why: 'Your essay will claim that voice shapes blame. Today you find out how much.',
  same: 'The events, their order and the length of the paragraph.', options: ['Active', 'Passive'],
  texts: [
    'For three years the company dumped waste upstream of the town. Its managers ignored two written warnings.',
    'For three years waste was dumped upstream of the town. Two written warnings were ignored.'
  ],
  judge: 'rate', judge_question: 'How much is the company to blame?', ends: ['A little', 'Completely'], threshold: 1, notes_on: false,
  debrief: 'The passive removes the doer. Ask who is missing from each sentence.', explain_prompt: ''
};
export const STUDENTS = {
  class_id: 'class1', level: 'students', question: 'Which sense makes a storm feel most real?', why: '', same: 'The moment the storm hits the house.',
  options: ['Sight', 'Sound', 'Touch'], task: 'Two or three sentences.', judge: 'pick', judge_question: 'Which one feels most real?', threshold: 8, notes_on: false,
  debrief: '', explain_prompt: ''
};
export const PAIRS_LAB = {
  class_id: 'class1', level: 'pairs', question: 'What makes this speaker sound hesitant?', claim: 'The line breaks create the hesitation.', why: '',
  control: 'I meant to tell you\nbut the words, I think,\nwere somewhere else.', judge: 'rate', judge_question: 'How hesitant does the speaker sound?',
  ends: ['Not at all', 'Completely'], threshold: 1, notes_on: true, features: [{ name: 'Line break (enjambment)', level: 'Form' }], pairs: PAIRS, debrief: '', explain_prompt: ''
};

export function memoryStore(entries = []) {
  const data = new Map(entries);
  const etags = new Map();
  let n = 0;
  const store = {
    data,
    writes: [],
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) ?? 'e0' } : null; },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false };
      if (opts.onlyIfMatch !== undefined && (etags.get(key) ?? (data.has(key) ? 'e0' : undefined)) !== opts.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value));
      etags.set(key, `e${++n}`);
      store.writes.push(key);
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
  return store;
}

/** A published lab for class1, as publish leaves it: draft, snapshot and config. */
export function labStore(settings = SUPPLIED, lessonId = 'lab1') {
  const stamp = '2026-11-19T00:00:00.000Z';
  const draft = { id: lessonId, type: 'lesson', title: 'Lab', unit_id: 'unit1', pedagogical_mode: 'lab', lab: settings, blocks: [], status: 'active', created_at: stamp, updated_at: stamp, schema_version: 1 };
  const lab = prepareLabPublish(draft);
  if (lab.problems.length) throw new Error(`fixture lab can't publish: ${lab.problems[0]}`);
  return memoryStore([
    [classKey('class1'), { id: 'class1', type: 'class', status: 'active', title: '9 English', students: ROSTER }],
    [classKey('class2'), { id: 'class2', type: 'class', status: 'active', title: '9 English B', students: [{ id: 'st_x1', name: 'Una Wren', initials: 'UW' }] }],
    [draftLessonKey(lessonId), { ...draft, blocks: lab.draftBlocks, published_at: stamp }],
    [publishedLessonKey(lessonId), { lesson_id: lessonId, title: 'Lab', unit_id: 'unit1', blocks: lab.blocks, published_at: stamp, schema_version: 1, pedagogical_mode: 'lab', lab: lab.snapshot }],
    [labKeys(lessonId).config, lab.config]
  ]);
}

/** What student `i`'s device sends with every call. */
export const device = (i, classId = 'class1') => ({ class_id: classId, class_token: (i + 1).toString(16).padStart(2, '0').repeat(24) });
