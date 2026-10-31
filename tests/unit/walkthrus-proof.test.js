import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProof, lessonScore, MIN_LESSONS } from '../../packages/walkthrus/proof.mjs';
import { buildProof, createWalkthrusProofHandler, fusionsOf } from '../../netlify/functions/walkthrus-proof.mjs';

// Invented classes, lessons and scores only.
const CC = 'w1-cold-calling';
const QZ = 'w1-quizzing';
const FU = 'fu_abc12345';
const rep = (technique_id, lesson_id, class_id, state = 'ran') => ({ technique_id, lesson_id, class_id, state });
const score = (lesson_id, class_id, s, date) => ({ lesson_id, class_id, score: s, date });

test('ran lessons are compared with the class’s lessons where no WalkThru ran', () => {
  const scores = [
    score('a1', 'c1', 0.8, '2026-10-01'), score('a2', 'c1', 0.7, '2026-10-02'), score('a3', 'c1', 0.9, '2026-10-03'), score('a4', 'c1', 0.6, '2026-10-04'),
    score('b1', 'c1', 0.5, '2026-10-05'), score('b2', 'c1', 0.6, '2026-10-06'), score('b3', 'c1', 0.4, '2026-10-07'), score('b4', 'c1', 0.5, '2026-10-08'),
    // a lesson where only another technique ran: neither "with" nor "without" for Cold Calling
    score('q1', 'c1', 0.1, '2026-10-09'),
    score('p1', 'c1', 0.95, '2026-10-10')
  ];
  const reps = [
    ...['a1', 'a2', 'a3', 'a4'].map((l) => rep(CC, l, 'c1')),
    rep(QZ, 'q1', 'c1'),
    rep(CC, 'p1', 'c1', 'partly'),
    rep(CC, 'b1', 'c1', 'planned'), // planned and skipped count as nothing
    rep(CC, 'b2', 'c1', 'skipped')
  ];
  const rows = computeProof({ scores, reps });
  const cc = rows.find((r) => r.tile_id === CC);
  assert.equal(cc.class_id, 'c1');
  assert.deepEqual([cc.ran.n, cc.ran.mean], [4, 0.75]);
  assert.deepEqual(cc.ran.lessons.map((l) => l.lesson_id), ['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual([cc.partly.n, cc.partly.lessons[0].lesson_id], [1, 'p1']);
  assert.deepEqual([cc.none.n, cc.none.mean], [4, 0.5]);
  assert.equal(cc.diff, 0.25);
  assert.equal(cc.enough, true);
  const qz = rows.find((r) => r.tile_id === QZ);
  assert.deepEqual([qz.ran.n, qz.enough, qz.diff], [1, false, -0.4]);
  // enough first
  assert.equal(rows[0].tile_id, CC);
  assert.equal(MIN_LESSONS, 4);
});

test('classes are kept apart, a classless rep counts for every class, fusions are tiles', () => {
  const scores = [score('l1', 'c1', 0.5), score('l1', 'c2', 0.7), score('l2', 'c2', 0.4)];
  const rows = computeProof({ scores, reps: [rep(FU, 'l1', null)] });
  assert.deepEqual(rows.map((r) => [r.tile_id, r.class_id, r.ran.n, r.none.n]).sort(), [[FU, 'c1', 1, 0], [FU, 'c2', 1, 1]]);
  assert.equal(rows.find((r) => r.class_id === 'c1').diff, null);
  assert.equal(rows.find((r) => r.class_id === 'c2').diff, 0.3);
});

test('ranking: enough rows by difference, largest first, then the rest', () => {
  const scores = [];
  const reps = [];
  for (let i = 0; i < 4; i += 1) {
    scores.push(score(`n${i}`, 'c1', 0.5), score(`x${i}`, 'c1', 0.6), score(`y${i}`, 'c1', 0.9));
    reps.push(rep(QZ, `x${i}`, 'c1'), rep(CC, `y${i}`, 'c1'));
  }
  scores.push(score('z', 'c1', 1));
  reps.push(rep(FU, 'z', 'c1'));
  assert.deepEqual(computeProof({ scores, reps }).map((r) => r.tile_id), [CC, QZ, FU]);
});

test('a lesson score is marks got over marks available, pending and practice rows left out', () => {
  assert.equal(lessonScore([{ rows: [{ awarded: 1, max: 1 }, { awarded: 0, max: 2 }, { awarded: null, max: 3 }] }, { rows: [{ awarded: 2, max: 2 }, { awarded: 5, max: 5, set: 's1' }] }]), 0.6);
  assert.equal(lessonScore([{ rows: [{ awarded: null, max: 2 }] }]), null);
  assert.equal(lessonScore([]), null);
});

test('fusions come from the board document with their steps', () => {
  const out = fusionsOf({ fusions: [{ id: FU, name: 'Call and quiz', parents: [CC, QZ], steps: [{ heading: 'Ask', instruction: 'Ask everyone.' }, { label: 'Pause', text: 'Wait.' }] }, { id: 'nope', name: 'x' }] });
  assert.deepEqual(out, [{ id: FU, name: 'Call and quiz', parents: [CC, QZ], steps: [{ n: 1, label: 'Ask', text: 'Ask everyone.' }, { n: 2, label: 'Pause', text: 'Wait.' }] }]);
  assert.deepEqual(fusionsOf(null), []);
});

function store(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : null; },
    async setJSON(k, v) { map.set(k, structuredClone(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

test('buildProof reads reps and calendar rows, and skips lessons with no quiz', async () => {
  const s = store({
    'scheduled_lessons/r1': { lesson_id: 'l1', class_id: 'c1', date: '2026-10-01' },
    'scheduled_lessons/r2': { lesson_id: 'l2', class_id: 'c1', date: '2026-10-02' },
    'scheduled_lessons/r3': { lesson_id: 'l3', class_id: 'c1', date: '2026-12-01' }, // future: left out
    'walkthru_reps/w1-cold-calling/l1~c1': { technique_id: CC, lesson_id: 'l1', class_id: 'c1', state: 'ran', at: '2026-10-01T05:00:00.000Z' },
    'classes/c1': { id: 'c1', display_name: 'Year 9 Blue' }
  });
  const proof = await buildProof(s, { now: '2026-10-31T00:00:00.000Z', today: '2026-10-31' });
  // no quiz published for either lesson: nothing scored, no rows
  assert.deepEqual([proof.lessons_scored, proof.rows.length], [0, 0]);
  assert.equal(proof.generated_at, '2026-10-31T00:00:00.000Z');

  // with quizzes published, each past pair is scored and named by its class
  s.map.set('quiz/l1/current', { version: 'v1' });
  s.map.set('quiz/l2/current', { version: 'v1' });
  s.map.set('quiz/l3/current', { version: 'v1' });
  const asked = [];
  const scored = await buildProof(s, { now: '2026-10-31T00:00:00.000Z', today: '2026-10-31', scoreLesson: async (_s, lessonId, classId) => { asked.push(`${lessonId}~${classId}`); return lessonId === 'l1' ? 0.8 : 0.6; } });
  assert.deepEqual(asked.sort(), ['l1~c1', 'l2~c1']);
  assert.equal(scored.lessons_scored, 2);
  assert.deepEqual(scored.classes, { c1: 'Year 9 Blue' });
  assert.deepEqual([scored.rows[0].tile_id, scored.rows[0].ran.mean, scored.rows[0].none.mean, scored.rows[0].diff], [CC, 0.8, 0.6, 0.2]);
});

const gateEnv = { GITHUB_TOKEN: 't', LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };

test('the proof endpoint is teacher only, cached, and serves fusions from the professional store', async () => {
  const teaching = store();
  const pro = store({ 'walkthrus_board/v1': { fusions: [{ id: FU, name: 'Call and quiz', parents: [CC, QZ], steps: [{ label: 'Ask', text: 'Ask everyone.' }] }] } });
  let now = '2026-10-31T00:00:00.000Z';
  const make = (valid) => createWalkthrusProofHandler({ env: gateEnv, getContentStore: async () => teaching, getProfessionalStore: async () => pro, verifySessionToken: () => ({ valid }), nowIso: () => now, today: () => '2026-10-31' });
  assert.equal((await make(false)(new Request('https://example.test/api/walkthrus-proof'))).status, 401);
  const first = await make(true)(new Request('https://example.test/api/walkthrus-proof'));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal((await first.json()).data.proof.generated_at, now);
  now = '2026-10-31T00:05:00.000Z';
  assert.equal((await (await make(true)(new Request('https://example.test/api/walkthrus-proof'))).json()).data.proof.generated_at, '2026-10-31T00:00:00.000Z', 'kept ten minutes');
  now = '2026-10-31T00:11:00.000Z';
  assert.equal((await (await make(true)(new Request('https://example.test/api/walkthrus-proof'))).json()).data.proof.generated_at, now);
  const fusions = await make(true)(new Request('https://example.test/api/walkthrus-proof?fusions=1'));
  assert.equal((await fusions.json()).data.fusions[0].steps[0].label, 'Ask');
  assert.equal((await make(true)(new Request('https://example.test/api/walkthrus-proof', { method: 'POST', body: '{}' }))).status, 405);
});
