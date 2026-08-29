import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01',
  ANTHROPIC_API_KEY: 'anthropic-secret-key'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function request(body, headers = {}) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function githubFetchStub() {
  return async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

async function* mockedStream(events) {
  for (const event of events) yield event;
}

async function readSse(response) {
  const text = await response.text();
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

function contentEvents(events) {
  return events.filter(event => event.type !== 'status');
}

test('streams an agent event, text, and a validated record proposal for a routed message', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => mockedStream([
        { type: 'text', delta: 'Logging it now.' },
        { type: 'tool_call', id: 'call_1', name: 'log_entry', input: {
          type: 'workout', date: '2026-08-01', fields: {
            title: 'Squat Session', session_kind: 'strength',
            day_type: 'workout_30', status: 'completed', duration_min: 30,
            exercises: [{ name: 'Squat', sets: [{ reps: 10, weight_kg: 40, cable_type: 'concentric' }] }]
          }
        } },
        { type: 'done' }
      ])
    })
  });

  const response = await handler(request({ message: 'Chadwick, log a 30 minute workout' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');

  const events = contentEvents(await readSse(response));
  assert.deepEqual(events[0], { type: 'agent', slug: 'chadwick' });
  assert.deepEqual(events[1], { type: 'text', delta: 'Logging it now.' });
  assert.equal(events[2].type, 'record_proposal');
  assert.equal(events[2].record.type, 'workout');
  assert.equal(events[2].path, 'data/fitness/2026/08/2026-08-01-workout-1600.md');
  assert.deepEqual(events[3], { type: 'done' });
});

test('every agent gets web_search with no max_uses cap', async () => {
  const captured = {};
  const captureFor = message => createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: a => {
        captured[message] = a;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  for (const message of [
    'Chadwick, plan a session',
    'Brisket, what should I eat?',
    'Hyaluronica, what is on AM?',
    'Sara, how is my iron?',
    'Hammond, what is the mission today?'
  ]) {
    await readSse(await captureFor(message)(request({ message })));
    const search = captured[message].tools.find(tool => tool.name === 'web_search');
    assert.ok(search, `expected web_search for: ${message}`);
    assert.equal(search.max_uses, undefined, `web_search must be uncapped for: ${message}`);
  }
});

test('loads saved workout template summaries into Chadwick\'s system prompt', async () => {
  const templatePath = 'data/fitness/templates/chest-and-curls.md';
  const templateSha = 'e'.repeat(40);
  const templateContent = [
    '---',
    'schema_version: 1',
    'type: "workout_template"',
    'title: "Chest and Curls"',
    'session_kind: "strength"',
    'source_session_date: "2026-07-30"',
    '---'
  ].join('\n');
  let receivedArgs;
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: templatePath, type: 'blob', sha: templateSha }] });
    }
    if (url.includes(`/git/blobs/${templateSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(templateContent, 'utf8').toString('base64') });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Chadwick, what should I do today?' })));

  assert.match(receivedArgs.system, /Chest and Curls/);
  assert.match(receivedArgs.system, /2026-07-30/);
});

test('conversation history is forwarded to Anthropic ahead of the new message', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Got it.' }, { type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'actually make that 3 eggs',
    priorAgentSlug: 'brisket',
    history: [
      { role: 'user', content: 'Brisket, log 2 eggs for breakfast' },
      { role: 'assistant', content: 'Logging that now, buddy.' }
    ]
  })));

  assert.deepEqual(receivedArgs.messages, [
    { role: 'user', content: 'Brisket, log 2 eggs for breakfast' },
    { role: 'assistant', content: 'Logging that now, buddy.' },
    { role: 'user', content: 'actually make that 3 eggs' }
  ]);
});

test('an unnamed follow-up stays with the sticky agent instead of falling back to the router', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => mockedStream([{ type: 'text', delta: 'On it.' }, { type: 'done' }])
    })
  });

  const response = await handler(request({ message: 'actually make that 3 eggs', priorAgentSlug: 'brisket' }));
  const events = contentEvents(await readSse(response));
  assert.deepEqual(events[0], { type: 'agent', slug: 'brisket' });
});

test('Brisket meal turns emit status heartbeats, only load today+yesterday blobs, and finish with a proposal', async () => {
  const todaySha = '1'.repeat(40);
  const yesterdaySha = '2'.repeat(40);
  const oldSha = '3'.repeat(40);
  const foodSha = '4'.repeat(40);
  const mealYaml = `---
schema_version: 1
id: meal-today
type: meal
date: 2026-08-01
time: "19:00"
created_at: 2026-08-01T19:00:00+10:00
updated_at: 2026-08-01T19:00:00+10:00
source: test
meal: dinner
calories: 600
protein_g: 40
fat_g: 20
---
`;
  const readShas = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: 'data/nutrition/2026/08/2026-08-01-dinner.md', type: 'blob', sha: todaySha, size: mealYaml.length },
          { path: 'data/nutrition/2026/07/2026-07-31-lunch.md', type: 'blob', sha: yesterdaySha, size: mealYaml.length },
          { path: 'data/nutrition/2026/07/2026-07-25-lunch.md', type: 'blob', sha: oldSha, size: mealYaml.length },
          { path: 'data/food-library.json', type: 'blob', sha: foodSha, size: 2 },
          { path: 'central-node.md', type: 'blob', sha: '5'.repeat(40), size: 20 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${todaySha}`) || url.includes(`/git/blobs/${yesterdaySha}`)) {
      readShas.push(url.slice(-40));
      await new Promise(resolve => setTimeout(resolve, 15));
      return Response.json({ content: Buffer.from(mealYaml).toString('base64'), encoding: 'base64' });
    }
    if (url.includes(`/git/blobs/${oldSha}`)) {
      readShas.push(oldSha);
      throw new Error('old blob should not be fetched for chat digest');
    }
    if (url.includes(`/git/blobs/${foodSha}`)) {
      return Response.json({ content: Buffer.from('[]').toString('base64'), encoding: 'base64' });
    }
    if (url.includes('/git/blobs/')) {
      return Response.json({ content: Buffer.from('# Purpose\n').toString('base64'), encoding: 'base64' });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      async *streamMessage({ executeTools }) {
        yield { type: 'search', query: 'homemade lasagna nutrition AU' };
        const saved = await executeTools({
          id: 'call_food',
          name: 'save_food_library_entry',
          input: {
            name: 'Homemade Lasagna',
            servingDescription: '1 big slice',
            calories: 650,
            protein_g: 42,
            fat_g: 28,
            sodium_mg: 980
          }
        });
        assert.ok(saved);
        yield {
          type: 'tool_call',
          id: 'call_meal',
          name: 'log_entry',
          input: {
            type: 'meal',
            date: '2026-08-01',
            notes: 'Homemade lasagna — solid protein, watch the sodium.',
            fields: {
              meal: 'dinner',
              calories: 650,
              protein_g: 42,
              fat_g: 28,
              sodium_mg: 980,
              calcium_mg: 180,
              polyphenol_score: 3,
              omega3: 'low'
            }
          }
        };
        yield { type: 'text', delta: 'Logged that lasagna, buddy.' };
        yield { type: 'done' };
      }
    })
  });

  const started = Date.now();
  const raw = await readSse(await handler(request({ message: 'Brisket, dinner was a big slice of homemade lasagna' })));
  const elapsed = Date.now() - started;
  const events = contentEvents(raw);

  assert.ok(raw.some(event => event.type === 'status' && /Loading your logs/i.test(event.text)));
  assert.ok(raw.some(event => event.type === 'status' && /Thinking/i.test(event.text)));
  assert.deepEqual(events[0], { type: 'agent', slug: 'brisket' });
  assert.ok(events.some(event => event.type === 'search'));
  assert.ok(events.some(event => event.type === 'food_library_saved' && event.name === 'Homemade Lasagna'));
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal, 'expected a meal Confirm proposal');
  assert.equal(proposal.record.type, 'meal');
  assert.equal(proposal.record.sodium_mg, 980);
  assert.ok(events.some(event => event.type === 'text' && /lasagna/i.test(event.delta)));
  assert.ok(!readShas.includes(oldSha), `chat must not load week-old blobs; read ${readShas.join(',')}`);
  assert.ok(readShas.includes(todaySha) || readShas.includes(yesterdaySha));
  assert.ok(elapsed < 5000, `smoke took too long: ${elapsed}ms`);
});

test('malformed history entries are dropped rather than breaking the request', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'hi',
    history: [
      { role: 'user', content: 'fine' },
      { role: 'system', content: 'not a valid role' },
      { role: 'assistant', content: '' },
      'not even an object',
      { role: 'assistant', content: 'also fine' }
    ]
  })));

  assert.deepEqual(receivedArgs.messages, [
    { role: 'user', content: 'fine' },
    { role: 'assistant', content: 'also fine' },
    { role: 'user', content: 'hi' }
  ]);
});

test('conversation history keeps the newest workout plan when earlier lectures overflow the budget', async () => {
  let rounds = 0;
  const firstLecture = [
    '1. Ski Pull — 10x20kg SKI_PULL_MARKER',
    '2. Bar Row — 10x20kg',
    '3. Bar Squat — 10x20kg',
    'x'.repeat(4200)
  ].join('\n');
  const filler = `FILLER ${'x'.repeat(4200)}`;
  const latest = [
    'Comeback Full Body Burn',
    '1. Bar Press — 10 x 30kg',
    '2. Bar Row — 10 x 27kg',
    '3. Bar Squat — 10 x 25kg',
    '10. One Grip Russian Twist — 20 x 6kg RUSSIAN_TWIST_MARKER'
  ].join('\n');
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => {
        rounds += 1;
        return mockedStream([{ type: 'text', delta: 'On it.' }, { type: 'done' }]);
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({
    message: 'ok lets put it into action',
    priorAgentSlug: 'chadwick',
    history: [
      { role: 'user', content: 'welcome back' },
      { role: 'assistant', content: firstLecture },
      { role: 'user', content: 'I can go longer' },
      { role: 'assistant', content: filler },
      { role: 'user', content: 'option b' },
      { role: 'assistant', content: filler },
      { role: 'user', content: 'you changed it' },
      { role: 'assistant', content: latest }
    ]
  }))));

  assert.equal(rounds, 0, 'lock-in must not wait on Anthropic when the newest plan still parses');
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal, 'expected a Confirm card from the newest plan');
  const names = proposal.record.exercises.map(exercise => exercise.name).join('\n');
  assert.match(names, /One Grip Russian Twist/);
  assert.doesNotMatch(names, /Ski Pull/);
});

