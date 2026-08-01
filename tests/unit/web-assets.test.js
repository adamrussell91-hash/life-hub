import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Home shell exposes landmarks and named rendering regions', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

  for (const fragment of [
    '<header',
    '<nav',
    '<main',
    '<h1',
    'id="home-dashboard"',
    'id="app-status"',
    'aria-live="polite"',
    'class="mobile-nav"'
  ]) {
    assert.match(html, new RegExp(fragment));
  }
  assert.doesNotMatch(html, /https?:\/\//);
});

test('authenticated shell provides a semantic sign-in gate and reachable controls', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

  for (const fragment of [
    'id="sign-in-view"',
    'id="sign-in-form"',
    '<label for="passphrase-input"',
    'id="passphrase-input"',
    'type="password"',
    'autocomplete="current-password"',
    'id="sign-in-error"',
    'role="alert"',
    'id="app-shell"',
    'id="refresh-button"',
    'id="last-synced"',
    'id="provider-status"',
    'id="sign-out-button"'
  ]) {
    assert.ok(html.includes(fragment), fragment);
  }
  assert.match(html, /id="app-shell"[^>]*hidden/);
});

test('renderer assigns untrusted values as text instead of HTML', async () => {
  const source = await readFile(new URL('../../js/app/render-home.js', import.meta.url), 'utf8');

  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('responsive stylesheet contains the approved palette and mobile breakpoint', async () => {
  const css = await readFile(new URL('../../css/app.css', import.meta.url), 'utf8');

  for (const color of ['#FAF8F2', '#0A1536', '#142B51', '#376FB7', '#F68620']) {
    assert.match(css, new RegExp(color, 'i'));
  }
  assert.match(css, /@media\s*\([^)]*max-width:\s*48rem/);
  assert.match(css, /min-height:\s*44px/);
});

test('author styles preserve the semantic hidden state', async () => {
  const css = await readFile(new URL('../../css/app.css', import.meta.url), 'utf8');

  assert.match(css, /\[hidden\]\s*{\s*display:\s*none\s*!important;?\s*}/);
});

test('web app manifest is installable and uses only local icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../manifest.webmanifest', import.meta.url)));

  assert.equal(manifest.name, 'Life Hub');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.ok(manifest.icons.every(icon => icon.src.startsWith('/assets/icons/')));
});

test('service worker precaches the full read-only fixture slice', async () => {
  const worker = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');

  for (const path of [
    '/index.html',
    '/css/app.css',
    '/js/app/main.js',
    '/vendor/js-yaml.mjs',
    '/config/targets.yml',
    '/fixtures/manifest.json',
    '/tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-breakfast.md',
    '/tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-lunch.md',
    '/tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md',
    '/tests/fixtures/valid/data/mind/2026/07/2026-07-30-diary.md'
  ]) {
    assert.ok(worker.includes(`'${path}'`), path);
  }
  assert.match(worker, /caches\.match/);
  assert.doesNotMatch(worker, /\b(?:POST|PUT|PATCH|DELETE)\b/);
});
