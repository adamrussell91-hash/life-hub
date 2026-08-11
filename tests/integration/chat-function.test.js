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
  assert.equal(events[1].type, 'record_rejected');
  assert.ok(Array.isArray(events[1].errors) && events[1].errors.length > 0);
  assert.deepEqual(events[2], { type: 'done' });
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
  assert.equal(events[1].type, 'record_rejected');
  assert.ok(events[1].errors.some(e => /time must be HH:MM/i.test(e)));
  assert.deepEqual(events[2], { type: 'text', delta: 'Time format was wrong — retrying.' });
  assert.ok(!events.some(e => e.type === 'record_proposal'));
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
  assert.match(receivedArgs.system, /lower the bar/i);
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

test('propose_central_node_patch confirm-class does not write and emits cn_patch_proposal from executeTools', async () => {
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
        assert.deepEqual(JSON.parse(toolResult), {
          ok: true,
          status: 'awaiting_confirm',
          summary: 'Remove taper constraint'
        });
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
  assert.deepEqual(events[2], { type: 'text', delta: 'Queued for confirm.' });
  assert.ok(!events.some(event => event.type === 'tool_call'), 'swallowed tool_call must not appear in SSE');

  assert.equal(
    calls.filter(call => call.options?.method === 'PUT').length,
    0,
    'confirm-class CN patch must not write'
  );
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
  assert.deepEqual(events[1], { type: 'text', delta: 'Logged the note.' });

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