test('a Chadwick lock-in with no log_entry forces a second round that can propose the plan', async () => {
  let rounds = 0;
  const planned = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Comeback Full Body Burn',
      session_kind: 'strength',
      day_type: 'workout_45_60',
      status: 'planned',
      duration_min: 50,
      exercises: [{ name: 'Bar Press', sets: [{ reps: 10, weight_kg: 30, cable_type: 'constant_force' }] }]
    }
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      async *streamMessage() {
        rounds += 1;
        if (rounds === 1) {
          yield { type: 'text', delta: 'Alright king, LOCKED IN. Full send.' };
          yield { type: 'done' };
          return;
        }
        yield {
          type: 'tool_call',
          id: 'call_plan',
          name: 'log_entry',
          input: planned
        };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({
    message: 'ok lets put it into action',
    priorAgentSlug: 'chadwick'
  }))));

  assert.equal(rounds, 2);
  assert.ok(events.some(event => event.type === 'text' && /LOCKED IN/i.test(event.delta)));
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal, 'expected a planned Confirm card after the force round');
  assert.equal(proposal.record.status, 'planned');
  assert.equal(proposal.record.title, 'Comeback Full Body Burn');
});

test('lock it onto Fitness builds a Confirm card from history without calling the model', async () => {
  let rounds = 0;
  let githubCalls = 0;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: async url => {
      githubCalls += 1;
      return githubFetchStub()(url);
    },
    createAnthropicClient: () => ({
      streamMessage: () => {
        rounds += 1;
        return mockedStream([{ type: 'text', delta: 'On it.' }, { type: 'done' }]);
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({
    message: 'lock it onto Fitness',
    priorAgentSlug: 'chadwick',
    history: [
      { role: 'assistant', content: [
        '"Welcome Back, King" — Full Body Pump Session (60 min)',
        '1. Bar Squat — 10x25kg, 10x25kg, 10x25kg (cable: none)',
        '2. Bar Row — 10x26kg, 10x26kg, 10x26kg (cable: constant force)',
        '3. Bar Press — 20 reps x 20kg (cable: constant force)'
      ].join('\n') },
      { role: 'user', content: 'ok good looks good' }
    ]
  }))));

  assert.equal(rounds, 0, 'must not wait on Anthropic when the plan is already in history');
  assert.equal(githubCalls, 0, 'must not load logs before emitting the Confirm card');
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal, 'expected a Confirm card built from the last plan in history');
  assert.equal(proposal.record.status, 'planned');
  assert.equal(proposal.record.title, 'Welcome Back, King');
  assert.equal(proposal.record.exercises.length, 3);
  assert.equal(proposal.record.exercises[0].name, 'Bar Squat');
  assert.equal(proposal.record.exercises[0].sets.length, 3);
  assert.equal(proposal.record.exercises[2].sets[0].reps, 20);
});

test('make the workout after Locking it in now emits a Confirm card immediately', async () => {
  let rounds = 0;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => {
        rounds += 1;
        return mockedStream([{ type: 'text', delta: 'That reply got cut off.' }, { type: 'done' }]);
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({
    message: 'make the workout',
    priorAgentSlug: 'chadwick',
    history: [
      { role: 'assistant', content: [
        '1. Bar Squat — 10x25kg, 10x25kg, 10x25kg, 10x25kg (cable: none)',
        '12. One Grip Russian Twist — 20×6kg (cable: none)',
        '13. Bar Press — FINISHER — 20×20kg (cable: constant force)'
      ].join('\n') },
      { role: 'assistant', content: 'Locking it in now.' }
    ]
  }))));

  assert.equal(rounds, 0);
  assert.ok(events.some(event => event.type === 'text' && /On Fitness/i.test(event.delta)));
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal, 'expected a Confirm card instead of a timeout');
  assert.equal(proposal.record.status, 'planned');
  assert.equal(proposal.record.exercises.at(-1).name, 'Bar Press');
  assert.equal(proposal.record.exercises.at(-1).sets[0].reps, 20);
});

test('rejects an unauthenticated request', async () => {
  const handler = createChatHandler({ env: validEnv });
  const response = await handler(new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hi' })
  }));
  assert.equal(response.status, 401);
});

test('rejects an empty or oversized message', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub()
  });
  assert.equal((await handler(request({ message: '' }))).status, 400);
  assert.equal((await handler(request({ message: 'x'.repeat(5000) }))).status, 400);
});

test('reports misconfiguration when ANTHROPIC_API_KEY is absent', async () => {
  const { ANTHROPIC_API_KEY, ...withoutKey } = validEnv;
  const handler = createChatHandler({ env: withoutKey });
  const response = await handler(request({ message: 'hi' }));
  assert.equal(response.status, 503);
});

test('still streams a reply with an empty digest and constraints when GitHub reads fail', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: async () => Response.json({ message: 'server error' }, { status: 500 }),
    createAnthropicClient: () => ({
      streamMessage: () => mockedStream([
        { type: 'text', delta: 'Here to help.' },
        { type: 'done' }
      ])
    })
  });

  const response = await handler(request({ message: 'hi' }));
  assert.equal(response.status, 200);

  const events = contentEvents(await readSse(response));
  assert.deepEqual(events[0], { type: 'agent', slug: 'router' });
  assert.deepEqual(events[1], { type: 'text', delta: 'Here to help.' });
  assert.deepEqual(events[2], { type: 'done' });
});

test('emits record_rejected instead of a proposal for a semantically invalid tool call', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => mockedStream([
        { type: 'tool_call', id: 'call_1', name: 'log_entry', input: {
          type: 'meal', date: '2026-08-01', fields: { meal: 'brunch', calories: 1, protein_g: 1, fat_g: 1 }
        } },
        { type: 'done' }
      ])
    })
  });

  const response = await handler(request({ message: 'Brisket, log breakfast' }));
  const events = contentEvents(await readSse(response));
  const rejected = events.find(event => event.type === 'record_rejected');
  assert.ok(rejected, JSON.stringify(events.map(event => event.type)));
  assert.ok(Array.isArray(rejected.errors) && rejected.errors.length > 0);
  assert.ok(events.some(event => event.type === 'done'));
});

test('log_entry via executeTools returns real validation errors (not fake ok) and emits record_rejected', async () => {
  let toolResult;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        toolResult = await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'meal',
            date: '2026-08-01',
            time: '1:35pm',
            fields: {
              meal: 'snack',
              calories: 202,
              protein_g: 15,
              fat_g: 6,
              sodium_mg: 150,
              calcium_mg: 90,
              polyphenol_score: 2,
              omega3: 'none'
            },
            notes: 'Muscle Nation bar — emulsifier flag'
          }
        });
        assert.ok(toolResult != null, 'log_entry must return a tool_result so the model can retry');
        const parsed = JSON.parse(toolResult);
        assert.equal(parsed.ok, false);
        assert.ok(Array.isArray(parsed.errors) && parsed.errors.some(e => /time must be HH:MM/i.test(e)));
        yield { type: 'text', delta: 'Time format was wrong — retrying.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Brisket, log the protein bar' }))));
  assert.equal(events[0].type, 'agent');
  const rejected = events.find(event => event.type === 'record_rejected');
  assert.ok(rejected, JSON.stringify(events.map(event => event.type)));
  assert.ok(rejected.errors.some(error => /time must be HH:MM/i.test(error)));
  assert.match(toolResult, /retry/i);
  assert.deepEqual(events.find(event => event.type === 'text'), { type: 'text', delta: 'Time format was wrong — retrying.' });
  assert.ok(!events.some(event => event.type === 'record_proposal'));
});

test('does not emit record_rejected when a later log_entry succeeds in the same turn', async () => {
  const FULL_MEAL_FIELDS = {
    meal: 'snack',
    calories: 202,
    protein_g: 15,
    fat_g: 6,
    sodium_mg: 150,
    calcium_mg: 90,
    polyphenol_score: 2,
    omega3: 'none'
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        await executeTools({
          id: 'call_bad',
          name: 'log_entry',
          input: {
            type: 'meal',
            date: '2026-08-01',
            time: '1:35pm',
            fields: FULL_MEAL_FIELDS,
            notes: 'Bad time format'
          }
        });
        await executeTools({
          id: 'call_good',
          name: 'log_entry',
          input: {
            type: 'meal',
            date: '2026-08-01',
            time: '13:35',
            fields: FULL_MEAL_FIELDS,
            notes: 'Muscle Nation bar — emulsifier flag'
          }
        });
        yield { type: 'done' };
      }
    })
  });
  const events = contentEvents(await readSse(await handler(request({ message: 'Brisket, log the bar' }))));
  assert.ok(events.some(event => event.type === 'record_proposal'));
  assert.equal(events.find(event => event.type === 'record_rejected'), undefined);
});

test('log_entry via executeTools emits record_proposal and returns awaiting_confirm', async () => {
  let toolResult;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        toolResult = await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'meal',
            date: '2026-08-01',
            time: '13:35',
            fields: {
              meal: 'snack',
              calories: 202,
              protein_g: 15,
              fat_g: 6,
              sodium_mg: 150,
              calcium_mg: 90,
              polyphenol_score: 2,
              omega3: 'none'
            },
            notes: 'Muscle Nation bar — emulsifier flag'
          }
        });
        const parsed = JSON.parse(toolResult);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.status, 'awaiting_confirm');
        yield { type: 'text', delta: 'Hit Confirm when those macros look right.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Brisket, log the protein bar' }))));
  assert.equal(events[1].type, 'record_proposal');
  assert.equal(events[1].record.type, 'meal');
  assert.equal(events[1].record.meal, 'snack');
  assert.equal(events[1].record.time, '13:35');
  assert.deepEqual(events[2], { type: 'text', delta: 'Hit Confirm when those macros look right.' });
});

