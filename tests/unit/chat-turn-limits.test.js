import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_TURN_TIMEOUT_MS } from '../../js/core/chat-turn-limits.js';

test('chat turn timeout matches Netlify streaming function cap', () => {
  assert.equal(CHAT_TURN_TIMEOUT_MS, 60_000);
});
