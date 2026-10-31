import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionById, isSafeSvg, normalizeFusions, parentCodes } from '../../packages/walkthrus/fusions.mjs';
import { inkCount, renderScene, validateScene } from '../../packages/walkthrus/draw/scene.mjs';
import { SCENE_EXAMPLES } from '../../packages/walkthrus/draw/examples.mjs';
import { figures as qf } from '../../packages/walkthrus/draw/hex/qf.mjs';
import { figures as br } from '../../packages/walkthrus/draw/hex/br.mjs';
import { figures as cp } from '../../packages/walkthrus/draw/hex/cp.mjs';
import { figures as mb } from '../../packages/walkthrus/draw/hex/mb.mjs';
import { createWalkthrusFusionHandler, drawPrompt, parseScene } from '../../netlify/functions/walkthrus-fusion.mjs';

const A = 'w1-cold-calling';
const B = 'w1-say-it-again-better';
const step = (n, over = {}) => ({ label: `Invented step ${n}`, text: `Made-up instruction ${n}.`, from: { id: A, n }, edited: false, loop_to: null, ...over });
const fusion = (over = {}) => ({
  id: 'fu_abc123', name: 'Call and polish', parents: [A, B], cluster_id: 'cl_talk', why: 'One routine, not two.',
  steps: [step(1), step(2, { from: { id: B, n: 1 }, edited: true }), { label: 'My own', text: 'A step I wrote.', from: null, edited: false, loop_to: 1 }],
  drawing: { status: 'none' }, created_at: '2026-10-31T01:00:00.000Z', ...over
});

test('normalizeFusions keeps good fusions and drops junk', () => {
  const [f] = normalizeFusions([fusion()]);
  assert.equal(f.name, 'Call and polish');
  assert.deepEqual(f.parents, [A, B]);
  assert.equal(f.steps.length, 3);
  assert.deepEqual(f.steps[1].from, { id: B, n: 1 });
  assert.equal(f.steps[1].edited, true);
  assert.equal(f.steps[2].loop_to, 1);
  assert.deepEqual(f.drawing, { status: 'none', scene: null, svg: null, note: null, at: null });
  const junk = [
    null, 'x', fusion({ id: 'nope' }), fusion({ name: '  ' }), fusion({ parents: [A] }), fusion({ parents: [A, A] }),
    fusion({ parents: [A, B, 'w1-quizzing', 'w1-dual-coding'] }), fusion({ parents: [A, 'w1-made-up'] }), fusion({ steps: [] })
  ];
  assert.deepEqual(normalizeFusions(junk), []);
  // one per id, max 60
  assert.equal(normalizeFusions([fusion(), fusion({ name: 'Twin' })]).length, 1);
  assert.equal(normalizeFusions(Array.from({ length: 70 }, (_, i) => fusion({ id: `fu_x${String(i).padStart(6, '0')}` }))).length, 60);
});

test('normalizeFusions trims and clamps fields', () => {
  const [f] = normalizeFusions([fusion({
    name: 'N'.repeat(80), why: 'W'.repeat(200), cluster_id: 'Bad Cluster',
    steps: [...Array.from({ length: 12 }, (_, i) => step((i % 9) + 1, { loop_to: 40, from: { id: 'w1-quizzing', n: 1 }, edited: true }))]
  })]);
  assert.equal(f.name.length, 60);
  assert.equal(f.why.length, 140);
  assert.equal(f.cluster_id, null);
  assert.equal(f.steps.length, 9);
  assert.equal(f.steps[0].from, null, 'a step can only come from a parent');
  assert.equal(f.steps[0].edited, false);
  assert.equal(f.steps[0].loop_to, null);
  const self = normalizeFusions([fusion({ steps: [step(1, { loop_to: 1 }), step(2, { loop_to: 1 })] })])[0];
  assert.deepEqual(self.steps.map((s) => s.loop_to), [null, 1], 'a step never loops to itself');
});