test('Vera mind_session log_entry writes immediately and emits record_saved', async () => {
  const puts = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (options?.method === 'PUT') {
      puts.push(url);
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  let toolResult;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        toolResult = await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'mind_session',
            date: '2026-08-01',
            fields: {
              theme: 'Weekend permission',
              closing_question: 'What is the weekend for?',
              insight: 'Exhaustion looking like chaos',
              mood_at_close: 'low'
            }
          }
        });
        yield { type: 'done' };
      }
    })
  });
  const events = contentEvents(await readSse(await handler(request({
    message: 'Vera, that is enough for today',
    priorAgentSlug: 'vera'
  }))));
  const parsed = JSON.parse(toolResult);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'written');
  const saved = events.find(e => e.type === 'record_saved');
  assert.ok(saved, JSON.stringify(events.map(e => e.type)));
  assert.equal(saved.record.type, 'mind_session');
  assert.ok(puts.some(url => url.includes('2026-08-01-session.md')));
  assert.ok(puts.some(url => url.includes('governance')), JSON.stringify(puts));
  assert.equal(events.find(e => e.type === 'record_proposal'), undefined);
});

test('Sara medical append to an existing visit writes immediately and emits record_saved', async () => {
  const medicalPath = 'data/body/2026/08/2026-08-01-medical-stelara-maintenance-injection-0930.md';
  const medicalYaml = `---
schema_version: 1
id: "stored-stelara"
type: "medical"
date: "2026-08-01"
time: "09:30"
created_at: "2026-08-01T09:30:00+10:00"
updated_at: "2026-08-01T09:30:00+10:00"
source: "chat"
title: "Stelara maintenance injection"
record_type: "Prescription"
lane: "prescription"
location_kind: "place"
provider: "Dr Chris Keily"
---
Maintenance dose logged.
`;
  const medicalSha = '1'.repeat(40);
  const puts = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: medicalPath, type: 'blob', sha: medicalSha, size: medicalYaml.length },
          { path: 'central-node.md', type: 'blob', sha: '5'.repeat(40), size: 20 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${medicalSha}`)) {
      return Response.json({
        content: Buffer.from(medicalYaml).toString('base64'),
        encoding: 'base64'
      });
    }
    if (url.includes('/git/blobs/')) {
      return Response.json({ content: Buffer.from('# Purpose\n').toString('base64'), encoding: 'base64' });
    }
    if (options?.method === 'PUT') {
      puts.push(url);
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  let toolResult;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        toolResult = await executeTools({
          id: 'call_1',
          name: 'log_entry',
            input: {
            type: 'medical',
            date: '2026-08-01',
            notes: '[Stelara injection] — mild site pain; same-morning cramping likely diet/anxiety, not Stelara.',
            fields: { title: 'Stelara injection' }
          }
        });
        yield { type: 'done' };
      }
    })
  });
  const events = contentEvents(await readSse(await handler(request({
    message: 'Sara, add that note to the Stelara record',
    priorAgentSlug: 'sara'
  }))));
  const parsed = JSON.parse(toolResult);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'written');
  const saved = events.find(e => e.type === 'record_saved');
  assert.ok(saved, JSON.stringify(events.map(e => e.type)));
  assert.equal(saved.record.type, 'medical');
  assert.match(saved.summary, /Updated medical visit/i);
  assert.ok(puts.some(url => url.includes(medicalPath)));
  assert.equal(events.find(e => e.type === 'record_proposal'), undefined);
});

test('Sara future same-title Stelara dose with AU date stays a new Confirm visit', async () => {
  const medicalPath = 'data/body/2026/08/2026-08-27-medical-stelara-maintenance-injection-0930.md';
  const medicalYaml = `---
schema_version: 1
id: "stored-stelara"
type: "medical"
date: "2026-08-27"
time: "09:30"
created_at: "2026-08-27T09:30:00+10:00"
updated_at: "2026-08-27T09:30:00+10:00"
source: "chat"
title: "Stelara maintenance injection"
record_type: "Prescription"
lane: "prescription"
location_kind: "place"
provider: "Dr Chris Keily"
---
First SC maintenance dose.
`;
  const medicalSha = '1'.repeat(40);
  const puts = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: medicalPath, type: 'blob', sha: medicalSha, size: medicalYaml.length },
          { path: 'central-node.md', type: 'blob', sha: '5'.repeat(40), size: 20 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${medicalSha}`)) {
      return Response.json({
        content: Buffer.from(medicalYaml).toString('base64'),
        encoding: 'base64'
      });
    }
    if (url.includes('/git/blobs/')) {
      return Response.json({ content: Buffer.from('# Purpose\n').toString('base64'), encoding: 'base64' });
    }
    if (options?.method === 'PUT') {
      puts.push(url);
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  let toolResult;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-29T02:05:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        toolResult = await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'medical',
            date: '27/10',
            notes: '[Stelara maintenance] — next 8-weekly SC dose',
            fields: { title: 'Stelara maintenance injection' }
          }
        });
        yield { type: 'done' };
      }
    })
  });
  const events = contentEvents(await readSse(await handler(request({
    message: 'Sara, put the next Stelara in medical logs for 27/10',
    priorAgentSlug: 'sara'
  }))));
  const parsed = JSON.parse(toolResult);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'awaiting_confirm');
  const proposal = events.find(e => e.type === 'record_proposal');
  assert.ok(proposal, JSON.stringify(events.map(e => e.type)));
  assert.equal(proposal.record.date, '2026-10-27');
  assert.equal(proposal.record.title, 'Stelara maintenance injection');
  assert.equal(events.find(e => e.type === 'record_saved'), undefined);
  assert.equal(events.find(e => e.type === 'error'), undefined);
  assert.equal(puts.length, 0);
});

test('Sara medical log_entry survives resolveTree failures without error SSE', async () => {
  let toolResult;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-29T02:05:00Z'),
    fetchImpl: async (url, options) => {
      if (url.includes('/commits/') || url.includes('/git/trees/')) {
        return Response.json({ message: 'boom' }, { status: 503 });
      }
      if (options?.method === 'PUT') {
        return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        toolResult = await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'medical',
            date: '27/10/2026',
            notes: '[Stelara maintenance] — next dose',
            fields: { title: 'Stelara maintenance dose' }
          }
        });
        yield { type: 'done' };
      }
    })
  });
  const events = contentEvents(await readSse(await handler(request({
    message: 'Sara, log next Stelara for 27/10',
    priorAgentSlug: 'sara'
  }))));
  assert.equal(events.find(e => e.type === 'error'), undefined, JSON.stringify(events));
  const parsed = JSON.parse(toolResult);
  // Tree resolve fails for match + for persist path lookup; still must not kill the turn.
  assert.ok(parsed.ok === true || parsed.ok === false, JSON.stringify(parsed));
  if (parsed.ok && parsed.status === 'awaiting_confirm') {
    const proposal = events.find(e => e.type === 'record_proposal');
    assert.ok(proposal, JSON.stringify(events.map(e => e.type)));
    assert.equal(proposal.record.date, '2026-10-27');
  }
});

test('Penelope diary log_entry still awaits confirm', async () => {
  let toolResult;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        toolResult = await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'diary',
            date: '2026-08-01',
            fields: {
              mood: 'good'
            }
          }
        });
        yield { type: 'done' };
      }
    })
  });
  const events = contentEvents(await readSse(await handler(request({
    message: 'Penelope, log today',
    priorAgentSlug: 'penelope'
  }))));
  const parsed = JSON.parse(toolResult);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'awaiting_confirm');
  const proposal = events.find(e => e.type === 'record_proposal');
  assert.ok(proposal, JSON.stringify(events.map(e => e.type)));
  assert.equal(proposal.record.type, 'diary');
  assert.equal(events.find(e => e.type === 'record_saved'), undefined);
});

test('Penelope finalize skips mind blob reads, omits web_search, and force-nudges log_entry', async () => {
  const diaryPath = 'data/mind/2026/07/2026-07-30-diary-2100.md';
  const diarySha = 'a'.repeat(40);
  const diaryContent = [
    '---',
    'schema_version: 1',
    'id: d1',
    'type: diary',
    'date: 2026-07-30',
    'time: "21:00"',
    'created_at: 2026-07-30T21:00:00+10:00',
    'updated_at: 2026-07-30T21:00:00+10:00',
    'source: chat',
    'mood: low',
    'energy: low',
    'mood_score: 3',
    'dayone_sent: false',
    '---',
    'SECRET DIARY PROSE'
  ].join('\n');
  const cnSha = '5'.repeat(40);
  const blobUrls = [];
  const calls = [];

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: async url => {
      if (url.includes('/git/blobs/')) blobUrls.push(url);
      if (url.includes('/commits/')) {
        return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
      }
      if (url.includes('/git/trees/')) {
        return Response.json({
          tree: [
            { path: 'central-node.md', type: 'blob', sha: cnSha, size: 20 },
            { path: diaryPath, type: 'blob', sha: diarySha, size: diaryContent.length }
          ]
        });
      }
      if (url.includes(`/git/blobs/${cnSha}`)) {
        return Response.json({
          encoding: 'base64',
          content: Buffer.from('# Central Node\n', 'utf8').toString('base64')
        });
      }
      if (url.includes(`/git/blobs/${diarySha}`)) {
        return Response.json({
          encoding: 'base64',
          content: Buffer.from(diaryContent, 'utf8').toString('base64')
        });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
    createAnthropicClient: () => ({
      streamMessage: async function* (args) {
        calls.push(args);
        if (calls.length === 1) {
          yield { type: 'text', delta: 'Ah — hold your horses, dear!' };
          yield { type: 'done' };
          return;
        }
        const toolResult = await args.executeTools({
          id: 'forced',
          name: 'log_entry',
          input: {
            type: 'diary',
            date: '2026-08-01',
            fields: { mood: 'low', energy: 'low', mood_score: 3, dayone_sent: false },
            notes: 'Rough day.'
          }
        });
        assert.equal(JSON.parse(toolResult).status, 'awaiting_confirm');
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({
    message: 'Confirm logged',
    priorAgentSlug: 'penelope',
    history: [
      { role: 'assistant', content: 'Alright, board this one goes onto — heading to the vault it goes.' },
      { role: 'user', content: 'Confirm logged' }
    ]
  }))));

  assert.equal(calls.length, 2, 'expected force-nudge second Anthropic round');
  assert.equal(calls[0].tools.some(t => t.name === 'web_search'), false, 'finalize must not offer web_search');
  assert.ok(calls[0].tools.some(t => t.name === 'log_entry'));
  assert.equal(
    blobUrls.some(url => url.includes(diarySha)),
    false,
    `finalize must not read mind diary blobs: ${blobUrls.join(', ')}`
  );
  assert.ok(events.some(e => e.type === 'record_proposal' && e.record?.type === 'diary'));
  assert.equal(events.find(e => e.type === 'error'), undefined);
});

test('Brisket finalize omits web_search and force-nudges meal log_entry', async () => {
  const calls = [];
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* (args) {
        calls.push(args);
        if (calls.length === 1) {
          yield { type: 'text', delta: "It's in the books." };
          yield { type: 'done' };
          return;
        }
        await args.executeTools({
          id: 'forced',
          name: 'log_entry',
          input: {
            type: 'meal',
            date: '2026-08-01',
            fields: {
              meal: 'lunch',
              calories: 500,
              protein_g: 40,
              fat_g: 20,
              saturated_fat_g: 5,
              unsaturated_fat_g: 15,
              carbs_g: 40,
              sugar_g: 5,
              fibre_g: 5,
              sodium_mg: 400,
              calcium_mg: 50,
              polyphenol_score: 2,
              omega3: 'none'
            },
            notes: 'Chicken — on track'
          }
        });
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({
    message: 'Confirm logged',
    priorAgentSlug: 'brisket'
  }))));

  assert.equal(calls.length, 2);
  assert.equal(calls[0].tools.some(t => t.name === 'web_search'), false);
  assert.ok(events.some(e => e.type === 'record_proposal' && e.record?.type === 'meal'));
});

