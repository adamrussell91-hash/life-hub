import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHADWICK_FORCE_PLAN_NUDGE,
  resolveForcedChadwickPlan,
  streamWithChadwickPlanForce
} from '../../netlify/functions/_shared/chadwick-plan-force.mjs';

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

test('lock-in always gives the model the first pass, then late-forces log_entry from history', async () => {
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

  assert.equal(calls.length, 1, 'model must run once with full context before late force');
  assert.ok(events.some(event => event.type === 'status' && /Locking the plan onto Fitness/i.test(event.text)));
  assert.ok(events.some(event => event.type === 'text' && /On Fitness/i.test(event.delta)));
  const proposal = events.find(event => event.type === 'tool_call' && event.name === 'log_entry');
  assert.ok(proposal);
  assert.equal(proposal.input.fields.status, 'planned');
  assert.equal(proposal.input.fields.exercises.length, 3);
  assert.equal(proposal.input.fields.exercises[0].name, 'Bar Press');
  assert.equal(proposal.input.notes ?? '', '');
});

test('make the workout late-forces a Confirm after the model pass', async () => {
  const anthropic = {
    async *streamMessage() {
      yield { type: 'text', delta: 'On it.' };
      yield { type: 'done' };
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

test('superset pairing late-forces log_entry after the model pass', async () => {
  const anthropic = {
    async *streamMessage() {
      yield { type: 'text', delta: 'Got it.' };
      yield { type: 'done' };
    }
  };
  const pairingPlan = [
    'Pairing it your way:',
    '1&2 superset: Bar Press / Cable Bar Wide Grip Curl',
    '3&4 superset: Reverse Grip Incline Bench Press / One Handle Arm Triceps',
    '5&6 superset: Biceps Curl / Overhead Triceps'
  ].join('\n');
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage: "It's not there.",
    today: '2026-08-29',
    messages: [
      { role: 'assistant', content: pairingPlan },
      { role: 'assistant', content: 'Locking this in now with cues loaded for mid-session:' },
      { role: 'user', content: "It's not there." }
    ]
  }));
  const proposal = events.find(event => event.type === 'tool_call' && event.name === 'log_entry');
  assert.ok(proposal, 'expected a Confirm card proposal from history');
  assert.equal(proposal.input.fields.status, 'planned');
  assert.equal(proposal.input.fields.exercises.length, 6);
  assert.equal(proposal.input.fields.exercises[0].name, 'Bar Press');
});

test('does not late-force a second Confirm when executeTools already handled log_entry', async () => {
  let executeCalls = 0;
  const anthropic = {
    async *streamMessage({ executeTools } = {}) {
      await executeTools?.({
        type: 'tool_call',
        id: 'call_1',
        name: 'log_entry',
        input: { type: 'workout', fields: { status: 'planned' } }
      });
      executeCalls += 1;
      yield {
        type: 'text',
        delta: [
          "Here's the plan:",
          '1. Bar Press — Set 1: 10 reps x 30kg (cable: constant force)',
          '2. Bar Row — Set 1: 10 reps x 27kg (cable: constant force)',
          '3. Bar Squat — Set 1: 10 reps x 25kg (cable: none)'
        ].join('\n')
      };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage: 'build a full body session',
    today: '2026-08-29',
    messages: [{ role: 'user', content: 'build a full body session' }],
    executeTools: async () => JSON.stringify({ ok: true, status: 'awaiting_confirm' })
  }));

  assert.equal(executeCalls, 1);
  assert.equal(
    events.filter(event => event.type === 'tool_call' && event.name === 'log_entry').length,
    0,
    'swallowed log_entry must still count as sawLogEntry so the force wrapper does not emit a second card'
  );
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

test('a bare approval with no plan in the conversation never forces a workout round', async () => {
  let calls = 0;
  const anthropic = {
    async *streamMessage() {
      calls += 1;
      yield { type: 'text', delta: 'On it — digging into yoga for your hips now.' };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage: 'go ahead',
    today: '2026-09-30',
    messages: [
      { role: 'assistant', content: 'Want me to research some yoga moves for your hips?' },
      { role: 'user', content: 'go ahead' }
    ]
  }));
  assert.equal(calls, 1);
  assert.equal(events.some(event => event.type === 'tool_call'), false);
});

const FORCE_PLAN = [
  '1. Bar Press — 10x30kg (cable: none)',
  '2. Bar Row — 10x27kg (cable: none)',
  '3. Bar Squat — 10x25kg (cable: none)'
].join('\n');

const COMPLETED_FROM_PLAN = [{
  status: 'completed',
  title: 'Bar Press / Bar Row',
  record: {
    title: 'Bar Press / Bar Row',
    exercises: [
      { name: 'Bar Press', sets: [{ reps: 10, weight_kg: 30 }] },
      { name: 'Bar Row', sets: [{ reps: 10, weight_kg: 27 }] },
      { name: 'Bar Squat', sets: [{ reps: 10, weight_kg: 25 }] }
    ]
  }
}];

test('post-workout notes with a plan in history do not late-force a planned card', async () => {
  const anthropic = {
    async *streamMessage() {
      yield { type: 'text', delta: 'Got the notes, king.' };
      yield { type: 'done' };
    }
  };
  const userMessage = 'I accidentally hit finish before adding notes — avg HR 142, 410 kcal, it didn\'t save';
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage,
    today: '2026-10-06',
    messages: [
      { role: 'assistant', content: FORCE_PLAN },
      { role: 'user', content: userMessage }
    ],
    completedWorkouts: COMPLETED_FROM_PLAN
  }));
  assert.equal(events.some(event => event.type === 'tool_call' && event.name === 'log_entry'), false);
});

