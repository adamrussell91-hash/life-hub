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
