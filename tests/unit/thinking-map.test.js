// tests/unit/thinking-map.test.js
// The thinking map: the registry is sound (every link real, every option with a when line and a
// signal, every protocol reachable from two tools, no tool cut off), shortlist ranking and
// exclusion, keyword signals, the new-links table and the shared prices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  allOptions, getOption, mapProblems, NEW_LINKS, PROTOCOLS, PROTOCOL_TOOL, shortlist, SIGNALS, signalsFromText, TOOLS
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
