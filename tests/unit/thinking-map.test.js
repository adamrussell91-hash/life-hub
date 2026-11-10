// tests/unit/thinking-map.test.js
// The thinking map: the registry is sound (every link real, every option with a when line and a
// signal, every protocol reachable from two tools, no tool cut off), shortlist ranking and
// exclusion, keyword signals, the new-links table and the shared prices; snares and families.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  allOptions, FAMILIES, getOption, getSnare, mapProblems, NEW_LINKS, PROTOCOLS, PROTOCOL_TOOL, shortlist, SIGNALS, signalsFromText, SNARES, snaresFor, TOOLS
} from '../../packages/thinking-map/index.mjs';
import { audFor, PRICES_USD_PER_MTOK, USD_TO_AUD } from '../../packages/thinking-map/pricing.mjs';

test('the map has no integrity problems', () => {
  assert.deepEqual(mapProblems(), []);
});

test('contract shapes: twelve signals, eight tools with display names and routes, eight protocols', () => {
  assert.equal(SIGNALS.length, 12);
  assert.ok(Object.isFrozen(SIGNALS) && Object.isFrozen(TOOLS) && Object.isFrozen(PROTOCOLS));
  assert.deepEqual(TOOLS.map((t) => t.name), ['Problem Solver', 'Decision Maker', 'Gear Shifter', 'Wayfinder', 'Change Navigator', 'Team Builder', 'Conversation Guide', 'Thought Starter']);
  assert.deepEqual(TOOLS.map((t) => t.id), ['problem-solver', 'decision-book', 'get-things-done', 'rules-book', 'change-book', 'collaboration-book', 'communication-book', 'question-book']);
  assert.ok(TOOLS.every((t) => t.route.startsWith('#/')));
  assert.equal(PROTOCOLS.length, 8);
});

test('option ids follow the contract and every option has the full shape', () => {
  const options = allOptions();
  assert.ok(Object.isFrozen(options));
  for (const t of TOOLS) assert.equal(getOption(`tool:${t.id}`).kind, 'tool');
  for (const p of PROTOCOLS) assert.equal(getOption(`protocol:${p.id}`).tool, PROTOCOL_TOOL);
  assert.equal(getOption('ps:seven_step').tool, 'problem-solver');
  assert.equal(getOption('rb_pareto').tool, 'rules-book');
  assert.equal(getOption('qb_career').kind, 'chapter');
  assert.equal(getOption('qb_four_rules'), null, 'the rules card is not a chapter to detour to');
  assert.equal(getOption('nope'), null);
  for (const o of options) {
    assert.ok(o.when && o.signals.length, o.id);
    assert.ok(['tool', 'model', 'chapter', 'protocol'].includes(o.kind), o.id);
    assert.ok(Array.isArray(o.links) && !o.links.includes(o.id), o.id);
  }
});

test('integrity: links point at real options, protocols are reachable from two tools, no tool is cut off', () => {
  const options = allOptions();
  for (const o of options) for (const to of o.links) assert.ok(getOption(to), `${o.id} -> ${to}`);
  for (const p of PROTOCOLS) {
    const tools = new Set(options.filter((o) => o.tool !== PROTOCOL_TOOL && o.links.includes(`protocol:${p.id}`)).map((o) => o.tool));
    assert.ok(tools.size >= 2, `${p.id} from ${[...tools]}`);
  }
  const toolOf = (id) => getOption(id).tool;
  for (const t of TOOLS) {
    assert.ok(options.some((o) => o.tool === t.id && o.links.some((to) => toolOf(to) !== t.id)), `${t.id} out`);
    assert.ok(options.some((o) => o.tool !== t.id && o.links.some((to) => toolOf(to) === t.id)), `${t.id} in`);
  }
});

test('catalogue pairsWell links are imported; a toolkit tool link goes to Problem Solver', () => {
  assert.ok(getOption('rb_hofstadter').links.includes('rb_parkinson'));
  assert.ok(getOption('rb_parkinson').links.includes('tool:problem-solver'), 'kanban is a Problem Solver tool');
  assert.ok(getOption('cb_ladder').links.includes('cm_nonviolent'), 'a new link joins the option');
});

