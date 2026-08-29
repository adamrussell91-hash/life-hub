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

test('lock-in with a parseable history plan emits log_entry without calling the model', async () => {
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

  assert.equal(calls.length, 0, 'must not wait on Anthropic when the plan is already in history');
  assert.ok(events.some(event => event.type === 'status' && /Locking the plan onto Fitness/i.test(event.text)));
  assert.ok(events.some(event => event.type === 'text' && /On Fitness/i.test(event.delta)));
  const proposal = events.find(event => event.type === 'tool_call' && event.name === 'log_entry');
  assert.ok(proposal);
  assert.equal(proposal.input.fields.status, 'planned');
  assert.equal(proposal.input.fields.exercises.length, 3);
  assert.equal(proposal.input.fields.exercises[0].name, 'Bar Press');
});

test('make the workout and is it ready to go emit the same card without the model', async () => {
  const anthropic = {
    async *streamMessage() {
      throw new Error('Anthropic must not run on lock-in follow-ups');
    }
  };
  const history = [
    { role: 'assistant', content: [
      '1. Bar Squat — 10x25kg, 10x25kg (cable: none)',
      '12. One Grip Russian Twist — 20×6kg (cable: none)',
      '13. Bar Press — FINISHER — 20×20kg (cable: constant force)'
    ].join('\n') },
    { role: 'assistant', content: 'Locking it in now.' }
  ];

  for (const userMessage of ['make the workout', 'is it ready to go?']) {
    const events = await collect(streamWithChadwickPlanForce(anthropic, {
      slug: 'chadwick',
      userMessage,
      today: '2026-08-29',
      messages: [...history, { role: 'user', content: userMessage }]
    }));
    const proposal = events.find(event => event.type === 'tool_call' && event.name === 'log_entry');
    assert.ok(proposal, `expected a Confirm card for "${userMessage}"`);
    assert.equal(proposal.input.fields.exercises.length, 3);
    assert.equal(proposal.input.fields.exercises[2].name, 'Bar Press');
    assert.equal(proposal.input.fields.exercises[2].sets[0].reps, 20);
    assert.equal(proposal.input.fields.exercises[2].sets[0].weight_kg, 20);
  }
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