test('Vera flush skips mind blob bodies and strips web_search', async () => {
  const sessionPath = 'data/mind/2026/07/2026-07-30-session.md';
  const sessionSha = 'a'.repeat(40);
  const sessionContent = '---\nschema_version: 1\nid: s1\ntype: mind_session\ndate: 2026-07-30\ntime: "10:00"\ncreated_at: 2026-07-30T10:00:00+10:00\nupdated_at: 2026-07-30T10:00:00+10:00\nsource: chat\ntheme: stress\n---\nbody';
  const cnSha = '5'.repeat(40);
  const blobUrls = [];
  let receivedArgs;

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: async url => {
      if (url.includes('/git/blobs/')) blobUrls.push(url);
      if (url.includes('/commits/')) {
        return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
      }
      if (url.includes('/git/trees/')) {
        return Response.json({
          tree: [
            { path: 'central-node.md', type: 'blob', sha: cnSha, size: 20 },
            { path: sessionPath, type: 'blob', sha: sessionSha, size: sessionContent.length }
          ]
        });
      }
      if (url.includes(`/git/blobs/${cnSha}`)) {
        return Response.json({
          encoding: 'base64',
          content: Buffer.from('# Central Node\n', 'utf8').toString('base64')
        });
      }
      if (url.includes(`/git/blobs/${sessionSha}`)) {
        return Response.json({
          encoding: 'base64',
          content: Buffer.from(sessionContent, 'utf8').toString('base64')
        });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: "That's enough for today — record the session if there is one.",
    priorAgentSlug: 'vera'
  })));

  assert.ok(receivedArgs);
  assert.equal(receivedArgs.tools.some(t => t.name === 'web_search'), false);
  assert.equal(
    blobUrls.some(url => url.includes(sessionSha)),
    false,
    `flush must not read mind session blobs: ${blobUrls.join(', ')}`
  );
});

test('log_entry via executeTools attaches protocol lint warnings to a workout record_proposal', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'workout',
            date: '2026-08-01',
            fields: {
              title: 'Chest and Curls',
              session_kind: 'strength',
              day_type: 'workout_30',
              status: 'planned',
              recovery_flag_next_day: false,
              exercises: [
                { name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] },
                { name: 'Bar Curl', sets: [{ reps: 10, weight_kg: 16, cable_type: 'concentric' }] }
              ]
            }
          }
        });
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Chadwick, plan a quick session' }))));
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal);
  assert.ok(Array.isArray(proposal.warnings) && proposal.warnings.length > 0, JSON.stringify(proposal.warnings));
  assert.ok(proposal.warnings.some(w => /5-9/.test(w)));
  assert.ok(proposal.warnings.some(w => /warmup/i.test(w)));
});

test('log_entry via the tool_call stream fallback also attaches lint warnings to a workout record_proposal', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => (async function* () {
        yield {
          type: 'tool_call', id: 'call_1', name: 'log_entry', input: {
            type: 'workout', date: '2026-08-01', fields: {
              title: 'Chest and Curls', session_kind: 'strength', day_type: 'workout_30',
              status: 'planned', recovery_flag_next_day: false,
              exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }]
            }
          }
        };
        yield { type: 'done' };
      })()
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Chadwick, log a workout' }))));
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal);
  assert.ok(Array.isArray(proposal.warnings) && proposal.warnings.length > 0, JSON.stringify(proposal.warnings));
});

test('a well-formed workout proposal (5-9 exercises, warmup, cable_type, ≤2 intensification tags) carries no lint warnings', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'workout',
            date: '2026-08-01',
            fields: {
              title: 'Full Session',
              session_kind: 'strength',
              day_type: 'workout_45_60',
              status: 'planned',
              recovery_flag_next_day: false,
              exercises: [
                { name: 'Warmup: Light Cable Rows', sets: [{ reps: 15, weight_kg: 5, cable_type: 'concentric' }] },
                { name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] },
                { name: 'Bar Curl', sets: [{ reps: 10, weight_kg: 16, cable_type: 'concentric' }] },
                { name: 'Lat Pulldown', sets: [{ reps: 10, weight_kg: 40, cable_type: 'rowing' }] },
                { name: 'Shoulder Press', sets: [{ reps: 10, weight_kg: 20, cable_type: 'constant_force' }] }
              ]
            }
          }
        });
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Chadwick, plan a full session' }))));
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal);
  assert.deepEqual(proposal.warnings, []);
});

test('a non-workout record_proposal carries no lint warnings', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'meal', date: '2026-08-01', fields: {
              meal: 'snack', calories: 202, protein_g: 15, fat_g: 6, sodium_mg: 150,
              calcium_mg: 90, polyphenol_score: 2, omega3: 'none'
            }
          }
        });
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Brisket, log the protein bar' }))));
  const proposal = events.find(event => event.type === 'record_proposal');
  assert.ok(proposal);
  assert.deepEqual(proposal.warnings, []);
});

test('save_food_library_entry writes the cache to GitHub, emits food_library_saved, and continues the round', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      // Mirrors the real anthropic-client tool-loop: a save_food_library_entry
      // tool_call is routed through executeTools and, since it returns a
      // non-null result, the "model" continues into a second round instead
      // of the turn stopping dead after the save.
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'save_food_library_entry',
          input: {
            name: 'Meatlovers Pizza', brand: 'Domino\'s', servingDescription: '1 slice',
            calories: 250, protein_g: 11, fat_g: 12, sodium_mg: 640
          }
        });
        assert.ok(toolResult != null, 'executeTools must return a tool result so the round continues');
        yield { type: 'text', delta: 'That\'s 250 calories a slice.' };
        yield { type: 'done' };
      }
    })
  });

  const response = await handler(request({ message: 'Brisket, log breakfast pizza' }));
  const events = contentEvents(await readSse(response));

  assert.deepEqual(events[0], { type: 'agent', slug: 'brisket' });
  assert.deepEqual(events[1], { type: 'food_library_saved', name: 'Meatlovers Pizza' });
  assert.deepEqual(events[2], { type: 'text', delta: 'That\'s 250 calories a slice.' });
  assert.deepEqual(events[3], { type: 'done' });

  const putCall = calls.find(call => call.options?.method === 'PUT');
  assert.ok(putCall, 'expected a PUT request to write the food library');
  assert.ok(putCall.url.includes('data/food-library.json'));
  const body = JSON.parse(putCall.options.body);
  assert.equal(body.sha, undefined, 'a brand new food library file must not send a sha precondition');
  const written = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  assert.equal(written.length, 1);
  assert.equal(written[0].name, 'Meatlovers Pizza');
  assert.equal(written[0].verifiedAt, '2026-08-01');
});

test('an invalid save_food_library_entry call returns an error tool result without writing to GitHub', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'All good.' }, { type: 'done' }]);
      }
    })
  });

  const response = await handler(request({ message: 'Brisket, log breakfast' }));
  const events = contentEvents(await readSse(response));
  assert.deepEqual(events, [
    { type: 'agent', slug: 'brisket' },
    { type: 'text', delta: 'All good.' },
    { type: 'done' }
  ]);

  const result = await receivedArgs.executeTools({ id: 'call_1', name: 'save_food_library_entry', input: { name: 'Missing macros' } });
  assert.deepEqual(JSON.parse(result), { ok: false, error: 'invalid_entry' });
  assert.ok(!calls.some(call => call.options?.method === 'PUT'), 'an invalid entry must not trigger a write');
});

