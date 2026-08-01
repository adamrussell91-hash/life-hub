import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
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
