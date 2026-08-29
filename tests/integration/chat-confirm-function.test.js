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

const candidate = {
  type: 'meal',
  date: '2026-08-01',
  fields: {
    meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420,
    calcium_mg: 210, polyphenol_score: 4, omega3: 'low'
  }
};

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
  const invalid = { type: 'meal', date: '2026-08-01', fields: { meal: 'brunch', calories: 1, protein_g: 1, fat_g: 1, sodium_mg: 1 } };

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

test('creates central-node.md from the app seed when the private repo is missing it', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [] });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate, slug: 'breakfast' }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.data.centralNodeUpdated, true);

  const putCalls = calls.filter(call => call.options?.method === 'PUT');
  assert.equal(putCalls.length, 2, 'expected meal write plus central-node create');
  const centralNodePut = putCalls.find(call => call.url.includes('central-node.md'));
  assert.ok(centralNodePut);
  assert.equal(JSON.parse(centralNodePut.options.body).sha, undefined, 'create must not send a sha');

  const writtenContent = Buffer.from(JSON.parse(centralNodePut.options.body).content, 'base64').toString('utf8');
  assert.match(writtenContent, /## ⚡ Today's Status/);
  assert.match(writtenContent, /\*\*Nutrition:\*\* 520 kcal, 38g P, 12g F, 420mg Na, 210mg Ca, polyphenol 4\./);
  assert.match(writtenContent, /\*\*1 Aug:\*\* Brisket Lasso: Logged breakfast/);
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
    '**1 Aug:** Chadwick: Chest and Curls session completed and logged.'
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
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.data.centralNodeUpdated, true);

  const putCalls = calls.filter(call => call.options?.method === 'PUT');
  assert.equal(putCalls.length, 2, 'expected one PUT for the record and one for the central node log');
  const centralNodePut = putCalls.find(call => call.url.includes('central-node.md'));
  assert.ok(centralNodePut, 'expected a PUT to central-node.md');
  assert.equal(JSON.parse(centralNodePut.options.body).sha, centralNodeSha);

  const writtenContent = Buffer.from(JSON.parse(centralNodePut.options.body).content, 'base64').toString('utf8');
  assert.match(writtenContent, /\*\*1 Aug:\*\* Brisket Lasso: Logged breakfast \(520 kcal, 38g protein, 12g fat\)\./);
  assert.match(writtenContent, /Chest and Curls session completed and logged/, 'must preserve the existing log rather than replacing it');
  assert.match(writtenContent, /## ⚡ Today's Status \([^)]*1 August 2026\)/);
  assert.match(writtenContent, /\*\*Nutrition:\*\* 520 kcal, 38g P, 12g F, 420mg Na, 210mg Ca, polyphenol 4\./);
});

test('confirm still succeeds and reports centralNodeUpdated:false when the central node blob cannot be decoded', async () => {
  const centralNodeSha = 'f'.repeat(40);
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
      return Response.json({ encoding: 'base64', content: '***not valid base64***' });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate, slug: 'breakfast' }));
  const payload = await response.json();

  assert.equal(response.status, 200, 'the meal write must still succeed even when Central Node sync cannot decode');
  assert.equal(payload.data.centralNodeUpdated, false);

  const putCalls = calls.filter(call => call.options?.method === 'PUT');
  assert.equal(putCalls.length, 1, 'only the meal write should happen; central-node.md must not be written on a decode failure');
});

test('appends Chadwick→Brisket Day Type on completed workout confirm', async () => {
  const workoutCandidate = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Chest and Curls',
      session_kind: 'strength',
      day_type: 'workout_30',
      status: 'completed',
      duration_min: 26,
      focus: ['chest', 'arms'],
      recovery_flag_next_day: false,
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }],
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
  // Day Type is derived from the workout record itself, so no directive is written.
  assert.doesNotMatch(writtenContent, /Set Day Type to/);
  assert.match(writtenContent, /\*\*Exercise:\*\* Chest and Curls · 26 min · completed\./);
  assert.match(writtenContent, /Keep prior directives/);
});

