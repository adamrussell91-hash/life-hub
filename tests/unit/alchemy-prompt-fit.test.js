import test from 'node:test';
import assert from 'node:assert/strict';
import { completeAlchemy } from '../../netlify/functions/_shared/alchemy-analysis.mjs';
import { createAlchemyBudget } from '../../netlify/functions/_shared/alchemy-budget.mjs';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';

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