test('loads exercise library highlights into Chadwick system prompt', async () => {
  const libraryPath = 'data/exercise-library.json';
  const librarySha = 'f'.repeat(40);
  const libraryContent = JSON.stringify([
    {
      name: 'Bar Press',
      target_area: 'Chest',
      equipment: ['Crossbar'],
      working_weight_kg: 42,
      in_rotation: true
    }
  ]);
  let receivedArgs;
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: libraryPath, type: 'blob', sha: librarySha, size: 100 }] });
    }
    if (url.includes(`/git/blobs/${librarySha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(libraryContent, 'utf8').toString('base64') });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Chadwick, plan a chest session' })));

  assert.match(receivedArgs.system, /Exercise Library/);
  assert.match(receivedArgs.system, /Bar Press/);
  assert.ok(receivedArgs.tools.some(tool => tool.name === 'search_exercise_library'));
  assert.ok(receivedArgs.tools.some(tool => tool.name === 'save_exercise_library_entry'));
  assert.equal(typeof receivedArgs.executeTools, 'function');
  const searchHits = await receivedArgs.executeTools({
    name: 'search_exercise_library',
    id: 'call_1',
    input: { query: 'bar chest' }
  });
  assert.equal(searchHits.length, 1);
  assert.equal(searchHits[0].name, 'Bar Press');
});

test('reports days since last session from the exercise library\'s last_performed fields, at no extra read cost', async () => {
  const libraryPath = 'data/exercise-library.json';
  const librarySha = 'f'.repeat(40);
  const libraryContent = JSON.stringify([
    { name: 'Bar Press', target_area: 'Chest', last_performed: '2026-07-29' }
  ]);
  let receivedArgs;
  const blobFetches = [];
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: libraryPath, type: 'blob', sha: librarySha, size: 100 }] });
    }
    if (url.includes(`/git/blobs/${librarySha}`)) {
      blobFetches.push(url);
      return Response.json({ encoding: 'base64', content: Buffer.from(libraryContent, 'utf8').toString('base64') });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Chadwick, what should I do today?' })));

  assert.match(receivedArgs.system, /3 days since/i);
  assert.match(receivedArgs.system, /smaller default offer|honor that shape/i);
  assert.equal(blobFetches.length, 1, 'the library blob should only be fetched once -- no extra reads for adherence');
});

test('loads latest body composition/measurements into Chadwick\'s prompt via a bounded read (not a full history scan)', async () => {
  const compositionPath = 'data/body/2026/07/2026-07-29-composition.md';
  const compositionSha = 'a'.repeat(40);
  const compositionContent = [
    '---',
    'schema_version: 1', 'id: "composition-1"', 'type: "composition"', 'date: "2026-07-29"', 'time: "08:00"',
    'created_at: "2026-07-29T08:00:00+10:00"', 'updated_at: "2026-07-29T08:00:00+10:00"', 'source: "chat"',
    'weight_kg: 85.5', 'body_fat_pct: 19.0', 'skeletal_muscle_kg: 40.1',
    '---'
  ].join('\n');
  const measurementsPath = 'data/body/2026/07/2026-07-29-measurements.md';
  const measurementsSha = 'b'.repeat(40);
  const measurementsContent = [
    '---',
    'schema_version: 1', 'id: "measurements-1"', 'type: "measurements"', 'date: "2026-07-29"', 'time: "08:00"',
    'created_at: "2026-07-29T08:00:00+10:00"', 'updated_at: "2026-07-29T08:00:00+10:00"', 'source: "chat"',
    'shoulders: 114', 'waist: 80',
    '---'
  ].join('\n');
  const blobCalls = [];
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: compositionPath, type: 'blob', sha: compositionSha, size: 200 },
          { path: measurementsPath, type: 'blob', sha: measurementsSha, size: 200 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${compositionSha}`)) {
      blobCalls.push(compositionSha);
      return Response.json({ encoding: 'base64', content: Buffer.from(compositionContent, 'utf8').toString('base64') });
    }
    if (url.includes(`/git/blobs/${measurementsSha}`)) {
      blobCalls.push(measurementsSha);
      return Response.json({ encoding: 'base64', content: Buffer.from(measurementsContent, 'utf8').toString('base64') });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Chadwick, what should I do today?' })));

  assert.match(receivedArgs.system, /Body composition/);
  assert.match(receivedArgs.system, /85\.5kg/);
  assert.match(receivedArgs.system, /Shoulder:waist ratio/);
  assert.match(receivedArgs.system, /1\.43/);
  assert.equal(blobCalls.length, 2, 'expected exactly one bounded read per body record type, not a history scan');
});

test('loads body state into Brisket\'s prompt too (Phase 3 extends body state beyond Chadwick)', async () => {
  const compositionPath = 'data/body/2026/07/2026-07-29-composition.md';
  const compositionSha = 'a'.repeat(40);
  const compositionContent = [
    '---',
    'schema_version: 1', 'id: "composition-1"', 'type: "composition"', 'date: "2026-07-29"', 'time: "08:00"',
    'created_at: "2026-07-29T08:00:00+10:00"', 'updated_at: "2026-07-29T08:00:00+10:00"', 'source: "chat"',
    'weight_kg: 85.5',
    '---'
  ].join('\n');
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: compositionPath, type: 'blob', sha: compositionSha, size: 200 }] });
    }
    if (url.includes(`/git/blobs/${compositionSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(compositionContent, 'utf8').toString('base64') });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Brisket, what did I eat today?' })));

  assert.match(receivedArgs.system, /Body composition/);
  assert.match(receivedArgs.system, /85\.5kg/);
  assert.match(receivedArgs.system, /your lane/i);
});

test('non-chadwick, non-brisket agents never receive body state in their prompt', async () => {
  const compositionPath = 'data/body/2026/07/2026-07-29-composition.md';
  const compositionSha = 'a'.repeat(40);
  const compositionContent = [
    '---',
    'schema_version: 1', 'id: "composition-1"', 'type: "composition"', 'date: "2026-07-29"', 'time: "08:00"',
    'created_at: "2026-07-29T08:00:00+10:00"', 'updated_at: "2026-07-29T08:00:00+10:00"', 'source: "chat"',
    'weight_kg: 85.5',
    '---'
  ].join('\n');
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: compositionPath, type: 'blob', sha: compositionSha, size: 200 }] });
    }
    if (url.includes(`/git/blobs/${compositionSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(compositionContent, 'utf8').toString('base64') });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Sara, how is my body doing?' })));

  assert.doesNotMatch(receivedArgs.system, /Shoulder:waist ratio/);
  assert.doesNotMatch(receivedArgs.system, /85\.5kg/);
});

test('save_exercise_library_entry writes the cache to GitHub, emits exercise_library_saved, continues the round, and lets a follow-up log_entry produce a record_proposal', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      // Mirrors the real anthropic-client tool-loop: a save_exercise_library_entry
      // tool_call is routed through executeTools and, since it returns a
      // non-null result, the "model" continues into a second round instead
      // of the turn stopping dead after the save -- here it goes on to
      // propose a workout log_entry using the just-saved exercise.
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'save_exercise_library_entry',
          input: { name: 'Bar Press', target_area: 'Chest', default_cable_type: 'concentric' }
        });
        assert.ok(toolResult != null, 'executeTools must return a tool result so the round continues');
        yield { type: 'text', delta: 'Saved Bar Press to your library.' };
        yield { type: 'tool_call', id: 'call_2', name: 'log_entry', input: {
          type: 'workout', date: '2026-08-01', fields: {
            title: 'Chest Session', session_kind: 'strength',
            day_type: 'workout_30', status: 'planned', duration_min: 30,
            exercises: [{ name: 'Bar Press', sets: [{ reps: 10, weight_kg: 42, cable_type: 'concentric' }] }]
          }
        } };
        yield { type: 'done' };
      }
    })
  });

  const response = await handler(request({ message: 'Chadwick, remember Bar Press cues' }));
  const events = contentEvents(await readSse(response));

  assert.deepEqual(events[0], { type: 'agent', slug: 'chadwick' });
  assert.deepEqual(events[1], { type: 'exercise_library_saved', name: 'Bar Press' });
  assert.deepEqual(events[2], { type: 'text', delta: 'Saved Bar Press to your library.' });
  assert.equal(events[3].type, 'record_proposal');
  assert.equal(events[3].record.type, 'workout');
  assert.deepEqual(events[4], { type: 'done' });

  const putCall = calls.find(call => call.options?.method === 'PUT');
  assert.ok(putCall, 'expected a PUT request to write the exercise library');
  assert.ok(putCall.url.includes('data/exercise-library.json'));
  const body = JSON.parse(putCall.options.body);
  assert.equal(body.sha, undefined);
  const written = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  assert.equal(written.length, 1);
  assert.equal(written[0].name, 'Bar Press');
  assert.equal(written[0].default_cable_type, 'concentric');
  assert.ok(written[0].updated_at);
});

test('an invalid save_exercise_library_entry call returns an error tool result without writing to GitHub', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'All good.' }, { type: 'done' }]);
      }
    })
  });

  const response = await handler(request({ message: 'Chadwick, remember an exercise' }));
  const events = contentEvents(await readSse(response));
  assert.deepEqual(events, [
    { type: 'agent', slug: 'chadwick' },
    { type: 'text', delta: 'All good.' },
    { type: 'done' }
  ]);

  const result = await receivedArgs.executeTools({
    id: 'call_1',
    name: 'save_exercise_library_entry',
    input: { name: 'Missing target area' }
  });
  assert.deepEqual(JSON.parse(result), { ok: false, error: 'invalid_entry' });
  assert.ok(!calls.some(call => call.options?.method === 'PUT'), 'an invalid entry must not trigger a write');
});

test('non-chadwick agents do not register exercise library tools', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Brisket, log breakfast' })));

  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'search_exercise_library'));
  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'save_exercise_library_entry'));
  assert.doesNotMatch(receivedArgs.system, /search_exercise_library/);
});

test('Hammond auditSession injects phase contract into the system prompt', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Triage complete. What is weighing on you?' }, { type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'Hammond, Central Node audit',
    auditSession: { kind: 'cn_audit', phase: 'triage', intakeCount: 0 }
  })));

  assert.match(receivedArgs.system, /audit phase contract/i);
  assert.match(receivedArgs.system, /THIS TURN ONLY/i);
  assert.match(receivedArgs.system, /triage/i);
});

test('protocolId steers Brisket’s prompt without dumping a canned description', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Shoot, buddy — let’s keep it gentle today.' }, { type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'Flare-up eating',
    priorAgentSlug: 'brisket',
    protocolId: 'flare-up'
  })));

  assert.match(receivedArgs.system, /Flare-up eating/);
  assert.match(receivedArgs.system, /Active flare-up protocol/);
  assert.match(receivedArgs.system, /in character/);
  assert.doesNotMatch(receivedArgs.system, /hog-tying a polyphenol/i);
});

test('a protocolId for the wrong agent is ignored', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Let’s build it, bro.' }, { type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'next session',
    priorAgentSlug: 'chadwick',
    protocolId: 'flare-up'
  })));

  assert.doesNotMatch(receivedArgs.system, /Flare-up eating/);
  assert.doesNotMatch(receivedArgs.system, /Active flare-up protocol/);
});

test('invalid auditSession is ignored for prompt injection', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Protein target is 120g.' }, { type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'Hammond, what is the protein target?',
    auditSession: { kind: 'cn_audit', phase: 'not-a-phase', intakeCount: 0 }
  })));

  assert.doesNotMatch(receivedArgs.system, /audit phase contract/i);
});