test('upserts a fitness template after a completed workout confirm', async () => {
  const workoutCandidate = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Chest and Curls',
      session_kind: 'strength',
      day_type: 'workout_30',
      status: 'completed',
      duration_min: 26,
      focus: ['chest', 'arms'],
      recovery_flag_next_day: false,
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }],
      pain_flags: []
    }
  };
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
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate: workoutCandidate, slug: 'chest-curls' }));
  assert.equal(response.status, 200);

  const templatePut = calls.find(call => call.options?.method === 'PUT' && call.url.includes('data/fitness/templates/chest-and-curls.md'));
  assert.ok(templatePut, 'expected a PUT to the fitness template path');
  const writtenContent = Buffer.from(JSON.parse(templatePut.options.body).content, 'base64').toString('utf8');
  assert.match(writtenContent, /cable_type/);
  assert.match(writtenContent, /"concentric"/);
});

test('upserts exercise library progress and reports a PB after a completed workout confirm', async () => {
  const workoutCandidate = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Chest and Curls',
      session_kind: 'strength',
      day_type: 'workout_30',
      status: 'completed',
      duration_min: 26,
      focus: ['chest', 'arms'],
      recovery_flag_next_day: false,
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }],
      pain_flags: []
    }
  };
  const libraryContent = JSON.stringify([
    { name: 'Chest Press', target_area: 'Chest', best_weight_kg: 30, times_performed: 2 }
  ]);
  const librarySha = 'ee'.repeat(20);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: 'data/exercise-library.json', type: 'blob', sha: librarySha }] });
    }
    if (url.includes(`/git/blobs/${librarySha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(libraryContent, 'utf8').toString('base64') });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate: workoutCandidate, slug: 'chest-curls' }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.personalBests, [
    { name: 'Chest Press', best_weight_kg: 32, previous_best_weight_kg: 30 }
  ]);

  const libraryPuts = calls.filter(call => call.options?.method === 'PUT' && call.url.includes('data/exercise-library.json'));
  assert.equal(libraryPuts.length, 1, 'expected exactly one write to the exercise library (single read + single write)');
  const written = JSON.parse(Buffer.from(JSON.parse(libraryPuts[0].options.body).content, 'base64').toString('utf8'));
  assert.equal(written[0].best_weight_kg, 32);
  assert.equal(written[0].times_performed, 3);
  assert.equal(written[0].last_performed, '2026-08-01');
  assert.equal(JSON.parse(libraryPuts[0].options.body).sha, librarySha);
});

test('does not touch the exercise library for a planned (not completed) workout', async () => {
  const plannedCandidate = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Chest and Curls',
      session_kind: 'strength',
      day_type: 'workout_30',
      status: 'planned',
      recovery_flag_next_day: false,
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }],
      pain_flags: []
    }
  };
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
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate: plannedCandidate, slug: 'chest-curls' }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.data.personalBests, undefined);
  assert.ok(!calls.some(call => call.url.includes('data/exercise-library.json')), 'must not touch the exercise library for a planned workout');
});

test('a failing exercise library write never fails the confirm response', async () => {
  const workoutCandidate = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Chest and Curls',
      session_kind: 'strength',
      day_type: 'workout_30',
      status: 'completed',
      duration_min: 26,
      recovery_flag_next_day: false,
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }],
      pain_flags: []
    }
  };
  const librarySha = 'ee'.repeat(20);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: 'data/exercise-library.json', type: 'blob', sha: librarySha }] });
    }
    if (url.includes(`/git/blobs/${librarySha}`)) {
      return Response.json({ message: 'server error' }, { status: 500 });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate: workoutCandidate, slug: 'chest-curls' }));
  const payload = await response.json();
  assert.equal(response.status, 200, 'a broken exercise library read/write must not fail the confirm response');
  assert.deepEqual(payload.data.personalBests, []);
});

test('does not upsert a fitness template for a planned (not completed) workout', async () => {
  const plannedCandidate = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Chest and Curls',
      session_kind: 'strength',
      day_type: 'workout_30',
      status: 'planned',
      recovery_flag_next_day: false,
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }],
      pain_flags: []
    }
  };
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
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate: plannedCandidate, slug: 'chest-curls' }));
  assert.equal(response.status, 200);
  assert.ok(!calls.some(call => call.url.includes('data/fitness/templates/')), 'must not touch templates for a planned workout');
});

test('a failing template upsert never fails the confirm response', async () => {
  const workoutCandidate = {
    type: 'workout',
    date: '2026-08-01',
    fields: {
      title: 'Chest and Curls',
      session_kind: 'strength',
      day_type: 'workout_30',
      status: 'completed',
      duration_min: 26,
      recovery_flag_next_day: false,
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }],
      pain_flags: []
    }
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ message: 'server error' }, { status: 500 });
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate: workoutCandidate, slug: 'chest-curls' }));
  assert.equal(response.status, 200, 'a broken template/tree lookup must not fail the confirm response');
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

const CN_FIXTURE = `# Purpose
Purpose body.

## 🔴 Current Constraints & Priorities
- Steroid taper active
- Keep surplus

## ⚡ Today's Status — Monday, 1 January 2026
**Flags:** Quiet day.

## 📝 Recent Agent Actions
- 1 Jan — Brisket: meal logged
`;

const confirmPatch = {
  section: 'constraints',
  op: 'delete_lines',
  payload: { match: 'Steroid taper', summary: 'Remove taper constraint' }
};

test('cn_patch confirm writes central-node.md for a confirm-class delete_lines patch', async () => {
  const cnSha = 'f'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: 'central-node.md', type: 'blob', sha: cnSha }] });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(CN_FIXTURE, 'utf8').toString('base64')
      });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({
    kind: 'cn_patch',
    slug: 'hammond',
    candidate: confirmPatch
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.path, 'central-node.md');
  assert.equal(payload.data.summary, 'Remove taper constraint');

  const putCall = calls.find(call => call.options?.method === 'PUT' && call.url.includes('central-node.md'));
  assert.ok(putCall);
  const written = Buffer.from(JSON.parse(putCall.options.body).content, 'base64').toString('utf8');
  assert.doesNotMatch(written, /Steroid taper/);
  assert.match(written, /Keep surplus/);
  assert.match(JSON.parse(putCall.options.body).message, /chore\(cn\): Remove taper constraint/);
});

const PENDING_QUEUE_PATH = 'data/hammond/pending-cn-patches.json';

function queuedEntry(id, patch = confirmPatch) {
  return { id, createdAt: '2026-07-30', slug: 'hammond', patch };
}

test('cn_patch confirm loads the patch from the pending queue by id (ignoring a stale candidate) and dequeues it on success', async () => {
  const cnSha = 'f'.repeat(40);
  const queueSha = 'e'.repeat(40);
  const queue = [queuedEntry('cnp_abc123'), queuedEntry('cnp_other', { ...confirmPatch, payload: { ...confirmPatch.payload, summary: 'Other' } })];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: 'central-node.md', type: 'blob', sha: cnSha },
          { path: PENDING_QUEUE_PATH, type: 'blob', sha: queueSha }
        ]
      });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(CN_FIXTURE, 'utf8').toString('base64') });
    }
    if (url.includes(`/git/blobs/${queueSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify(queue), 'utf8').toString('base64') });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  // A deliberately different, invalid candidate -- proves the server prefers
  // the stored patch found by id over whatever the client resubmitted.
  const response = await handler(request({
    kind: 'cn_patch',
    slug: 'hammond',
    id: 'cnp_abc123',
    candidate: { section: 'not_a_real_section', op: 'append_line', payload: { summary: 'ignored' } }
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.summary, 'Remove taper constraint');

  const cnPut = calls.find(call => call.options?.method === 'PUT' && call.url.includes('central-node.md'));
  assert.ok(cnPut);
  const written = Buffer.from(JSON.parse(cnPut.options.body).content, 'base64').toString('utf8');
  assert.doesNotMatch(written, /Steroid taper/);

  const queuePut = calls.find(call => call.options?.method === 'PUT' && call.url.includes('pending-cn-patches.json'));
  assert.ok(queuePut, 'expected the queue to be rewritten to dequeue the confirmed entry');
  const nextQueue = JSON.parse(Buffer.from(JSON.parse(queuePut.options.body).content, 'base64').toString('utf8'));
  assert.equal(nextQueue.length, 1);
  assert.equal(nextQueue[0].id, 'cnp_other');
});

