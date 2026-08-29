import test from 'node:test';
import assert from 'node:assert/strict';
import { CHADWICK_FORCE_PLAN_NUDGE, streamWithChadwickPlanForce } from '../../netlify/functions/_shared/chadwick-plan-force.mjs';

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test('does not start a second round for non-Chadwick agents', async () => {
  let calls = 0;
  const anthropic = {
    async *streamMessage() {
      calls += 1;
      yield { type: 'text', delta: 'Shoot, buddy.' };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'brisket',
    userMessage: 'ok lets put it into action',
    messages: [{ role: 'user', content: 'ok lets put it into action' }]
  }));
  assert.equal(calls, 1);
  assert.equal(events.some(event => event.type === 'status'), false);
});

test('lock-in with a parseable history plan emits log_entry without a second model round', async () => {
  const calls = [];
  const anthropic = {
    async *streamMessage(args) {
      calls.push(args);
      yield { type: 'text', delta: 'Alright king, LOCKED IN.' };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage: 'lock it onto Fitness',
    today: '2026-08-29',
    messages: [
      { role: 'assistant', content: '1. Bar Press — 10x30kg (cable: none)\n2. Bar Row — 10x27kg (cable: none)\n3. Bar Squat — 10x25kg (cable: none)' },
      { role: 'user', content: 'lock it onto Fitness' }
    ]
  }));

  assert.equal(calls.length, 1);
  assert.ok(events.some(event => event.type === 'status' && /Locking the plan onto Fitness/i.test(event.text)));
  const proposal = events.find(event => event.type === 'tool_call' && event.name === 'log_entry');
  assert.ok(proposal);
  assert.equal(proposal.input.fields.status, 'planned');
  assert.equal(proposal.input.fields.exercises.length, 3);
  assert.equal(proposal.input.fields.exercises[0].name, 'Bar Press');
});

test('forces a second Anthropic round when lock-in has no parseable plan', async () => {
  const calls = [];
  const anthropic = {
    async *streamMessage(args) {
      calls.push(args);
      if (calls.length === 1) {
        yield { type: 'text', delta: 'Alright king, LOCKED IN.' };
        yield { type: 'done' };
        return;
      }
      yield { type: 'tool_call', id: 'call_2', name: 'log_entry', input: { type: 'workout' } };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage: 'ok lets put it into action',
    today: '2026-08-29',
    messages: [
      { role: 'assistant', content: 'Want me to lock this in?' },
      { role: 'user', content: 'ok lets put it into action' }
    ]
  }));

  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages.at(-1).content, CHADWICK_FORCE_PLAN_NUDGE);
  assert.ok(events.some(event => event.type === 'status' && /Locking the plan onto Fitness/i.test(event.text)));
  assert.ok(events.some(event => event.type === 'tool_call' && event.name === 'log_entry'));
});

test('does not force a second round once log_entry already ran', async () => {
  let calls = 0;
  const anthropic = {
    async *streamMessage() {
      calls += 1;
      yield { type: 'tool_call', id: 'call_1', name: 'log_entry', input: { type: 'workout' } };
      yield { type: 'done' };
    }
  };
  await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage: 'ok lets put it into action',
    messages: [{ role: 'user', content: 'ok lets put it into action' }]
  }));
  assert.equal(calls, 1);
});
