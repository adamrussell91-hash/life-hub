import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCountable } from '../../packages/design-kit/js/hub-motion.js';

test('parseCountable reads dashboard numbers and leaves dates alone', () => {
  assert.equal(parseCountable('1,840').value, 1840);
  assert.equal(parseCountable('1,840').format(1840), '1,840');
  assert.equal(parseCountable('42 g').value, 42);
  assert.equal(parseCountable('42 g').format(42), '42 g');
  assert.equal(parseCountable('3 of 5').value, 3);
  assert.equal(parseCountable('3 of 5').format(3), '3 of 5');
  assert.equal(parseCountable('12 classes').value, 12);
  assert.equal(parseCountable('12 classes').format(12), '12 classes');
  assert.equal(parseCountable('1 open task').value, 1);
  assert.equal(parseCountable('—'), null);
  assert.equal(parseCountable('04/09/26'), null);
  assert.equal(parseCountable('Live data ready'), null);
});

test('Home shell loads the shared motion stylesheet and module', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../../apps/life/js/app/main.js', import.meta.url), 'utf8');
  assert.match(html, /packages\/design-kit\/motion\.css/);
  assert.match(main, /hub-motion\.js/);
  assert.match(main, /startHubMotion/);
});

test('kit sign-in snippet and CSS no longer ship haze', async () => {
  const snippet = await readFile(new URL('../../packages/design-kit/snippets/sign-in.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../packages/design-kit/sign-in.css', import.meta.url), 'utf8');
  const life = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');

  for (const source of [snippet, css, life]) {
    assert.doesNotMatch(source, /sign-in__haze/);
    assert.doesNotMatch(source, /sign-in__bubble/);
    assert.doesNotMatch(source, /sign-in__sparkle/);
  }
});