test('cn_patch confirm falls back to the resubmitted candidate when the id is not found in the queue', async () => {
  const cnSha = 'f'.repeat(40);
  const queueSha = 'e'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: 'central-node.md', type: 'blob', sha: cnSha },
          { path: PENDING_QUEUE_PATH, type: 'blob', sha: queueSha }
        ]
      });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(CN_FIXTURE, 'utf8').toString('base64') });
    }
    if (url.includes(`/git/blobs/${queueSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify([]), 'utf8').toString('base64') });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({
    kind: 'cn_patch',
    slug: 'hammond',
    id: 'cnp_gone',
    candidate: confirmPatch
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.summary, 'Remove taper constraint');
});

test('cn_patch confirm write-conflict on central-node.md leaves the pending entry queued', async () => {
  const cnSha = 'f'.repeat(40);
  const queueSha = 'e'.repeat(40);
  const queue = [queuedEntry('cnp_abc123')];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: 'central-node.md', type: 'blob', sha: cnSha },
          { path: PENDING_QUEUE_PATH, type: 'blob', sha: queueSha }
        ]
      });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(CN_FIXTURE, 'utf8').toString('base64') });
    }
    if (url.includes(`/git/blobs/${queueSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify(queue), 'utf8').toString('base64') });
    }
    if (options?.method === 'PUT' && url.includes('central-node.md')) {
      return Response.json({ message: 'conflict' }, { status: 409 });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({ kind: 'cn_patch', slug: 'hammond', id: 'cnp_abc123', candidate: confirmPatch }));
  assert.equal(response.status, 409);

  const queuePut = calls.find(call => call.options?.method === 'PUT' && call.url.includes('pending-cn-patches.json'));
  assert.equal(queuePut, undefined, 'the queue must not be touched when the Central Node write itself failed');
});

