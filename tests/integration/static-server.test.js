import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createStaticServer } from '../../scripts/serve.mjs';

async function startServer(t) {
  const server = createStaticServer({ root: new URL('../..', import.meta.url) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('serves the Home shell with the correct content type', async t => {
  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(await response.text(), /Life Hub/);
});

test('serves module, YAML, and Markdown MIME types', async t => {
  const baseUrl = await startServer(t);
  const cases = [
    ['/js/app/main.js', /^text\/javascript/],
    ['/config/targets.yml', /^(?:application|text)\/yaml/],
    ['/tests/fixtures/valid/meal.md', /^text\/markdown/]
  ];

  for (const [path, contentType] of cases) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), contentType, path);
  }
});

test('does not serve paths outside the repository root', async t => {
  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/..%2Fpackage.json`);

  assert.equal(response.status, 400);
});

test('local server requires a mock session before repository reads', async t => {
  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/repo/manifest?from=2026-07-01&to=2026-08-01`);

  assert.equal(response.status, 401);
});

test('local sign-in exposes the fixture repository contract', async t => {
  const baseUrl = await startServer(t);
  const auth = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'life-hub-local' })
  });
  const setCookie = auth.headers.get('set-cookie');
  const cookie = setCookie?.split(';', 1)[0];
  const authBody = await auth.clone().text();

  assert.equal(auth.status, 200);
  assert.equal(setCookie, 'life_hub_mock=1; HttpOnly; SameSite=Strict; Path=/');
  assert.ok(cookie);
  assert.doesNotMatch(authBody, /life-hub-local/);

  const manifest = await fetch(`${baseUrl}/api/repo/manifest?from=2026-07-01&to=2026-08-01`, {
    headers: { cookie }
  });
  assert.equal(manifest.status, 200);
  const payload = await manifest.json();
  assert.equal(payload.data.files.length, 6);
  assert.deepEqual(payload.data.files[0], {
    path: 'config/agents.yml',
    sha: '592630799f9b76b0b056a816625ef0e9196b9efa',
    size: 1335
  });
});

test('local mock API rejects non-local host headers', async t => {
  const baseUrl = await startServer(t);
  const status = await new Promise((resolve, reject) => {
    const request = httpRequest(`${baseUrl}/api/session`, {
      headers: { host: 'life-hub.example' }
    }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });

  assert.equal(status, 403);
});

test('local auth rejects credentials without echoing the submitted passphrase', async t => {
  const baseUrl = await startServer(t);
  const rejected = 'not-the-local-passphrase';
  const response = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: rejected })
  });
  const body = await response.text();

  assert.equal(response.status, 401);
  assert.doesNotMatch(body, new RegExp(rejected));
  assert.equal(JSON.parse(body).error.code, 'invalid_credentials');
});

test('local session and logout expose the production authentication shapes', async t => {
  const baseUrl = await startServer(t);
  const auth = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'life-hub-local' })
  });
  const cookie = auth.headers.get('set-cookie').split(';', 1)[0];

  const session = await fetch(`${baseUrl}/api/session`, { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.deepEqual(Object.keys((await session.json()).data).sort(), ['authenticated', 'expiresAt']);

  const logout = await fetch(`${baseUrl}/api/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /^life_hub_mock=; Max-Age=0;/);
  assert.equal(await logout.text(), '');

  const signedOut = await fetch(`${baseUrl}/api/session`);
  assert.equal(signedOut.status, 401);
  assert.equal((await signedOut.json()).error.code, 'unauthenticated');
});

test('local manifests return 304 for an unchanged range-specific identifier', async t => {
  const baseUrl = await startServer(t);
  const auth = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'life-hub-local' })
  });
  const cookie = auth.headers.get('set-cookie').split(';', 1)[0];
  const url = `${baseUrl}/api/repo/manifest?from=2026-07-01&to=2026-08-01`;

  const initial = await fetch(url, { headers: { cookie } });
  const etag = initial.headers.get('etag');
  assert.match(etag, /^"[0-9a-f]{64}"$/);

  const unchanged = await fetch(url, {
    headers: { cookie, 'if-none-match': `W/${etag}` }
  });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get('cache-control'), 'private, no-store');
  assert.equal(await unchanged.text(), '');
});

test('local repository file reads return exact fixture pairs in request order', async t => {
  const baseUrl = await startServer(t);
  const auth = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'life-hub-local' })
  });
  const cookie = auth.headers.get('set-cookie').split(';', 1)[0];
  const range = { from: '2026-07-01', to: '2026-08-01' };
  const manifestResponse = await fetch(
    `${baseUrl}/api/repo/manifest?from=${range.from}&to=${range.to}`,
    { headers: { cookie } }
  );
  const manifest = (await manifestResponse.json()).data;
  const requested = [manifest.files.at(-1), manifest.files[0]]
    .map(({ path, sha }) => ({ path, sha }));

  const response = await fetch(`${baseUrl}/api/repo/files`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ ...range, files: requested })
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(payload.data.commitSha, manifest.commitSha);
  assert.deepEqual(payload.data.files.map(({ path, sha }) => ({ path, sha })), requested);
  assert.match(payload.data.files[0].content, /Marley Spoon chicken bowl\./);
  assert.match(payload.data.files[1].content, /^agents:/m);
});

test('local health reports the sanitized production response shape', async t => {
  const baseUrl = await startServer(t);
  const auth = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'life-hub-local' })
  });
  const cookie = auth.headers.get('set-cookie').split(';', 1)[0];
  const response = await fetch(`${baseUrl}/api/health`, { headers: { cookie } });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      github: 'healthy',
      token: 'unknown',
      expiresOn: null,
      code: 'ok',
      retryable: false
    }
  });
});
