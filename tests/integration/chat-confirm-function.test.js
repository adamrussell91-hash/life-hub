import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatConfirmHandler } from '../../netlify/functions/chat-confirm.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

const candidate = { type: 'meal', date: '2026-08-01', fields: { meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 } };

function request(body, headers = {}) {
  return new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function githubFetchStub({ status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options?.method === 'PUT') {
      return status === 200
        ? Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } })
        : Response.json({ message: 'conflict' }, { status });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  return { calls, fetchImpl };
}

test('validates, writes, and returns the canonical path for a new record', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  // NOTE: the session fixture above is issued at 2026-08-01T00:00:00Z with an 8h TTL
  // (SESSION_MS in auth-security.mjs), i.e. valid only through 2026-08-01T08:00:00Z
  // (2026-08-01T18:00:00+10:00 Sydney time). The plan's reference value of
  // 2026-08-01T20:00:00+10:00 (10:00Z) falls outside that TTL and would make this
  // request 401 before ever reaching the write path, so it's moved earlier within
  // the session's valid window while keeping the +10:00 Sydney offset.
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate, slug: 'breakfast' }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.path, 'data/nutrition/2026/08/2026-08-01-breakfast.md');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).sha, undefined);
});

test('reports a validation failure without contacting GitHub', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  // NOTE: `now` must be mocked here too. The fixed `session` token above was issued at
  // 2026-08-01T00:00:00Z with an 8h TTL (see auth-security.mjs SESSION_MS). Without a
  // `now` override this handler falls back to the real Date.now(), which is well past
  // that expiry on any real run date, so the session check would fail first and the
  // response would be 401 instead of the intended 400. Mocking `now` inside the
  // session's TTL window keeps this test isolated to the validation branch, same fix
  // Task 10 applied to its own fixtures.
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T06:00:00Z') });
  const invalid = { type: 'meal', date: '2026-08-01', fields: { meal: 'brunch', calories: 1, protein_g: 1, fat_g: 1 } };

  const response = await handler(request({ candidate: invalid, slug: 'breakfast' }));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('maps a write conflict to 409 for the client to prompt an overwrite', async () => {
  const { fetchImpl } = githubFetchStub({ status: 422 });
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T06:00:00Z') });
  const response = await handler(request({ candidate, slug: 'breakfast' }));
  assert.equal(response.status, 409);
});

test('overwrite:true resolves the existing blob sha and sends it as the update precondition', async () => {
  const path = 'data/nutrition/2026/08/2026-08-01-breakfast.md';
  const existingSha = 'e'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path, type: 'blob', sha: existingSha }] });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T06:00:00Z') });

  const response = await handler(request({ candidate, slug: 'breakfast', overwrite: true }));
  assert.equal(response.status, 200);

  const putCall = calls.find(call => call.options?.method === 'PUT');
  assert.equal(JSON.parse(putCall.options.body).sha, existingSha);
});

test('appends a one-line entry to the central node running log after a successful write', async () => {
  const centralNodeSha = 'f'.repeat(40);
  const centralNodeContent = [
    '# Purpose',
    'Intro.',
    '---',
    "## ⚡ Today's Status (Friday 19 June 2026)",
    '**Health:** Stable.',
    '**Nutrition:** No data.',
    '---',
    '## 📝 Recent Agent Actions',
    '**30 Jul:** Chadwick: Chest and Curls session completed and logged.'
  ].join('\n');
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: 'central-node.md', type: 'blob', sha: centralNodeSha }] });
    }
    if (url.includes(`/git/blobs/${centralNodeSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(centralNodeContent, 'utf8').toString('base64') });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate, slug: 'breakfast' }));
  assert.equal(response.status, 200);

  const putCalls = calls.filter(call => call.options?.method === 'PUT');
  assert.equal(putCalls.length, 2, 'expected one PUT for the record and one for the central node log');
  const centralNodePut = putCalls.find(call => call.url.includes('central-node.md'));
  assert.ok(centralNodePut, 'expected a PUT to central-node.md');
  assert.equal(JSON.parse(centralNodePut.options.body).sha, centralNodeSha);

  const writtenContent = Buffer.from(JSON.parse(centralNodePut.options.body).content, 'base64').toString('utf8');
  assert.match(writtenContent, /\*\*1 Aug:\*\* Brisket Lasso: Logged breakfast \(520 kcal, 38g protein, 12g fat\)\./);
  assert.match(writtenContent, /Chest and Curls session completed and logged/, 'must preserve the existing log rather than replacing it');
  assert.match(writtenContent, /## ⚡ Today's Status \([^)]*1 August 2026\)/);
  assert.match(writtenContent, /\*\*Nutrition:\*\* 520 kcal, 38g P, 12g F\./);
});

test('appends Chadwick→Brisket Day Type on completed workout confirm', async () => {
  const workoutCandidate = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Chest and Curls',
      day_type: 'workout_30',
      status: 'completed',
      duration_min: 26,
      focus: ['chest', 'arms'],
      recovery_flag_next_day: false,
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }] }],
      pain_flags: []
    }
  };
  const centralNodeSha = 'f'.repeat(40);
  const centralNodeContent = [
    '# Purpose',
    'Intro.',
    '---',
    "## ⚡ Today's Status (Friday 19 June 2026)",
    '**Health:** Stable.',
    '---',
    '## 🤝 Cross-Agent Coordination',
    '- Keep prior directives.',
    '---',
    '## 📝 Recent Agent Actions',
    '**30 Jul:** Chadwick: prior session.'
  ].join('\n');
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: 'central-node.md', type: 'blob', sha: centralNodeSha }] });
    }
    if (url.includes(`/git/blobs/${centralNodeSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(centralNodeContent, 'utf8').toString('base64') });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate: workoutCandidate, slug: 'chest-curls' }));
  assert.equal(response.status, 200);

  const centralNodePut = calls.find(call => call.options?.method === 'PUT' && call.url.includes('central-node.md'));
  assert.ok(centralNodePut, 'expected a PUT to central-node.md');
  const writtenContent = Buffer.from(JSON.parse(centralNodePut.options.body).content, 'base64').toString('utf8');
  assert.match(writtenContent, /Chadwick→Brisket: 1 Aug session completed, Chest and Curls\. Set Day Type to 30-min Workout\./);
  assert.match(writtenContent, /Keep prior directives/);
});

test('rejects an unauthenticated request', async () => {
  const handler = createChatConfirmHandler({ env: validEnv });
  const response = await handler(new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidate, slug: 'breakfast' })
  }));
  assert.equal(response.status, 401);
});