test('drawings keep only safe SVG', () => {
  const svg = renderScene(SCENE_EXAMPLES[A]);
  const ok = normalizeFusions([fusion({ drawing: { status: 'drawn', scene: SCENE_EXAMPLES[A], svg, note: 'more room', at: '2026-10-31T02:00:00.000Z' } })])[0];
  assert.equal(ok.drawing.status, 'drawn');
  assert.equal(ok.drawing.svg, svg);
  for (const bad of ['<svg><script>x</script></svg>', '<svg onload="x()"></svg>', '<svg><a href="https://x.test">x</a></svg>', '<svg><image href="x.png"/></svg>', '<div></div>', `<svg>${'x'.repeat(41000)}</svg>`]) {
    assert.equal(isSafeSvg(bad), false, bad.slice(0, 30));
    assert.equal(normalizeFusions([fusion({ drawing: { status: 'drawn', svg: bad } })])[0].drawing.status, 'none');
  }
  assert.equal(normalizeFusions([fusion({ drawing: { status: 'failed', note: 'x', at: 'not a date' } })])[0].drawing.at, null);
});

test('fusionById and parentCodes', () => {
  const list = normalizeFusions([fusion()]);
  assert.equal(fusionById(list, 'fu_abc123')?.name, 'Call and polish');
  assert.equal(fusionById(list, 'fu_zzzzzz'), null);
  assert.deepEqual(parentCodes(list[0]), ['90', '98']);
});

test('hand-converted scenes validate and render exactly like their JavaScript originals', () => {
  const js = { ...qf, ...br, ...cp, ...mb };
  for (const [id, scene] of Object.entries(SCENE_EXAMPLES)) {
    assert.deepEqual(validateScene(scene), { ok: true, errors: [] }, id);
    assert.equal(renderScene(scene), js[id], id);
  }
});

test('validateScene enforces the house rules', () => {
  const good = SCENE_EXAMPLES[A];
  const errs = (scene) => validateScene(scene).errors.join(' | ');
  assert.match(errs([...good, { fn: 'eval', args: ['x'] }]), /unknown part/);
  assert.match(errs([...good, { fn: 'disc', args: [10, 10, 4, 'red'] }]), /argument 4/);
  assert.match(errs([...good, { fn: 'disc', args: [10, 10, Infinity] }]), /argument 3/);
  assert.match(errs([...good, { fn: 'stroke', args: ['M0 0 L10 10"/><script>'] }]), /argument 1/);
  assert.match(errs([...good, { fn: 'talk', args: [10, 10, 20, 12, [5, 30], { text: 'Hello' }] }]), /option "text"/);
  assert.match(errs([...good, { fn: 'person', args: [20, 88, { s: 0.6, onclick: 1 }] }]), /unknown option/);
  assert.match(errs([...good, { fn: 'person', args: [20, 88, { s: 0.6, arms: [[[0, 0], [0, 0]]] }] }]), /option "arms"/);
  assert.match(errs([...good, { fn: 'board', args: [100, 10, 60, 20] }]), /outside the 120 × 90 frame/);
  assert.match(errs(good.map((c) => (c.fn === 'pupil' ? { ...c, args: [c.args[0], c.args[1], { s: 0.62 }] } : c))), /Exactly one ink focus.*has 0/);
  assert.match(errs([...good, { fn: 'disc', args: [100, 20, 4, 'ink'] }]), /has 2/);
  assert.match(errs([{ fn: 'disc', args: [60, 45, 10, 'ink'] }]), /at least one person/);
  assert.equal(validateScene('[]').ok, false);
  assert.equal(validateScene(Array.from({ length: 41 }, () => good[0])).ok, false);
  assert.throws(() => renderScene([{ fn: 'constructor', args: [] }]), /unknown part/);
  assert.equal(inkCount({ fn: 'person', args: [1, 1, { back: true }] }), 1);
  assert.equal(inkCount({ fn: 'ink', args: ['M0 0 Z'] }), 1);
});

