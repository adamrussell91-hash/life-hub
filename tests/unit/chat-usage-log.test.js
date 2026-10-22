import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnUsage, addUsage, estimateUsd, usageLogLine } from '../../netlify/functions/_shared/chat-usage-log.mjs';

test('a turn sums every round and ignores other events', () => {
  const turn = createTurnUsage();
  addUsage(turn, { type: 'text', text: 'hi' });
  addUsage(turn, { type: 'usage', inputTokens: 10000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 0, webSearches: 1 });
  addUsage(turn, { type: 'usage', inputTokens: 12000, outputTokens: 300 });
  assert.deepEqual(turn, { rounds: 2, inputTokens: 22000, outputTokens: 800, cacheReadTokens: 2000, cacheWriteTokens: 0, webSearches: 1 });
});

test('cost uses Sonnet 5 prices and is null for an unknown model', () => {
  const turn = { rounds: 1, inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, webSearches: 2 };
  // 2 + 1 + 0.2 + 0.02
  assert.equal(estimateUsd(turn, 'claude-sonnet-5'), 3.22);
  assert.equal(estimateUsd(turn, 'some-other-model'), null);
});

test('the log line carries counts and cost only', () => {
  const turn = createTurnUsage();
  addUsage(turn, { type: 'usage', inputTokens: 1000, outputTokens: 100 });
  const line = JSON.parse(usageLogLine({ agent: 'brisket', model: 'claude-sonnet-5', turn }));
  assert.deepEqual(line, {
    event: 'chat_usage', agent: 'brisket', model: 'claude-sonnet-5',
    rounds: 1, inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0,
    est_usd: 0.003
  });
});