test('a plain trigger message with no auditSession bootstraps a headless audit at triage', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Triage complete. What is weighing on you?' }, { type: 'done' }]);
      }
    })
  });

  const events = await readSse(await handler(request({ message: 'Hammond, run the weekly review' })));
  assert.match(receivedArgs.system, /audit phase contract/i);
  assert.match(receivedArgs.system, /triage/i);

  const phaseEvent = events.find(event => event.type === 'audit_phase');
  assert.deepEqual(phaseEvent, { type: 'audit_phase', phase: 'triage', intakeCount: 0 });

  const nextEvent = events.find(event => event.type === 'audit_next_session');
  assert.deepEqual(nextEvent.session, { kind: 'cn_audit', phase: 'intake', intakeCount: 1 });
});

test('a skip-intake trigger message bootstraps a headless audit straight to stale_drift', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Here is what is stale and drifting.' }, { type: 'done' }]);
      }
    })
  });

  const events = await readSse(await handler(request({ message: 'Hammond, goal audit, skip intake' })));
  assert.match(receivedArgs.system, /say what is stale and what is drifting/i);
  assert.doesNotMatch(receivedArgs.system, /ask exactly ONE intake question/i);

  const phaseEvent = events.find(event => event.type === 'audit_phase');
  assert.deepEqual(phaseEvent, { type: 'audit_phase', phase: 'stale_drift', intakeCount: 3 });

  const nextEvent = events.find(event => event.type === 'audit_next_session');
  assert.deepEqual(nextEvent.session, { kind: 'cn_audit', phase: 'open_loops', intakeCount: 3 });
});

test('audit_next_session stays on lock until append_governance_log actually fires, then clears to null', async () => {
  const stayHandler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => mockedStream([{ type: 'text', delta: 'One non-negotiable for this week.' }, { type: 'done' }])
    })
  });
  const stayEvents = await readSse(await stayHandler(request({
    message: 'Hammond, goal audit, skip intake',
    auditSession: { kind: 'cn_audit', phase: 'lock', intakeCount: 3 }
  })));
  const stayNext = stayEvents.find(event => event.type === 'audit_next_session');
  assert.deepEqual(stayNext.session, { kind: 'cn_audit', phase: 'lock', intakeCount: 3 });

  const clearHandler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: async (url, options) => {
      if (url.includes('/commits/')) {
        return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
      }
      if (url.includes('/git/trees/')) return Response.json({ tree: [] });
      if (options?.method === 'PUT') {
        return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        await executeTools({
          id: 'call_1',
          name: 'append_governance_log',
          input: { entry_type: 'Goal Audit', body: 'Sustainability read for the week.' }
        });
        yield { type: 'text', delta: 'Locked in.' };
        yield { type: 'done' };
      }
    })
  });
  const clearEvents = await readSse(await clearHandler(request({
    message: 'Hammond, goal audit, skip intake',
    auditSession: { kind: 'cn_audit', phase: 'lock', intakeCount: 3 }
  })));
  const clearNext = clearEvents.find(event => event.type === 'audit_next_session');
  assert.deepEqual(clearNext.session, null);
});

test('Hyaluronica registers skincare library and routine membership tools', async () => {
  let receivedArgs;
  const libraryPath = 'data/skincare/product-library.json';
  const membershipPath = 'data/skincare/routine-membership.json';
  const librarySha = 'a'.repeat(40);
  const membershipSha = 'b'.repeat(40);
  const libraryContent = JSON.stringify({
    schema_version: 1,
    products: [
      { id: 'cerave-foaming', name: 'CeraVe Foaming', category: 'Cleanser', notes: 'cleanser' },
      { id: 'spf-50', name: 'La Roche SPF', category: 'Sunscreen', notes: '' }
    ]
  });
  const membershipContent = JSON.stringify({
    schema_version: 1,
    am: { product_ids: ['spf-50'] },
    pm: { product_ids: ['cerave-foaming'] }
  });
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: libraryPath, type: 'blob', sha: librarySha, size: 100 },
          { path: membershipPath, type: 'blob', sha: membershipSha, size: 100 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${librarySha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(libraryContent, 'utf8').toString('base64') });
    }
    if (url.includes(`/git/blobs/${membershipSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(membershipContent, 'utf8').toString('base64')
      });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Hyaluronica, what is on my AM shelf?' })));

  assert.ok(receivedArgs.tools.some(tool => tool.name === 'list_skincare_routines'));
  assert.ok(receivedArgs.tools.some(tool => tool.name === 'search_skincare_library'));
  assert.ok(receivedArgs.tools.some(tool => tool.name === 'save_skincare_library_entry'));
  assert.ok(receivedArgs.tools.some(tool => tool.name === 'set_skincare_routine_membership'));
  assert.match(receivedArgs.system, /search_skincare_library/);
  assert.match(receivedArgs.system, /list_skincare_routines/);
  assert.match(receivedArgs.system, /Current AM\/PM rotation/);
  assert.match(receivedArgs.system, /La Roche SPF/);
  assert.match(receivedArgs.system, /Never invent a routine from shelf status/);
  const searchHits = JSON.parse(await receivedArgs.executeTools({
    name: 'search_skincare_library',
    id: 'call_1',
    input: { query: 'cera cleanser' }
  }));
  assert.equal(searchHits.length, 1);
  assert.equal(searchHits[0].id, 'cerave-foaming');
});

test('list_skincare_routines returns membership-resolved products', async () => {
  let receivedArgs;
  const libraryPath = 'data/skincare/product-library.json';
  const membershipPath = 'data/skincare/routine-membership.json';
  const librarySha = 'a'.repeat(40);
  const membershipSha = 'b'.repeat(40);
  const libraryContent = JSON.stringify({
    schema_version: 1,
    products: [
      { id: 'spf-50', name: 'La Roche SPF', category: 'Sunscreen', notes: '' },
      { id: 'cera-foam', name: 'CeraVe Foaming', category: 'Cleanser', notes: '' }
    ]
  });
  const membershipContent = JSON.stringify({
    schema_version: 1,
    am: { product_ids: ['spf-50'] },
    pm: { product_ids: ['cera-foam'] }
  });
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: libraryPath, type: 'blob', sha: librarySha, size: 100 },
          { path: membershipPath, type: 'blob', sha: membershipSha, size: 100 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${librarySha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(libraryContent, 'utf8').toString('base64') });
    }
    if (url.includes(`/git/blobs/${membershipSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(membershipContent, 'utf8').toString('base64')
      });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Hyaluronica, list my AM routine' })));

  const listed = JSON.parse(await receivedArgs.executeTools({
    name: 'list_skincare_routines',
    id: 'call_list',
    input: { routine: 'am' }
  }));
  assert.deepEqual(listed.am, [{ id: 'spf-50', name: 'La Roche SPF', category: 'Sunscreen' }]);
  assert.equal(listed.pm, undefined);
});

test('non-hyaluronica agents do not register skincare library tools', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Chadwick, plan a chest session' })));

  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'list_skincare_routines'));
  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'search_skincare_library'));
  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'save_skincare_library_entry'));
  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'set_skincare_routine_membership'));
  assert.doesNotMatch(receivedArgs.system, /search_skincare_library/);
  assert.doesNotMatch(receivedArgs.system, /list_skincare_routines/);
  assert.doesNotMatch(receivedArgs.system, /Current AM\/PM rotation/);
});

test('search_skincare_library returns matches and continues the round', async () => {
  const libraryPath = 'data/skincare/product-library.json';
  const librarySha = 'a'.repeat(40);
  const libraryContent = JSON.stringify({
    schema_version: 1,
    products: [{ id: 'korres-cleanser', name: 'Korres Cleanser', notes: '' }]
  });
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: libraryPath, type: 'blob', sha: librarySha, size: 100 }] });
    }
    if (url.includes(`/git/blobs/${librarySha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(libraryContent, 'utf8').toString('base64') });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'search_skincare_library',
          input: { query: 'korres' }
        });
        assert.ok(toolResult != null, 'executeTools must return a tool result so the round continues');
        const hits = JSON.parse(toolResult);
        assert.equal(hits[0].name, 'Korres Cleanser');
        yield { type: 'text', delta: 'Found Korres on your shelf.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Hyaluronica, search Korres' }))));
  assert.deepEqual(events[0], { type: 'agent', slug: 'hyaluronica' });
  assert.deepEqual(events[1], { type: 'text', delta: 'Found Korres on your shelf.' });
  assert.deepEqual(events[2], { type: 'done' });
});

test('save_skincare_library_entry cold-start seeds defaults then writes library with the new product', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'save_skincare_library_entry',
          input: { name: 'La Roche SPF 50', category: 'Sunscreen', notes: 'AM' }
        });
        assert.ok(toolResult != null, 'executeTools must return a tool result so the round continues');
        assert.deepEqual(JSON.parse(toolResult), {
          ok: true,
          id: 'la-roche-spf-50',
          name: 'La Roche SPF 50'
        });
        yield { type: 'text', delta: 'Saved SPF to your shelf.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Hyaluronica, add La Roche SPF 50' }))));
  assert.deepEqual(events[0], { type: 'agent', slug: 'hyaluronica' });
  assert.deepEqual(events[1], { type: 'text', delta: 'Saved SPF to your shelf.' });
  assert.deepEqual(events[2], { type: 'done' });

  const putCall = calls.find(call => call.options?.method === 'PUT');
  assert.ok(putCall, 'expected a PUT request to write the product library');
  assert.ok(putCall.url.includes('data/skincare/product-library.json'));
  const body = JSON.parse(putCall.options.body);
  const written = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  assert.equal(written.schema_version, 1);
  const names = written.products.map(p => p.name);
  assert.ok(names.includes('Azclear Azelaic Acid 20%'), 'cold-start write must include seeded defaults');
  assert.ok(names.includes('La Roche SPF 50'), 'cold-start write must include the new product');
  assert.ok(written.products.length > 1);
  assert.ok(written.products.some(p => p.id === 'la-roche-spf-50'));
});

test('save_skincare_library_entry migrates legacy catalog before writing new product', async () => {
  const catalogPath = 'data/skincare/routine-catalog.json';
  const catalogSha = 'f'.repeat(40);
  const customName = "Grandma's Secret Toner";
  const catalogContent = JSON.stringify({
    schema_version: 1,
    am: { products: [customName], retired: [], extras: [] },
    pm: { products: [], retired: [], extras: [] }
  });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [{ path: catalogPath, type: 'blob', sha: catalogSha, size: 100 }]
      });
    }
    if (url.includes(`/git/blobs/${catalogSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(catalogContent, 'utf8').toString('base64')
      });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'save_skincare_library_entry',
          input: { name: 'La Roche SPF 50', category: 'Sunscreen', notes: 'AM' }
        });
        assert.ok(toolResult != null, 'executeTools must return a tool result so the round continues');
        assert.deepEqual(JSON.parse(toolResult), {
          ok: true,
          id: 'la-roche-spf-50',
          name: 'La Roche SPF 50'
        });
        yield { type: 'text', delta: 'Migrated shelf and saved SPF.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Hyaluronica, add La Roche SPF 50' }))));
  assert.deepEqual(events[0], { type: 'agent', slug: 'hyaluronica' });
  assert.deepEqual(events[1], { type: 'text', delta: 'Migrated shelf and saved SPF.' });
  assert.deepEqual(events[2], { type: 'done' });

  const putCall = calls.find(call => call.options?.method === 'PUT');
  assert.ok(putCall, 'expected a PUT request to write the product library');
  assert.ok(putCall.url.includes('data/skincare/product-library.json'));
  const body = JSON.parse(putCall.options.body);
  const written = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  const names = written.products.map(p => p.name);
  assert.ok(names.includes(customName), 'first Hyaluronica save must include migrated catalog products');
  assert.ok(names.includes('La Roche SPF 50'), 'first Hyaluronica save must include the new product');
  assert.ok(!names.includes('Azclear Azelaic Acid 20%'), 'catalog migrate must not replace with defaults-only seed');
});

