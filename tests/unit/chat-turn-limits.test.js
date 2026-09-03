import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_BACKGROUND_LIMIT_MS } from '../../apps/life/js/core/chat-turn-limits.js';
import { readFile } from 'node:fs/promises';

test('chat turns use the 15-minute background cap, not a one-minute client abort', () => {
  assert.equal(CHAT_BACKGROUND_LIMIT_MS, 15 * 60 * 1000);
});

test('chat controller does not abort a turn after 60 seconds', async () => {
  const source = await readFile(new URL('../../apps/life/js/app/chat-controller.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /CHAT_TURN_TIMEOUT_MS|turn-timeout|one-minute limit/);
  assert.doesNotMatch(source, /60_000/);
});