test('new links: at least three per pair of the tools that were Books where written, each with a why', () => {
  const books = ['rules-book', 'change-book', 'collaboration-book', 'communication-book', 'question-book'];
  const pairs = new Map();
  for (const link of NEW_LINKS) {
    assert.ok(link.why.trim(), `${link.from} -> ${link.to}`);
    const a = getOption(link.from).tool;
    const b = getOption(link.to).tool;
    if (books.includes(a) && books.includes(b) && a !== b) {
      const key = [a, b].sort().join('|');
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
  assert.equal(pairs.size, 10, 'every pair of the five has links');
  for (const [pair, n] of pairs) assert.ok(n >= 3, `${pair}: ${n}`);
});

test('shortlist ranks by signal overlap, lifts tools, caps three per tool and honours exclude', () => {
  const list = shortlist({ signals: ['choice', 'values'] });
  assert.ok(list.length <= 8);
  assert.equal(list[0].id, 'tool:decision-book', 'the tool with both signals comes first');
  const perTool = {};
  for (const o of list) perTool[o.tool] = (perTool[o.tool] ?? 0) + 1;
  assert.ok(Object.values(perTool).every((n) => n <= 3));
  const without = shortlist({ signals: ['choice', 'values'], exclude: ['tool:decision-book'] });
  assert.ok(!without.some((o) => o.id === 'tool:decision-book'));
  assert.equal(shortlist({ signals: ['ethics'], limit: 2 }).length, 2);
});

test('shortlist: a link from the current option lifts its targets; the from option is never listed', () => {
  const list = shortlist({ signals: [], fromOptionId: 'cb_ladder' });
  assert.ok(list.some((o) => o.id === 'cm_nonviolent'));
  assert.ok(!list.some((o) => o.id === 'cb_ladder'));
});

test('shortlist with nothing to go on gives the tools in nav order', () => {
  assert.deepEqual(shortlist({}).map((o) => o.id), TOOLS.map((t) => `tool:${t.id}`));
});

test('signalsFromText reads keywords from an invented situation', () => {
  assert.deepEqual(signalsFromText('Choosing between two community garden plots'), ['choice']);
  assert.ok(signalsFromText('A flatmate who never does the dishes and I need to talk to them').includes('message'));
  assert.deepEqual(signalsFromText(''), []);
});

test('the links table script prints a markdown table', () => {
  const out = execFileSync(process.execPath, ['scripts/print-thinking-map-links.mjs'], { encoding: 'utf8' });
  assert.match(out, /^\| From \| To \| Why \|/);
  assert.equal(out.trim().split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| From') && !l.startsWith('| ---')).length, NEW_LINKS.length);
});

test('prices: Haiku 5.5 at $0.10 / $0.50 per million, priced in A$', () => {
  assert.deepEqual({ ...PRICES_USD_PER_MTOK['claude-haiku-5-5'] }, { input: 0.1, output: 0.5 });
  assert.ok(Math.abs(audFor('claude-haiku-5-5', { input: 1_000_000, output: 0 }) - 0.1 * USD_TO_AUD) < 1e-9);
  assert.equal(audFor('unknown-model', { input: 10 }), null);
  assert.ok(audFor('claude-haiku-5-5', { input: 2000, output: 300 }) < 0.01, 'a check-in is under one cent');
});

test('snares: about forty, sn_ ids, one-line when and check, real signals and counters', () => {
  assert.ok(SNARES.length >= 36 && SNARES.length <= 45, String(SNARES.length));
  assert.ok(Object.isFrozen(SNARES));
  assert.equal(new Set(SNARES.map((s) => s.id)).size, SNARES.length);
  for (const s of SNARES) {
    assert.match(s.id, /^sn_[a-z_]+$/);
    assert.ok(Object.isFrozen(s), s.id);
    assert.match(s.when, /\byou(r)?\b/i, `${s.id} when is second person`);
    assert.match(s.when, /^[A-Z][^.?!]*\.$/, `${s.id} when is one sentence`);
    assert.ok(!s.when.includes('\n') && !s.check.includes('\n'), s.id);
    assert.match(s.check, /\?$/, `${s.id} check is a question`);
    assert.equal(s.check.split('?').length, 2, `${s.id} check is one question`);
    assert.ok(s.signals.length >= 1 && s.signals.every((sig) => SIGNALS.includes(sig)), s.id);
    assert.ok(s.counters.length >= 1 && s.counters.length <= 3, s.id);
    for (const c of s.counters) assert.ok(getOption(c), `${s.id} counter ${c}`);
    assert.ok(s.tells instanceof RegExp && s.tells.flags.includes('i') && !s.tells.flags.includes('g'), s.id);
  }
  assert.equal(getSnare('sn_sunk_cost').title, 'Sunk cost');
  assert.equal(getSnare('nope'), null);
});

test('every protocol but Fates and Horizon counters at least one snare', () => {
  for (const p of PROTOCOLS.filter((x) => !['fates', 'horizon'].includes(x.id))) {
    assert.ok(SNARES.some((s) => s.counters.includes(`protocol:${p.id}`)), p.id);
  }
});

test('snaresFor: a tells match outranks signal overlap; ties keep list order; nothing to go on gives none', () => {
  const text = 'We have already spent two years on the community garden plan, so we cannot stop now.';
  const ranked = snaresFor({ signals: ['choice'], text, limit: 6 });
  assert.equal(ranked[0].id, 'sn_sunk_cost', 'the tells match comes first');
  assert.ok(ranked.length <= 6);
  const bySignal = snaresFor({ signals: ['choice'], text: '', limit: 50 });
  const order = SNARES.filter((s) => s.signals.includes('choice')).map((s) => s.id);
  assert.deepEqual(bySignal.map((s) => s.id), order, 'one-point ties stay in list order');
  assert.deepEqual(snaresFor({}), []);
  assert.deepEqual(snaresFor({ signals: ['not_a_signal'], text: '   ' }), []);
  assert.equal(snaresFor({ signals: SIGNALS, limit: 2 }).length, 2);
});

test('snares are never options and never shortlisted', () => {
  const ids = new Set(allOptions().map((o) => o.id));
  for (const s of SNARES) {
    assert.ok(!ids.has(s.id), s.id);
    assert.equal(getOption(s.id), null, s.id);
  }
  for (const signals of [SIGNALS, ['argument'], ['choice', 'stuck'], []]) {
    assert.ok(!shortlist({ signals, limit: 300 }).some((o) => o.id.startsWith('sn_')));
  }
});

test('families: four, null only for tool-level options, defaults by tool with a few overrides', () => {
  assert.deepEqual([...FAMILIES], ['action', 'insight', 'frame', 'snare']);
  for (const o of allOptions()) {
    if (o.kind === 'tool') assert.equal(o.family, null, o.id);
    else assert.ok(['action', 'insight', 'frame'].includes(o.family), `${o.id}: ${o.family}`);
  }
  assert.equal(getOption('ps:seven_step').family, 'action');
  assert.equal(getOption('dm_eisenhower').family, 'action');
  assert.equal(getOption('rb_occam').family, 'insight');
  assert.equal(getOption('qb_career').family, 'frame');
  assert.equal(getOption('protocol:refinery').family, 'action');
  assert.equal(getOption('dm_role_playing').family, 'frame', 'a perspective model is a frame');
});

test('Ways of Seeing models join the map with links to other tools', () => {
  assert.ok(getOption('rb_second_order').links.includes('tool:problem-solver'), 'causal map is a Problem Solver tool');
  assert.ok(getOption('rb_probabilistic').links.includes('tool:decision-book'), 'the decision record belongs to Decision Maker');
  assert.ok(getOption('rb_scout').links.includes('protocol:refinery'));
  for (const id of ['rb_first_principles', 'rb_second_order', 'rb_hanlon', 'rb_circle_competence', 'rb_probabilistic', 'rb_scout']) {
    const o = getOption(id);
    assert.equal(o.tool, 'rules-book', id);
    assert.ok(o.links.some((to) => getOption(to).tool !== 'rules-book'), id);
  }
});