test('failed save_skincare_library_entry write leaves in-memory shelf unchanged for the next tool call', async () => {
  let putAttempts = 0;
  let successfulWrite;
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (options?.method === 'PUT') {
      putAttempts += 1;
      if (putAttempts === 1) {
        return Response.json({ message: 'conflict' }, { status: 409 });
      }
      const body = JSON.parse(options.body);
      successfulWrite = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const failed = await executeTools({
          id: 'call_1',
          name: 'save_skincare_library_entry',
          input: { name: 'Ghost Product That Should Not Stick', category: 'Other' }
        });
        assert.deepEqual(JSON.parse(failed), { ok: false, error: 'write_failed' });

        const ok = await executeTools({
          id: 'call_2',
          name: 'save_skincare_library_entry',
          input: { name: 'Real Product Keep Me', category: 'Other' }
        });
        assert.equal(JSON.parse(ok).ok, true);
        yield { type: 'done' };
      }
    })
  });

  await readSse(await handler(request({ message: 'Hyaluronica, try a save' })));
  assert.equal(putAttempts, 2);
  const names = successfulWrite.products.map(p => p.name);
  assert.ok(!names.includes('Ghost Product That Should Not Stick'));
  assert.ok(names.includes('Real Product Keep Me'));
  assert.ok(names.includes('Azclear Azelaic Acid 20%'));
});

test('set_skincare_routine_membership writes routine-membership.json', async () => {
  const calls = [];
  const libraryPath = 'data/skincare/product-library.json';
  const librarySha = 'a'.repeat(40);
  const libraryContent = JSON.stringify({
    schema_version: 1,
    products: [{ id: 'cerave-foaming', name: 'CeraVe Foaming', notes: '' }]
  });
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: libraryPath, type: 'blob', sha: librarySha, size: 100 }] });
    }
    if (url.includes(`/git/blobs/${librarySha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(libraryContent, 'utf8').toString('base64') });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'e'.repeat(40) }, commit: { sha: 'f'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const unknown = await executeTools({
          id: 'call_0',
          name: 'set_skincare_routine_membership',
          input: { routine: 'am', product_id: 'missing', op: 'add' }
        });
        assert.deepEqual(JSON.parse(unknown), { ok: false, error: 'unknown_product' });

        const toolResult = await executeTools({
          id: 'call_1',
          name: 'set_skincare_routine_membership',
          input: { routine: 'pm', product_id: 'cerave-foaming', op: 'add' }
        });
        assert.ok(toolResult != null);
        assert.deepEqual(JSON.parse(toolResult), {
          ok: true,
          routine: 'pm',
          product_ids: ['cerave-foaming']
        });
        yield { type: 'text', delta: 'Added CeraVe to PM.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Hyaluronica, put CeraVe on PM' }))));
  assert.deepEqual(events[0], { type: 'agent', slug: 'hyaluronica' });
  assert.deepEqual(events[1], { type: 'text', delta: 'Added CeraVe to PM.' });

  const putCall = calls.find(call => call.options?.method === 'PUT');
  assert.ok(putCall, 'expected a PUT request to write routine membership');
  assert.ok(putCall.url.includes('data/skincare/routine-membership.json'));
  const body = JSON.parse(putCall.options.body);
  const written = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  assert.deepEqual(written.pm.product_ids, ['cerave-foaming']);
  assert.deepEqual(written.am.product_ids, []);
});

const HAMMOND_CN_FIXTURE = `# Purpose
Purpose body.

## 📏 Writing Rules (All Agents Must Follow)
Rule one.

## 🤖 Agent Directory
- Hammond

## 🔴 Current Constraints & Priorities
- Steroid taper active

## ⚡ Today's Status — Monday, 1 January 2026
**Flags:** Quiet day.
**Energy:** Ok.

## 📅 This Week
- Lift Mon

## 📊 This Month
### Active Goals
- Sleep by 11

## 📈 Long-Term Trends & Patterns
- Sleep debt rising

## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: training day

## 📝 Recent Agent Actions
- 1 Jan — Brisket: meal logged
`;

test('Hammond registers CN patch and governance tools and gets full CN in system prompt', async () => {
  let receivedArgs;
  const cnSha = '5'.repeat(40);
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [{ path: 'central-node.md', type: 'blob', sha: cnSha, size: HAMMOND_CN_FIXTURE.length }]
      });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(HAMMOND_CN_FIXTURE, 'utf8').toString('base64')
      });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Hammond, what should I focus on?' })));

  assert.ok(receivedArgs.tools.some(tool => tool.name === 'propose_central_node_patch'));
  assert.ok(receivedArgs.tools.some(tool => tool.name === 'append_governance_log'));
  assert.match(receivedArgs.system, /propose_central_node_patch/);
  assert.match(receivedArgs.system, /append_governance_log/);
  assert.match(receivedArgs.system, /full Central Node/i);
  assert.match(receivedArgs.system, /This Week/);
  assert.match(receivedArgs.system, /Lift Mon/);
});

test('Hammond prompt-time Central Node rolls a stale This Week heading before buildSystemPrompt', async () => {
  let receivedArgs;
  const staleCn = `# Purpose
Purpose body.

## 📏 Writing Rules (All Agents Must Follow)
Rule one.

## 🤖 Agent Directory
- Hammond

## 🔴 Current Constraints & Priorities
- Steroid taper active

## ⚡ Today's Status — Saturday, 1 August 2026
**Flags:** Quiet day.

## 📅 This Week (16 – 22 June 2026)
- Stale June body must not reach the prompt.

## 📊 This Month (April 2026)
- Stale April body must not reach the prompt.

## 📈 Long-Term Trends & Patterns
- Sleep debt rising

## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: training day

## 📝 Recent Agent Actions
- 1 Aug — Brisket: meal logged
`;
  const cnSha = '5'.repeat(40);
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [{ path: 'central-node.md', type: 'blob', sha: cnSha, size: staleCn.length }]
      });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(staleCn, 'utf8').toString('base64')
      });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Hammond, what should I focus on?' })));

  assert.match(receivedArgs.system, /This Week \(27 Jul – 2 Aug 2026\)/);
  assert.match(receivedArgs.system, /This Month \(August 2026\)/);
  assert.doesNotMatch(receivedArgs.system, /Stale June body/);
  assert.doesNotMatch(receivedArgs.system, /Stale April body/);
});

test('non-hammond agents do not register Hammond CN or governance tools', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Brisket, log lunch' })));

  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'propose_central_node_patch'));
  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'append_governance_log'));
  assert.doesNotMatch(receivedArgs.system, /propose_central_node_patch/);
  assert.doesNotMatch(receivedArgs.system, /append_governance_log/);
});

test('propose_central_node_patch auto cross_agent append writes central-node.md', async () => {
  const cnSha = '5'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [{ path: 'central-node.md', type: 'blob', sha: cnSha, size: HAMMOND_CN_FIXTURE.length }]
      });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(HAMMOND_CN_FIXTURE, 'utf8').toString('base64')
      });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'propose_central_node_patch',
          input: {
            section: 'cross_agent',
            op: 'append_line',
            payload: {
              text: '- Hammond→Brisket: hold surplus tonight',
              summary: 'Direct Brisket to hold surplus'
            }
          }
        });
        assert.ok(toolResult != null);
        assert.deepEqual(JSON.parse(toolResult), {
          ok: true,
          status: 'applied',
          summary: 'Direct Brisket to hold surplus'
        });
        yield { type: 'text', delta: 'Posted the handoff.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Hammond, post a cross-agent surplus hold' }))));
  assert.deepEqual(events[0], { type: 'agent', slug: 'hammond' });
  assert.deepEqual(events[1], {
    type: 'central_node_patched',
    summary: 'Direct Brisket to hold surplus',
    risk: 'auto'
  });
  assert.deepEqual(events[2], { type: 'text', delta: 'Posted the handoff.' });

  const putCall = calls.find(call => call.options?.method === 'PUT');
  assert.ok(putCall, 'expected a PUT request to write central-node.md');
  assert.ok(putCall.url.includes('central-node.md'));
  const body = JSON.parse(putCall.options.body);
  const written = Buffer.from(body.content, 'base64').toString('utf8');
  assert.match(written, /Hammond→Brisket: hold surplus tonight/);
  assert.match(body.message, /chore\(cn\): Direct Brisket to hold surplus/);
});

test('propose_central_node_patch confirm-class does not write central-node.md, persists to the pending queue, and emits cn_patch_proposal with an id from executeTools', async () => {
  const cnSha = '5'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [{ path: 'central-node.md', type: 'blob', sha: cnSha, size: HAMMOND_CN_FIXTURE.length }]
      });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(HAMMOND_CN_FIXTURE, 'utf8').toString('base64')
      });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    // Mirror anthropic-client: when executeTools returns non-null, swallow tool_call
    // (do not yield it). Confirm SSE must come from inside executeTools via send().
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const toolCall = {
          type: 'tool_call',
          id: 'call_1',
          name: 'propose_central_node_patch',
          input: {
            section: 'constraints',
            op: 'delete_lines',
            payload: {
              match: 'Steroid taper',
              summary: 'Remove taper constraint'
            }
          }
        };
        const toolResult = await executeTools(toolCall);
        assert.ok(toolResult != null, 'confirm patch must return a tool_result so the round continues');
        const parsedResult = JSON.parse(toolResult);
        assert.equal(parsedResult.ok, true);
        assert.equal(parsedResult.status, 'awaiting_confirm');
        assert.equal(parsedResult.summary, 'Remove taper constraint');
        assert.match(parsedResult.pendingId, /^cnp_[0-9a-f]{12}$/);
        // Intentionally do not yield toolCall — production anthropic-client continues past it.
        yield { type: 'text', delta: 'Queued for confirm.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Hammond, clear the taper flag' }))));
  assert.deepEqual(events[0], { type: 'agent', slug: 'hammond' });
  assert.equal(events[1].type, 'cn_patch_proposal');
  assert.equal(events[1].patch.section, 'constraints');
  assert.equal(events[1].patch.op, 'delete_lines');
  assert.equal(events[1].patch.payload.match, 'Steroid taper');
  assert.match(events[1].id, /^cnp_[0-9a-f]{12}$/);
  assert.deepEqual(events[2], { type: 'text', delta: 'Queued for confirm.' });
  assert.ok(!events.some(event => event.type === 'tool_call'), 'swallowed tool_call must not appear in SSE');

  assert.equal(
    calls.filter(call => call.options?.method === 'PUT' && call.url.includes('central-node.md')).length,
    0,
    'confirm-class CN patch must not write central-node.md'
  );
  const queuePut = calls.find(call => call.options?.method === 'PUT' && call.url.includes('pending-cn-patches.json'));
  assert.ok(queuePut, 'expected a PUT request writing the pending patch queue');
  const queueBody = JSON.parse(queuePut.options.body);
  const queueContent = JSON.parse(Buffer.from(queueBody.content, 'base64').toString('utf8'));
  assert.equal(queueContent.length, 1);
  assert.equal(queueContent[0].patch.payload.summary, 'Remove taper constraint');
  assert.equal(queueContent[0].slug, 'hammond');
});

test('append_governance_log cold-starts empty log then writes governance-log.md', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };

  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'append_governance_log',
          input: {
            entry_type: "Coach's Notes",
            body: 'Hold surplus through the weekend.',
            title: 'Surplus hold'
          }
        });
        assert.ok(toolResult != null);
        assert.deepEqual(JSON.parse(toolResult), {
          ok: true,
          path: 'data/governance/governance-log.md'
        });
        yield { type: 'text', delta: 'Logged the note.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({ message: 'Hammond, note the surplus hold' }))));
  assert.deepEqual(events[0], { type: 'agent', slug: 'hammond' });
  assert.deepEqual(events[1], { type: 'governance_log_appended', entryType: "Coach's Notes" });
  assert.deepEqual(events[2], { type: 'text', delta: 'Logged the note.' });

  const putCall = calls.find(call => call.options?.method === 'PUT');
  assert.ok(putCall, 'expected a PUT request to write governance log');
  assert.ok(putCall.url.includes('data/governance/governance-log.md'));
  const body = JSON.parse(putCall.options.body);
  const written = Buffer.from(body.content, 'base64').toString('utf8');
  assert.match(written, /# Governance Log/);
  assert.match(written, /## 2026-08-01 — Coach's Notes/);
  assert.match(written, /Hold surplus through the weekend/);
  assert.match(written, /\*\*Title:\*\* Surplus hold/);
});

test('propose_central_node_patch returns error JSON when central-node.md is missing', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'propose_central_node_patch',
          input: {
            section: 'cross_agent',
            op: 'append_line',
            payload: {
              text: '- Hammond→Brisket: hold',
              summary: 'Direct Brisket'
            }
          }
        });
        assert.deepEqual(JSON.parse(toolResult), { ok: false, error: 'central_node_missing' });
        yield { type: 'text', delta: 'CN missing.' };
        yield { type: 'done' };
      }
    })
  });

  const events = contentEvents(await readSse(await handler(request({
    message: 'Hammond, post the handoff',
    priorAgentSlug: 'hammond'
  }))));
  assert.deepEqual(events[0], { type: 'agent', slug: 'hammond' });
  assert.deepEqual(events[1], { type: 'text', delta: 'CN missing.' });
});

const HAMMOND_DIARY_PATH = 'data/mind/2026/07/2026-07-30-diary.md';
const HAMMOND_DIARY_SHA = 'a'.repeat(40);
const HAMMOND_DIARY_CONTENT = [
  '---',
  'schema_version: 1',
  'id: diary-brief-1',
  'type: diary',
  'date: 2026-07-30',
  'time: "21:40"',
  'created_at: 2026-07-30T21:40:00+10:00',
  'updated_at: 2026-07-30T21:40:00+10:00',
  'source: test_fixture',
  'mood_score: 4',
  'mood: low',
  'energy: low',
  'tags: [weekend]',
  'system_note: Weekend collapse',
  'dayone_sent: false',
  '---',
  'SECRET PROSE ADAM SHOULD NOT SEE'
].join('\n');

function hammondFetchWithDiary(cnSha = '5'.repeat(40)) {
  const blobUrls = [];
  const fetchImpl = async url => {
    if (url.includes('/git/blobs/')) blobUrls.push(url);
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: 'central-node.md', type: 'blob', sha: cnSha, size: HAMMOND_CN_FIXTURE.length },
          { path: HAMMOND_DIARY_PATH, type: 'blob', sha: HAMMOND_DIARY_SHA, size: HAMMOND_DIARY_CONTENT.length }
        ]
      });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(HAMMOND_CN_FIXTURE, 'utf8').toString('base64')
      });
    }
    if (url.includes(`/git/blobs/${HAMMOND_DIARY_SHA}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(HAMMOND_DIARY_CONTENT, 'utf8').toString('base64')
      });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  return { fetchImpl, blobUrls };
}

