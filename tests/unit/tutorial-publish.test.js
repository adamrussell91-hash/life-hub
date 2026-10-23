import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
import { prepareTutorialPublish } from '../../netlify/functions/_shared/tutorial.mjs';

const block = (id, block_type, content = {}, visibility = 'student_teacher') => ({ id, type: 'block', block_type, variant: 'medium', visibility, content });
const mc = (id) => block(id, 'quiz_question', { question: { id, kind: 'multiple_choice', prompt: `Q ${id}`, marks: 1, options: [{ id: 'a', text: 'Right' }, { id: 'b', text: 'Wrong' }], correct: ['a'] } });
const draft = {
  id: 'tut1', pedagogical_mode: 'tutorial',
  tutorial: { class_id: 'class1', groups: [
    { id: 'ga', name: 'Re-tells', why: 'x', goal: 'Today: the effect', gap_type: 'knowledge', students: ['st_ann'], evidence: [{ student: 'st_ann', quote: 'q' }] },
    { id: 'gb', name: 'Mix-up', why: 'y', goal: 'Today: telling them apart', gap_type: 'mix_up', students: ['st_cy'], evidence: [] }
  ] }
};
const blocks = [
  block('h1', 'heading', { text: 'Demo' }),
  block('tA', 'section', { title: 'Re-tells', tutorial_group: 'ga', blocks: [block('f1', 'faded_example', { prompt: 'p', extract: 'e', parts: [{ label: 'Effect', answer: 'a' }], blanks: [0] }), block('w1', 'with_teacher', { talking_points: ['Secret point'] })] }),
  block('eA', 'section', { title: 'Exit', tutorial_group: 'ga', tutorial_exit: true, blocks: [mc('qa1')] }),
  block('tB', 'section', { title: 'Mix-up', tutorial_group: 'gb', blocks: [block('w2', 'with_teacher', { talking_points: [] })] }),
  block('eB', 'section', { title: 'Exit', tutorial_group: 'gb', tutorial_exit: true, blocks: [mc('qb1'), mc('qb2')] })
];

test('Common goes public; tabs go to the server; exit questions become a narrowed quiz', () => {
  const out = prepareTutorialPublish(draft, blocks);
  assert.deepEqual(out.problems, []);
  assert.deepEqual(out.common.map((b) => b.id), ['h1']);
  assert.deepEqual(out.tabs.groups.map((g) => [g.id, g.goal, g.students]), [['ga', 'Today: the effect', ['st_ann']], ['gb', 'Today: telling them apart', ['st_cy']]]);
  // No teacher words reach students: talking points, names, whys and evidence stay out.
  const shipped = JSON.stringify(out.tabs);
  assert.ok(!shipped.includes('Secret point'));
  assert.ok(!shipped.includes('Re-tells'));
  assert.ok(!shipped.includes('evidence'));
  assert.deepEqual(out.quiz.record.groups, { st_ann: ['qa1'], st_cy: ['qb1', 'qb2'] });
  assert.deepEqual(out.quiz.record.settings.for_students, ['st_ann', 'st_cy']);
  assert.equal(out.quiz.snapshot.question_count, 3);
  // Answers never ship in the stored tabs or the Common blocks.
  assert.ok(!JSON.stringify(out.common).includes('correct'));
});

test('a problem with an exit question is reported', () => {
  const broken = blocks.map((b) => (b.id === 'eA' ? { ...b, content: { ...b.content, blocks: [block('qa1', 'quiz_question', { question: { id: 'qa1', kind: 'multiple_choice', prompt: '', marks: 1, options: [], correct: [] } })] } } : b));
  assert.equal(prepareTutorialPublish(draft, broken).problems.length, 1);
});

test('stray questions and talking points never ship, however deep', () => {
  const stray = mc('stray');
  const deep = block('c1', 'columns', { columns: [{ blocks: [block('w3', 'with_teacher', { talking_points: ['Deep secret'] }), mc('stray2')] }] });
  const messy = [
    block('h1', 'heading', { text: 'Demo' }), stray, block('w0', 'with_teacher', { talking_points: ['Common secret'] }),
    block('tA', 'section', { title: 'T', tutorial_group: 'ga', blocks: [deep, mc('stray3')] }),
    block('tA2', 'section', { title: 'Dup', tutorial_group: 'ga', blocks: [block('dup', 'heading', { text: 'dup' })] }),
    block('eA', 'section', { title: 'Exit', tutorial_group: 'ga', tutorial_exit: true, blocks: [block('s', 'section', { blocks: [mc('qa1')] })] })
  ];
  const d = { ...draft, tutorial: { ...draft.tutorial, groups: [draft.tutorial.groups[0], { id: 'gx', goal: 'g' }] } };
  const out = prepareTutorialPublish(d, messy);
  const shipped = JSON.stringify([out.common, out.tabs]);
  assert.ok(!shipped.includes('correct'));
  assert.ok(!shipped.includes('secret'));
  assert.ok(!shipped.includes('stray'));
  assert.ok(!shipped.includes('"dup"'));
  assert.ok(shipped.includes('w3') && shipped.includes('w0'));
  assert.deepEqual(out.quiz.record.groups, { st_ann: ['qa1'] });
  assert.deepEqual(out.tabs.groups[1].students, []);
});

/* ── Through the publish handler ─────────────────────────────────── */

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
const session = createSessionToken({ now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async get(key, options = {}) { const v = map.get(key); return v == null ? null : v; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async set(key, value) { map.set(key, typeof value === 'string' ? JSON.parse(value) : value); },
    async delete(key) { map.delete(key); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    snapshot() { return Object.fromEntries(map); }
  };
}

test('publishing a tutorial draft stores Common publicly, tabs and the exit key apart', async () => {
  const stamp = '2026-08-01T00:00:00.000Z';
  const full = (b) => ({ layout: {}, print: {}, settings: {}, created_at: stamp, updated_at: stamp, schema_version: 1, ...b });
  const store = memoryStore({
    'lessons/tut1': {
      id: 'tut1', type: 'lesson', title: 'Structure tutorial', unit_id: 'unit_1', pedagogical_mode: 'tutorial', tutorial: draft.tutorial,
      blocks: blocks.map(full), created_at: stamp, updated_at: stamp, schema_version: 1
    }
  });
  const handler = createLessonPublishHandler({ env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store });
  const response = await handler(new Request('https://api.adam-russell.com/api/lessons/tut1/publish', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com', 'content-type': 'application/json' },
    body: JSON.stringify({})
  }));
  assert.equal(response.status, 200);
  const data = store.snapshot();
  const published = data['published/lessons/tut1'];
  assert.equal(published.pedagogical_mode, 'tutorial');
  assert.deepEqual(published.blocks.map((b) => b.id), ['h1']);
  assert.ok(!JSON.stringify(published).includes('Secret point'));
  assert.equal(data['tutorial/tut1/tabs'].groups.length, 2);
  assert.ok(!JSON.stringify(data['tutorial/tut1/tabs']).includes('Secret point'));
  const keyNames = Object.keys(data).filter((k) => k.startsWith('quiz/tut1/'));
  assert.ok(keyNames.length >= 2, `quiz key stored: ${keyNames}`);
  const current = data['quiz/tut1/current'];
  assert.ok(current?.version);
  const record = Object.entries(data).find(([k]) => k.startsWith('quiz/tut1/') && k !== 'quiz/tut1/current')[1];
  assert.equal(record.version, current.version);
  assert.deepEqual(record.groups, { st_ann: ['qa1'], st_cy: ['qb1', 'qb2'] });
});