// ---- the drawing endpoint ---------------------------------------------------------------------
function store(initial) {
  const map = new Map(initial ? [['walkthrus_board/v1', structuredClone(initial)]] : []);
  return { map, async get(k) { return map.has(k) ? structuredClone(map.get(k)) : null; }, async setJSON(k, v) { map.set(k, structuredClone(v)); } };
}
const gateEnv = { GITHUB_TOKEN: 't', LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32), ANTHROPIC_API_KEY: 'k' };
const post = (body) => new Request('https://example.test/api/walkthrus-fusion-draw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const board = () => ({ arrows: [{ id: 'ar_1', from: A, to: B, type: 'leads_to' }], picked: [A, B], fusions: [fusion()], clusters: [{ id: 'cl_talk' }] });

function make(s, answers, { valid = true, env = gateEnv } = {}) {
  const calls = [];
  const handler = createWalkthrusFusionHandler({
    env, getContentStore: async () => s, verifySessionToken: () => ({ valid }), log: () => {}, nowIso: () => '2026-10-31T03:00:00.000Z',
    completeMessage: async (args) => { calls.push(args); return answers.shift(); }
  });
  return { handler, calls };
}

test('the endpoint is teacher only and gives an estimate', async () => {
  const s = store(board());
  assert.equal((await make(s, [], { valid: false }).handler(post({ fusion_id: 'fu_abc123' }))).status, 401);
  const est = await make(s, []).handler(new Request('https://example.test/api/walkthrus-fusion-draw?estimate=1'));
  assert.deepEqual((await est.json()).data, { low_aud: 0.1, high_aud: 0.25 });
  assert.equal((await make(s, []).handler(post({ fusion_id: 'nope' }))).status, 400);
  assert.equal((await make(s, []).handler(post({ fusion_id: 'fu_zzzzzz' }))).status, 404);
  assert.equal((await make(s, [], { env: { ...gateEnv, ANTHROPIC_API_KEY: '' } }).handler(post({ fusion_id: 'fu_abc123' }))).status, 503);
});

test('a good scene is drawn, saved into that fusion only, and costed', async () => {
  const s = store(board());
  const { handler, calls } = make(s, ['```json\n' + JSON.stringify(SCENE_EXAMPLES[A]) + '\n```']);
  const res = await handler(post({ fusion_id: 'fu_abc123', note: 'Show the second go' }));
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.fusion.drawing.status, 'drawn');
  assert.equal(data.fusion.drawing.svg, renderScene(SCENE_EXAMPLES[A]));
  assert.equal(data.fusion.drawing.note, 'Show the second go');
  assert.ok(data.cost_usd > 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-sonnet-5-5');
  assert.deepEqual(calls[0].thinking, { type: 'adaptive' });
  assert.match(calls[0].messages[0].content, /Call and polish/);
  assert.match(calls[0].messages[0].content, /Show the second go/);
  assert.match(calls[0].messages[0].content, /"fn":"person"/, 'the parents\' scenes go in as JSON');
  const saved = s.map.get('walkthrus_board/v1');
  assert.deepEqual(saved.arrows, board().arrows, 'other fields untouched');
  assert.deepEqual(saved.clusters, board().clusters);
  assert.equal(saved.fusions[0].drawing.status, 'drawn');
  assert.equal(saved.fusions[0].name, 'Call and polish');
});

test('a broken scene gets one retry with the errors, then the fusion is marked failed', async () => {
  const bad = JSON.stringify([{ fn: 'person', args: [20, 88, { s: 0.6 }] }]);
  const s = store(board());
  const { handler, calls } = make(s, ['Here you go: ' + bad, 'not json at all']);
  const { data } = await (await handler(post({ fusion_id: 'fu_abc123' }))).json();
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.at(-1).content, /Exactly one ink focus/);
  assert.equal(data.failed, true);
  assert.equal(data.fusion.drawing.status, 'failed');
  assert.equal(s.map.get('walkthrus_board/v1').fusions[0].drawing.status, 'failed');

  // the retry can rescue it
  const s2 = store(board());
  const second = make(s2, [bad, JSON.stringify({ scene: SCENE_EXAMPLES[B] ?? SCENE_EXAMPLES['w1-probing-questions'] })]);
  const ok = (await (await second.handler(post({ fusion_id: 'fu_abc123' }))).json()).data;
  assert.equal(ok.fusion.drawing.status, 'drawn');

  // a failed redraw keeps the picture already there
  const drawn = store({ ...board(), fusions: [fusion({ drawing: { status: 'drawn', svg: renderScene(SCENE_EXAMPLES[A]), scene: SCENE_EXAMPLES[A] } })] });
  const kept = (await (await make(drawn, ['x', 'y']).handler(post({ fusion_id: 'fu_abc123', note: 'try again' }))).json()).data;
  assert.equal(kept.failed, true);
  assert.equal(kept.fusion.drawing.status, 'drawn');
});

test('drawPrompt and parseScene', () => {
  const [f] = normalizeFusions([fusion()]);
  const p = drawPrompt(f, '');
  assert.match(p, /Cold calling \+ Say it again better/);
  assert.match(p, /3\. My own: A step I wrote\. Then loop back to step 1\./);
  assert.doesNotMatch(p, /teacher's note/);
  assert.deepEqual(parseScene('[{"fn":"disc","args":[1,2,3]}]'), [{ fn: 'disc', args: [1, 2, 3] }]);
  assert.equal(parseScene('nothing'), null);
});
