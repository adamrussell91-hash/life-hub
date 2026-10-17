import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAlchemyPrompt, completeAlchemy, ALCHEMY_INPUT_CAP } from '../../netlify/functions/_shared/alchemy-analysis.mjs';
import { createAlchemyBudget } from '../../netlify/functions/_shared/alchemy-budget.mjs';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';

const shelf = n => Array.from({ length: n }, (_, i) => ({ id: 'note-' + i, title: 'Knowledge note ' + i, excerpt: 'Teaching idea '.repeat(25), shelf: i < 12 ? 'unit' : 'archive', why: 'Useful for this unit because it sharpens the questions.' }));
// A long reading block with a glossary link every sentence, like a close-reading lesson.
const longBlock = { id: 'b1', block_type: 'text', content: { html: '<p>' + 'Close your eyes and picture a poem on a page. <a href="https://example.com/glossary/term">anthology</a> '.repeat(90) + '</p>' } };
const context = { entity: { title: 'Lesson', description: 'd'.repeat(400) }, unit: { title: 'Unit', description: 'u'.repeat(400) } };

test('a long block with a full notes shelf still reaches Ann: notes are trimmed, the block is not refused', () => {
  const prompt = buildAlchemyPrompt({ context, blocks: [longBlock], sources: shelf(24), mode: 'manual' });
  assert.ok(Buffer.byteLength(prompt.system) + Buffer.byteLength(prompt.user) + 256 <= ALCHEMY_INPUT_CAP);
  const sent = JSON.parse(prompt.user);
  assert.deepEqual(sent.blocks, [longBlock]);
  assert.ok(sent.sources.length >= 1, 'keeps the notes that fit');
  assert.equal(sent.sources[0].id, 'note-0', 'unit shelf notes go first, archive candidates are dropped first');
});

test('only a block too large on its own is refused', () => {
  const huge = { ...longBlock, content: { html: 'x'.repeat(ALCHEMY_INPUT_CAP) } };
  assert.throws(() => buildAlchemyPrompt({ context, blocks: [huge], sources: shelf(4), mode: 'manual' }), e => e.code === 'alchemy_input_limit');
});

test('Ann has room to write back a whole long block, and a cut-off answer says so', async () => {
  let sent;
  const fetchImpl = async (_url, options) => { sent = JSON.parse(options.body); return new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"proposals":[{"blockId":"b1","rationale":"Tighter' }], usage: { input_tokens: 10, output_tokens: 10 } }), { headers: { 'content-type': 'application/json' } }); };
  await assert.rejects(completeAlchemy({ prompt: { system: 's', user: 'u' }, env: { ANTHROPIC_API_KEY: 'k', ALCHEMY_PASSIVE_MODEL: 'm' }, fetchImpl }), e => e.code === 'alchemy_invalid' && /cut off/.test(e.message));
  assert.ok(sent.max_tokens >= 6000, 'a long block rewritten in full needs more than 1600 tokens');
});

test('a block Ann was never asked about does not lock out the next ask', async () => {
  let clock = Date.parse('2026-10-13T00:00:00Z');
  const budget = createAlchemyBudget(memoryAlchemyStore(), { now: () => clock });
  for (const code of ['alchemy_input_limit', 'alchemy_stale', 'not_found']) {
    const ticket = await budget.reserve({ key: code, mode: 'manual' });
    await budget.finish(ticket, { error: { status: 400, code } });
    clock += 1000;
    const next = await budget.reserve({ key: code + '-again', mode: 'manual' });
    await budget.finish(next, { result: { proposals: [] } });
    clock += 61000; // past the separate four-a-minute service allowance
  }
});
