import { mountMarkbook } from '@/teacher/sections/markbook';
import '../styles/app.css';

/**
 * Markbook progress preview: both lenses of the Grid with an in-page fake
 * server. Invented class, students and unit only. Open the dev server at
 * /markbook-progress.html; add ?lens=du to open on By deep understanding and
 * ?students=60 to try a wide class. Mobile: use the browser's 390px viewport.
 */

const params = new URLSearchParams(location.search);
const COUNT = Math.max(3, Math.min(80, Number(params.get('students')) || 8));
const CLASS = 'class_demo';
const NAMES = ['Ada Ash', 'Ben Bell', 'Cy Cole', 'Di Dow', 'Eli Egg', 'Fay Fox', 'Gus Gray', 'Hal Hart'];
const students = Array.from({ length: COUNT }, (_, i) => {
  const name = NAMES[i] ?? `Student ${i + 1}`;
  return { id: `st_${i}`, name, initials: NAMES[i] ? name.split(' ').map((w) => w[0]).join('') : `S${i + 1}` };
});

const alignment = {
  id: 'demo', revision: 1,
  outcomes: [{ n: 1, code: 'DEMO-1', text: 'Responds to texts' }],
  concepts: [],
  processes: [],
  focus_areas: [{ id: 'texts', name: 'Texts and meaning', points: [
    { id: 'U1', kind: 'U', short: 'Form carries meaning', text: 'Invented understanding point', outcomes: [{ n: 1, link: 'shared' }], concepts: [], processes: [] },
    { id: 'R2', kind: 'R', short: 'Compose a response', text: 'Invented responding point', outcomes: [{ n: 1, link: 'shared' }], concepts: [], processes: [] }
  ] }]
};
const continuum = { strands: [{ strand: 'write', name: 'Writing', sub_strands: [{ id: 'craft', name: 'Crafting', points: [{ area: 'texts', point: 'R2', link: 'shared' }] }, { id: 'plan', name: 'Planning', points: [{ area: 'texts', point: 'R2', link: 'shared' }] }] }] };

const pieces = [
  { id: 'kp_demo01', text: 'Form can act out an experience', tier: 'essential', dot_point: 'texts:U1' },
  { id: 'kp_demo02', text: 'A short line stops the reader on one image', tier: 'essential', dot_point: 'texts:U1' },
  { id: 'kp_demo03', text: 'Repetition builds a pattern', tier: 'strong' }
];
const deepUnderstanding = { id: 'du_demo01', claim: 'Writers choose a form to make the reader feel what the writer felt.', why: '', dot_points: ['texts:U1', 'texts:R2'], concept_bullets: [], pieces, shared_piece_ids: [], steps: [] };
const unit = { id: 'unit_demo', title: 'Invented unit', status: 'active', kind: 'unit', lesson_ids: ['lesson_demo'], deep_understandings: [deepUnderstanding] };
const lesson = {
  id: 'lesson_demo', title: 'Invented lesson', unit_id: 'unit_demo', dot_points: ['texts:U1'],
  blocks: [{ id: 'blk_task', type: 'block', block_type: 'quiz_question', variant: 'medium', visibility: 'all', content: {}, settings: { deep_step: { du: 'du_demo01', step: '2a' }, deep_targets: ['kp_demo01', 'kp_demo02'] } }]
};

const day = (n: number): string => `2026-10-${String(n).padStart(2, '0')}`;
const items = (student: number): Array<{ item: string; tags: string[]; share: number; why: never[] }> => {
  const tags = (kp: string) => [`kp:${kp}`, 'skill:write.craft'];
  const good = student % 3 !== 2;
  return [
    { item: 'q1', tags: tags('kp_demo01'), share: good ? 1 : 0, why: [] },
    { item: 'q2', tags: tags('kp_demo02'), share: student % 2 ? 1 : 0.5, why: [] },
    { item: 'blk_task', tags: ['kp:kp_demo03', 'skill:write.plan'], share: student % 4 === 0 ? 1 : 0.5, why: [] }
  ];
};
const quiz = (n: string, date: string) => ({
  kind: 'quiz', id: 'quiz:lesson_demo', lesson_id: 'lesson_demo', title: `Check ${n}`, date, hidden: false, confidence: false, questions: [],
  scores: Object.fromEntries(students.map((s, i) => [s.id, { attempt_id: `a${i}`, submitted_at: `${date}T01:00:00Z`, score: 2, max: 3, pending: 0, rows: [{ id: 'r', awarded: 1, max: 1, confidence: null, codes: [], outcomes: [], items: items(i) }] }]))
});
const view = {
  markbook: { columns: [], hidden_quizzes: [], marks: {}, focus: {}, took: {}, groups: [], history: [], updated_at: '' },
  students: students.map((s) => ({ ...s, removed: false })),
  quizzes: [quiz('1', day(1))]
};

const ok = (body: unknown): Response => new Response(JSON.stringify({ ok: true, data: body }), { status: 200, headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href).pathname;
  if (!path.startsWith('/api/')) return realFetch(input, init);
  if (path === '/api/syllabus-alignment') return ok({ alignment });
  if (path === '/api/skills-continuum') return ok({ continuum });
  if (path === '/api/feedback-codes') return ok({ codes: [] });
  if (path === '/api/to-mark') return ok({ tasks: [] });
  if (path === '/api/lessons/lesson_demo') return ok(lesson);
  if (path === `/api/classes/${CLASS}/deep`) return ok({ steps: { st_1: { du_demo01: { step: '2a', at: '2026-10-05' } } }, writing: {} });
  if (path === `/api/classes/${CLASS}/markbook`) return ok(view);
  return ok({});
};

const cls = { id: CLASS, type: 'class', title: 'Demo class', code: 'DEMO', display_name: 'Demo class', active_unit_ids: ['unit_demo'], current_unit_id: 'unit_demo', students: [] };
mountMarkbook(document.getElementById('mount')!, cls as never, {
  deepUnits: [unit as never],
  currentUnitId: 'unit_demo',
  lens: params.get('lens') === 'du' ? 'du' : 'point',
  scheduled: [{ id: 'sched_demo', class_id: CLASS, unit_id: 'unit_demo', lesson_id: 'lesson_demo', date: '2026-10-01' } as never]
});