test('cn_patch_dismiss removes the queued entry and never touches central-node.md', async () => {
  const queueSha = 'e'.repeat(40);
  const queue = [queuedEntry('cnp_abc123'), queuedEntry('cnp_keep')];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: PENDING_QUEUE_PATH, type: 'blob', sha: queueSha }] });
    }
    if (url.includes(`/git/blobs/${queueSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify(queue), 'utf8').toString('base64') });
    }
    if (options?.method === 'PUT') {
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({ kind: 'cn_patch_dismiss', slug: 'hammond', id: 'cnp_abc123' }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data, { id: 'cnp_abc123', dismissed: true });
  assert.equal(calls.some(call => call.url.includes('central-node.md')), false);

  const queuePut = calls.find(call => call.options?.method === 'PUT');
  assert.ok(queuePut);
  const nextQueue = JSON.parse(Buffer.from(JSON.parse(queuePut.options.body).content, 'base64').toString('utf8'));
  assert.deepEqual(nextQueue.map(entry => entry.id), ['cnp_keep']);
});

test('cn_patch_dismiss is idempotent for an unknown or already-removed id', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const treeFetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    return fetchImpl(url, options);
  };
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl: treeFetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({ kind: 'cn_patch_dismiss', slug: 'hammond', id: 'cnp_never_existed' }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data, { id: 'cnp_never_existed', dismissed: true });
  assert.equal(calls.some(call => call.options?.method === 'PUT'), false);
});

test('cn_patch_dismiss without an id is rejected', async () => {
  const { fetchImpl } = githubFetchStub();
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T06:00:00Z') });

  const response = await handler(request({ kind: 'cn_patch_dismiss', slug: 'hammond' }));
  assert.equal(response.status, 400);
});

test('cn_patch confirm rejects auto-class patches with 400', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({
    kind: 'cn_patch',
    slug: 'hammond',
    candidate: {
      section: 'constraints',
      op: 'append_line',
      payload: { text: '- New additive flag', summary: 'Add flag' }
    }
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'auto_class_rejected');
  assert.equal(calls.length, 0);
});

test('cn_patch confirm rejects invalid patch payloads without contacting GitHub', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({
    kind: 'cn_patch',
    slug: 'hammond',
    candidate: { section: 'constraints', op: 'delete_lines', payload: { match: 'x' } }
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'invalid_patch');
  assert.equal(calls.length, 0);
});

test('cn_patch confirm returns 404 when central-node.md is missing', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [] });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({
    kind: 'cn_patch',
    slug: 'hammond',
    candidate: confirmPatch
  }));
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, 'central_node_missing');
  assert.equal(calls.filter(call => call.options?.method === 'PUT').length, 0);
});

test('cn_patch confirm rejects non-hammond slug', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const handler = createChatConfirmHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });

  const response = await handler(request({
    kind: 'cn_patch',
    slug: 'brisket',
    candidate: confirmPatch
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'invalid_request');
  assert.equal(calls.length, 0);
});