test('bare log this after a completed session matching the old plan does not force a planned card', async () => {
  assert.equal(resolveForcedChadwickPlan({
    slug: 'chadwick',
    userMessage: 'log this',
    today: '2026-10-06',
    pureLockInOnly: true,
    messages: [
      { role: 'assistant', content: FORCE_PLAN },
      { role: 'user', content: 'log this' }
    ],
    completedWorkouts: COMPLETED_FROM_PLAN
  }), null);

  const anthropic = {
    async *streamMessage() {
      yield { type: 'text', delta: 'That session is already on Fitness.' };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage: 'log this',
    today: '2026-10-06',
    messages: [
      { role: 'assistant', content: FORCE_PLAN },
      { role: 'user', content: 'log this' }
    ],
    completedWorkouts: COMPLETED_FROM_PLAN
  }));
  assert.equal(events.some(event => event.type === 'tool_call' && event.name === 'log_entry'), false);
});

test('a later distinct plan after a completed session still late-forces', async () => {
  const walkPlan = [
    '1. Easy Walk — 20 min',
    '2. Calf Raise — 15x20kg (cable: none)',
    '3. Hip Hinge — 10x30kg (cable: none)'
  ].join('\n');
  const anthropic = {
    async *streamMessage() {
      yield { type: 'text', delta: 'On it.' };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithChadwickPlanForce(anthropic, {
    slug: 'chadwick',
    userMessage: 'lock it in',
    today: '2026-10-06',
    messages: [
      { role: 'assistant', content: FORCE_PLAN },
      { role: 'assistant', content: walkPlan },
      { role: 'user', content: 'lock it in' }
    ],
    completedWorkouts: COMPLETED_FROM_PLAN
  }));
  const proposal = events.find(event => event.type === 'tool_call' && event.name === 'log_entry');
  assert.ok(proposal, 'a second session planned later in chat must still force a card');
  assert.equal(proposal.input.fields.status, 'planned');
  assert.ok(
    proposal.input.fields.exercises.some(exercise => exercise.name === 'Calf Raise'),
    'must propose the later walk plan, not the finished lift'
  );
  assert.equal(
    proposal.input.fields.exercises.some(exercise => exercise.name === 'Bar Press'),
    false
  );
});
