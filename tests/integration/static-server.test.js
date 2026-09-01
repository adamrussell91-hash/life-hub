import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { createStaticServer } from '../../scripts/serve.mjs';

const execute = promisify(execFile);
const projectRoot = new URL('../..', import.meta.url);
const netlifyConfiguration = await readFile(new URL('../../netlify.toml', import.meta.url), 'utf8');
const publishDirectory = readConfigurationValue(netlifyConfiguration, 'build', 'publish');
const functionsDirectory = readConfigurationValue(netlifyConfiguration, 'functions', 'directory');
// The real site is served from GitHub Pages, not Netlify -- Netlify's own publish dir
// (netlify/public) is just a tiny placeholder for anyone who visits its .netlify.app URL
// directly. Local dev still serves the built dist/ artifact, matching what GitHub Pages
// deploys, so these tests exercise dist/ directly rather than netlify.toml's publish dir.
const publishRoot = new URL('../../dist/', import.meta.url);

before(async () => {
  await execute(process.execPath, ['scripts/prepare-web.mjs'], {
    cwd: projectRoot,
    env: { ...process.env }
  });
});

async function startServer(t, options = {}) {
  const server = createStaticServer({ root: publishRoot, apiRoot: projectRoot, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('Netlify keeps its own placeholder publish directory separate from the functions directory', () => {
  assert.equal(publishDirectory, 'netlify/public');
  assert.equal(functionsDirectory, 'netlify/functions');

  const rootPath = fileURLToPath(projectRoot);
  const publishPath = resolve(rootPath, publishDirectory);
  const functionsPath = resolve(rootPath, functionsDirectory);
  assert.equal(functionsPath === publishPath || functionsPath.startsWith(`${publishPath}${sep}`), false);
});

test('serves the Home shell with the correct content type', async t => {
  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(await response.text(), /Life Hub/);
});

test('publishes design-kit stylesheets linked from the Home shell', async t => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const hrefs = [...html.matchAll(/href="(packages\/design-kit\/[^"]+\.css)"/g)].map(match => match[1]);
  assert.ok(hrefs.length > 0, 'index.html must link packages/design-kit CSS');

  const baseUrl = await startServer(t);
  for (const href of hrefs) {
    const response = await fetch(`${baseUrl}/${href}`);
    assert.equal(response.status, 200, href);
    assert.match(response.headers.get('content-type'), /css/);
  }
});

test('publishes design-kit modules imported by the app shell', async t => {
  const sources = await readFile(new URL('../../dist/js/app/render-medical.js', import.meta.url), 'utf8');
  const imports = [...sources.matchAll(/from ['"](\.\.\/\.\.\/packages\/design-kit\/[^'"]+)['"]/g)]
    .map(match => match[1].replace('../../', ''));
  assert.ok(imports.includes('packages/design-kit/js/hub-filter-menu.js'));

  const baseUrl = await startServer(t);
  for (const href of imports) {
    const response = await fetch(`${baseUrl}/${href}`);
    assert.equal(response.status, 200, href);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.match(await response.text(), /createHubFilter|export /);
  }
});

test('native sign-in POST to / serves the shell instead of 405', async t => {
  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'passphrase=life-hub-local'
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(await response.text(), /Life Hub/);
});

function readConfigurationValue(configuration, section, key) {
  let inSection = false;
  for (const line of configuration.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === `[${section}]`) {
      inSection = true;
      continue;
    }
    if (trimmed.startsWith('[')) inSection = false;
    if (!inSection) continue;
    const setting = new RegExp(`^${key}\\s*=\\s*"([^"]+)"$`).exec(trimmed);
    if (setting) return setting[1];
  }
  return null;
}

test('serves only browser modules and the generated YAML runtime', async t => {
  const baseUrl = await startServer(t);
  const cases = [
    ['/js/app/main.js', /^text\/javascript/],
    ['/vendor/js-yaml.mjs', /^text\/javascript/],
    ['/manifest.webmanifest', /^application\/manifest\+json/]
  ];

  for (const [path, contentType] of cases) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), contentType, path);
  }
});

test('publish artifact denies repository data, source tooling, functions, and dotfiles', async t => {
  const baseUrl = await startServer(t);
  for (const path of [
    '/central-node.md',
    '/config/targets.yml',
    '/config/agents.yml',
    '/tests/fixtures/valid/meal.md',
    '/scripts/serve.mjs',
    '/netlify/functions/session.mjs',
    '/.env.example',
    '/.gitignore',
    '/package.json'
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404, path);
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
  assert.equal(payload.data.files.length, 8);
  assert.deepEqual(payload.data.files[0], {
    path: 'config/agents.yml',
    sha: '4d25a8e7888a482039b3558a21f2fde45b97d1bd',
    size: 1310
  });
  const challenges = payload.data.files.find(f => f.path === 'data/nutrition/challenges.json');
  assert.ok(challenges);
  const centralNode = payload.data.files.find(f => f.path === 'central-node.md');
  assert.ok(centralNode);
  assert.deepEqual(centralNode, {
    path: 'central-node.md',
    sha: 'cc697eca71888316c1dda5bbfe38d7a1d9376816',
    size: 1309
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

test('local mock session keeps one server-side expiry and rejects it at equality', async t => {
  let now = Date.parse('2026-08-01T00:00:00Z');
  const baseUrl = await startServer(t, { now: () => now });
  const auth = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'life-hub-local' })
  });
  const cookie = auth.headers.get('set-cookie').split(';', 1)[0];
  const expiresAt = (await auth.json()).data.expiresAt;

  now += 60 * 60 * 1000;
  const session = await fetch(`${baseUrl}/api/session`, { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).data.expiresAt, expiresAt);

  now = Date.parse(expiresAt);
  const expiredSession = await fetch(`${baseUrl}/api/session`, { headers: { cookie } });
  const expiredManifest = await fetch(
    `${baseUrl}/api/repo/manifest?from=2026-07-01&to=2026-08-01`,
    { headers: { cookie } }
  );
  assert.equal(expiredSession.status, 401);
  assert.equal(expiredManifest.status, 401);
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
  const meal = manifest.files.find(file => file.path.includes('2026-07-30-lunch'));
  const agents = manifest.files.find(file => file.path === 'config/agents.yml');
  assert.ok(meal);
  assert.ok(agents);
  const requested = [meal, agents].map(({ path, sha }) => ({ path, sha }));

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
