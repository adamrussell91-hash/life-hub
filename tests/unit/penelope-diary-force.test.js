import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PENELOPE_FORCE_DIARY_NUDGE,
  streamWithPenelopeDiaryForce
} from '../../netlify/functions/_shared/penelope-diary-force.mjs';

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test('does not start a second round for non-Penelope agents', async () => {
  let calls = 0;
  const anthropic = {
    async *streamMessage() {
      calls += 1;
      yield { type: 'text', delta: 'Alright king.' };
      yield { type: 'done' };
    }
  };
  await collect(streamWithPenelopeDiaryForce(anthropic, {
    slug: 'chadwick',
    userMessage: 'Log',
    messages: [{ role: 'user', content: 'Log' }]
  }));
  assert.equal(calls, 1);
});

test('finalize without log_entry forces a second Anthropic round', async () => {
  const calls = [];
  const anthropic = {
    async *streamMessage(args) {
      calls.push(args);
      if (calls.length === 1) {
        yield { type: 'text', delta: 'Ah — hold your horses, dear!' };
        yield { type: 'done' };
        return;
      }
      yield {
        type: 'tool_call',
        id: 'forced',
        name: 'log_entry',
        input: { type: 'diary', date: '2026-08-29', fields: { mood: 'low' }, notes: 'Rough day.' }
      };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithPenelopeDiaryForce(anthropic, {
    slug: 'penelope',
    userMessage: 'Confirm logged',
    messages: [
      { role: 'assistant', content: 'Alright, board this one goes onto — heading to the vault it goes.' },
      { role: 'user', content: 'Confirm logged' }
    ]
  }));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages.at(-1).content, PENELOPE_FORCE_DIARY_NUDGE);
  assert.ok(events.some(e => e.type === 'status' && /Filing the diary/i.test(e.text)));
  assert.ok(events.some(e => e.type === 'tool_call' && e.name === 'log_entry'));
});

test('claimed vault theatre without a tool call also forces a second round', async () => {
  const calls = [];
  const anthropic = {
    async *streamMessage(args) {
      calls.push(args);
      if (calls.length === 1) {
        yield { type: 'text', delta: 'Heading to the vault it goes.' };
        yield { type: 'done' };
        return;
      }
      yield { type: 'tool_call', id: 'forced', name: 'log_entry', input: { type: 'diary', date: '2026-08-29', fields: {} } };
      yield { type: 'done' };
    }
  };
  await collect(streamWithPenelopeDiaryForce(anthropic, {
    slug: 'penelope',
    userMessage: 'yeah',
    messages: [{ role: 'user', content: 'yeah' }]
  }));
  assert.equal(calls.length, 2);
});

test('skips force when log_entry already fired', async () => {
  let calls = 0;
  const anthropic = {
    async *streamMessage() {
      calls += 1;
      yield { type: 'tool_call', id: '1', name: 'log_entry', input: { type: 'diary', date: '2026-08-29', fields: {} } };
      yield { type: 'done' };
    }
  };
  await collect(streamWithPenelopeDiaryForce(anthropic, {
    slug: 'penelope',
    userMessage: 'Log',
    messages: [{ role: 'user', content: 'Log' }]
  }));
  assert.equal(calls, 1);
});