test('Hammond 5e/6b brief injects diary metadata from the CN window without quoting prose', async () => {
  let receivedArgs;
  const { fetchImpl, blobUrls } = hammondFetchWithDiary();
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'Hammond, monthly three-way brief',
    priorAgentSlug: 'hammond'
  })));

  assert.match(receivedArgs.system, /Weekend collapse/);
  assert.doesNotMatch(receivedArgs.system, /SECRET PROSE/);
  assert.ok(blobUrls.some(url => url.includes(HAMMOND_DIARY_SHA)));
});

test('ordinary Hammond turns skip the 5e/6b diary digest but still get a system_note tail', async () => {
  let receivedArgs;
  const { fetchImpl, blobUrls } = hammondFetchWithDiary();
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'Hammond, what should I focus on?',
    priorAgentSlug: 'hammond'
  })));

  assert.doesNotMatch(receivedArgs.system, /Diary \(metadata only/);
  assert.match(receivedArgs.system, /Recent day-to-day signal \(system_note, metadata only\)/);
  assert.match(receivedArgs.system, /Weekend collapse/);
  assert.doesNotMatch(receivedArgs.system, /SECRET PROSE/);
  assert.ok(blobUrls.some(url => url.includes(HAMMOND_DIARY_SHA)), 'CN window still reads the mind blob');
});

const VERA_SESSION_PATH = 'data/mind/2026/08/2026-08-01-session.md';
const VERA_SESSION_SHA = 'b'.repeat(40);
const VERA_SESSION_CONTENT = [
  '---',
  'schema_version: 1',
  'id: mind_session-2026-08-01-5e2cc1',
  'type: mind_session',
  'date: 2026-08-01',
  'time: "17:57"',
  'created_at: 2026-08-01T17:57:00+10:00',
  'updated_at: 2026-08-01T17:57:00+10:00',
  'source: chat',
  'session_type: deep-dive',
  'theme: fear of authority beneath the competence ledger',
  'insight: Nationals outcome would not matter',
  'observation: not enough showed up twice',
  'closing_question: what getting in trouble feels like in the body',
  'cross_agent_note: "Vera→Hammond: open with the body question"',
  '---',
  'Compact session body.'
].join('\n');

test('Vera chat exposes get_mind_session and search_mind_records repo tools', async () => {
  let receivedArgs;
  const fetchImpl = async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [{ path: VERA_SESSION_PATH, type: 'blob', sha: VERA_SESSION_SHA, size: VERA_SESSION_CONTENT.length }]
      });
    }
    if (url.includes(`/git/blobs/${VERA_SESSION_SHA}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(VERA_SESSION_CONTENT, 'utf8').toString('base64')
      });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'Vera, did today\'s session log?',
    priorAgentSlug: 'vera'
  })));

  assert.ok(receivedArgs.tools.some(tool => tool.name === 'get_mind_session'));
  assert.ok(receivedArgs.tools.some(tool => tool.name === 'search_mind_records'));
  assert.match(receivedArgs.system, /Today's mind_session/);
  assert.match(receivedArgs.system, /get_mind_session/);

  const loaded = JSON.parse(await receivedArgs.executeTools({
    id: 'call_get',
    name: 'get_mind_session',
    input: { date: '2026-08-01' }
  }));
  assert.equal(loaded.found, true);
  assert.equal(loaded.id, 'mind_session-2026-08-01-5e2cc1');
  assert.match(loaded.theme, /fear of authority/);

  const search = JSON.parse(await receivedArgs.executeTools({
    id: 'call_search',
    name: 'search_mind_records',
    input: { query: 'authority nationals', record_types: ['mind_session'] }
  }));
  assert.equal(search.ok, true);
  assert.ok(search.results.some(hit => hit.date === '2026-08-01'));
});

test('non-Vera agents do not receive mind repo read tools', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({ message: 'Brisket, log lunch', priorAgentSlug: 'brisket' })));

  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'get_mind_session'));
  assert.ok(!receivedArgs.tools.some(tool => tool.name === 'search_mind_records'));
});
