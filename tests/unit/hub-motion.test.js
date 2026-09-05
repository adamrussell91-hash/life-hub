import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyHubScrollHide,
  nextScrollHideState,
  parseCountable
} from '../../packages/design-kit/js/hub-motion.js';
import {
  DEFAULT_STAGGER_MS,
  getDelay,
  getSegments,
  splitIntoGraphemes
} from '../../packages/design-kit/js/hub-kinetic.js';

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
  const motion = await readFile(new URL('../../packages/design-kit/motion.css', import.meta.url), 'utf8');
  assert.match(html, /packages\/design-kit\/motion\.css/);
  assert.match(html, /page-header__title hub-kinetic/);
  assert.match(html, /data-hub-scroll-hide/);
  assert.match(html, /data-hub-scroll-scroller="#chat-messages"/);
  assert.match(main, /hub-motion\.js/);
  assert.match(main, /startHubMotion/);
  assert.match(motion, /hub-morph-dialog/);
});

test('kinetic split keeps spaces still and words moving', () => {
  const words = getSegments('Medical Overview', 'words');
  assert.deepEqual(
    words.map(segment => [segment.value, segment.animated, segment.index]),
    [
      ['Medical', true, 0],
      [' ', false, -1],
      ['Overview', true, 1]
    ]
  );

  const characters = getSegments('Hi there', 'characters');
  assert.equal(characters.filter(segment => segment.animated).length, 7);
  assert.equal(characters.find(segment => segment.value === ' ')?.animated, false);

  const lines = getSegments('One\n\nTwo', 'lines');
  assert.deepEqual(
    lines.map(segment => [segment.value, segment.animated, segment.index]),
    [
      ['One', true, 0],
      ['', false, -1],
      ['Two', true, 1]
    ]
  );
});

test('kinetic stagger origins match the saved reveal math', () => {
  assert.equal(DEFAULT_STAGGER_MS, 45);
  assert.equal(getDelay(0, 4, 45, 'start'), 0);
  assert.equal(getDelay(3, 4, 45, 'start'), 135);
  assert.equal(getDelay(0, 4, 45, 'end'), 135);
  assert.equal(getDelay(1, 4, 45, 'center'), 22.5);
  assert.equal(getDelay(0, 4, 45, 'edges'), 0);
  assert.equal(getDelay(1, 4, 45, 'edges'), 45);
  assert.equal(getDelay(2, 5, 45, 0), 90);
  assert.equal(getDelay(1, 4, 45, 'random'), getDelay(1, 4, 45, 'random'));
});

test('kinetic grapheme split keeps a combining mark with its letter', () => {
  const parts = splitIntoGraphemes('e\u0301');
  assert.equal(parts.length, 1);
  assert.equal(parts[0], 'e\u0301');
});

test('scroll-hide tucks away on the way down and comes back on the way up', () => {
  assert.equal(nextScrollHideState({ current: 40, previous: 10, threshold: 80 }), false);
  assert.equal(nextScrollHideState({ current: 120, previous: 90, threshold: 80 }), true);
  assert.equal(nextScrollHideState({ current: 90, previous: 120, threshold: 80, hidden: true }), false);
  assert.equal(nextScrollHideState({ current: 90, previous: 90, threshold: 80, hidden: true }), true);

  const el = {
    className: '',
    classList: {
      tokens: new Set(),
      add(name) { this.tokens.add(name); },
      contains(name) { return this.tokens.has(name); },
      toggle(name, on) { if (on) this.tokens.add(name); else this.tokens.delete(name); }
    },
    attributes: {},
    getAttribute() { return null; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    toggleAttribute(name, on) { if (on) this.attributes[name] = ''; else delete this.attributes[name]; }
  };
  assert.equal(applyHubScrollHide(el, { current: 160, previous: 90 }), true);
  assert.equal(el.classList.contains('is-hidden'), true);
  assert.equal(el.attributes.inert, '');
  assert.equal(applyHubScrollHide(el, { current: 40, previous: 160 }), false);
  assert.equal(el.classList.contains('is-hidden'), false);
});

test('kit documents kinetic as canvas-only motion', async () => {
  const agents = await readFile(new URL('../../packages/design-kit/AGENTS.md', import.meta.url), 'utf8');
  const snippet = await readFile(new URL('../../packages/design-kit/snippets/hub-kinetic.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../packages/design-kit/motion.css', import.meta.url), 'utf8');
  const motion = await readFile(new URL('../../packages/design-kit/js/hub-motion.js', import.meta.url), 'utf8');

  assert.match(agents, /hub-kinetic\.js/);
  assert.match(agents, /scroll-hide chrome/);
  assert.match(agents, /Not on the rail/);
  assert.match(snippet, /Do not use on the rail/);
  assert.match(css, /\.hub-kinetic__seg/);
  assert.match(css, /\.hub-scroll-hide\.is-hidden/);
  assert.match(motion, /hub-kinetic\.js/);
  assert.match(motion, /watchKinetic/);
  assert.match(motion, /data-hub-scroll-hide/);

  const hideSnippet = await readFile(new URL('../../packages/design-kit/snippets/hub-scroll-hide.html', import.meta.url), 'utf8');
  assert.match(hideSnippet, /data-hub-scroll-hide/);
  assert.match(hideSnippet, /Do not put this on the rail/);

  const rail = await readFile(new URL('../../packages/design-kit/snippets/rail.html', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../../apps/life/service-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(rail, /hub-kinetic/);
  assert.match(worker, /packages\/design-kit\/js\/hub-kinetic\.js/);
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
