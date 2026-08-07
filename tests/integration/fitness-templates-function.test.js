import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createFitnessTemplatesHandler } from '../../netlify/functions/fitness-templates.mjs';
import { renderTemplateMarkdown } from '../../netlify/functions/_shared/workout-templates.mjs';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const TEMPLATE_SHA = 'a'.repeat(40);
const LIBRARY_SHA = 'b'.repeat(40);
const TOKEN = 'github-secret-token';
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: TOKEN,
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

const templateMarkdown = renderTemplateMarkdown({
  schema_version: 1,
  type: 'workout_template',
  title: 'Chest and Curls',
  session_kind: 'strength',
  day_type: 'workout_45_60',
  focus: ['chest', 'arms'],
  source_session_date: '2026-07-30',
  exercises: [
    { name: 'Cable Fly', sets: [{ reps: 10, weight_kg: 20, cable_type: 'constant_force' }] }
  ]
});

const libraryJson = JSON.stringify([
  { name: 'Cable Fly', target_area: 'Chest', focus_areas: ['Upper Chest'] }
]);

function request(headers = {}, method = 'GET') {
  return new Request('https://life.example/api/fitness/templates', {
    method,
    headers: { cookie: `life_hub_session=${session}`, ...headers }
  });
}

function encodeBlob(text) {
  return { encoding: 'base64', content: Buffer.from(text, 'utf8').toString('base64'), sha: 'blob' };
}

test('fitness templates rejects a missing session before GitHub calls', async () => {
  let githubCalls = 0;
  const handler = createFitnessTemplatesHandler({
    env: { SESSION_SECRET: SECRET, LIFE_HUB_PASSPHRASE_HASH: 'configured' },
    fetchImpl: async () => { githubCalls += 1; }
  });
  const response = await handler(new Request('https://life.example/api/fitness/templates'));
  assert.equal(response.status, 401);
  assert.equal(githubCalls, 0);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

test('fitness templates returns templates and a compact library index', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        sha: TREE_SHA,
        truncated: false,
        tree: [
          { path: 'data/fitness/templates/chest-and-curls.md', type: 'blob', sha: TEMPLATE_SHA, size: 200 },
          { path: 'data/exercise-library.json', type: 'blob', sha: LIBRARY_SHA, size: 100 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${TEMPLATE_SHA}`)) return Response.json(encodeBlob(templateMarkdown));
    if (url.includes(`/git/blobs/${LIBRARY_SHA}`)) return Response.json(encodeBlob(libraryJson));
    return Response.json({ message: 'unexpected' }, { status: 500 });
  };

  const response = await createFitnessTemplatesHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl
  })(request());

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.templates.length, 1);
  assert.equal(body.data.templates[0].title, 'Chest and Curls');
  assert.equal(body.data.templates[0].path, 'data/fitness/templates/chest-and-curls.md');
  assert.deepEqual(body.data.templates[0].focus, ['chest', 'arms']);
  assert.equal(body.data.templates[0].exercises[0].name, 'Cable Fly');
  assert.equal(body.data.libraryIndex['Cable Fly'].target_area, 'Chest');
  assert.deepEqual(body.data.libraryIndex['Cable Fly'].focus_areas, ['Upper Chest']);
});
