import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

async function browserAssetText() {
  const root = new URL('../../', import.meta.url);
  const paths = [
    'index.html',
    'css/app.css',
    'manifest.webmanifest',
    'service-worker.js',
    'node_modules/js-yaml/dist/js-yaml.mjs'
  ];
  for (const directory of ['js/app', 'js/core']) {
    const entries = await readdir(new URL(directory, root));
    paths.push(...entries.filter(name => name.endsWith('.js')).map(name => `${directory}/${name}`));
  }
  return (await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')))).join('\n');
}

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

test('skip link is unavailable until the authenticated shell is revealed', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const shellStart = html.indexOf('id="app-shell"');
  const skipLink = html.indexOf('class="skip-link"');
  const mainContent = html.indexOf('id="main-content"');

  assert.ok(shellStart >= 0);
  assert.ok(skipLink > shellStart);
  assert.ok(mainContent > skipLink);
});

test('browser assets contain no server environment names that reveal values', async () => {
  const assets = await browserAssetText();
  assert.doesNotMatch(assets, /github_pat_|ghp_|gho_/);
  for (const name of [
    'LIFE_HUB_PASSPHRASE_HASH',
    'SESSION_SECRET',
    'GITHUB_REPOSITORY',
    'GITHUB_BRANCH',
    'GITHUB_TOKEN',
    'GITHUB_TOKEN_EXPIRES'
  ]) {
    assert.doesNotMatch(assets, new RegExp(name));
  }
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
