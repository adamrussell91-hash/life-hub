import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyHubScrollHide,
  nextScrollHideState,
  parseCountable,
  scrollHideFromScroller
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

test('parseCountable does not paint IEEE float junk on gram counts', () => {
  const noisy = parseCountable('135.10000000000002 g');
  assert.equal(noisy.value, 135.10000000000002);
  assert.equal(noisy.format(noisy.value), '135.1 g');
  assert.equal(noisy.format(67.55000000000001), '67.6 g');
  const clean = parseCountable('135.1 g');
  assert.equal(clean.format(clean.value), '135.1 g');
});

test('count overlay is hidden after the tick so totals do not ghost', async () => {
  const css = await readFile(new URL('../../packages/design-kit/motion.css', import.meta.url), 'utf8');
  const base = css.match(/\.hub-count__fx\s*\{([^}]+)\}/);
  assert.ok(base, 'expected a .hub-count__fx rule');
  assert.match(base[1], /display:\s*none/, 'overlay must stay hidden once the tick ends');

  const ticking = css.match(/\.hub-count\.is-ticking\s*>\s*\.hub-count__fx\s*\{([^}]+)\}/);
  assert.ok(ticking, 'expected the overlay to show only while .is-ticking');
  assert.match(ticking[1], /display:\s*(?:block|inline-block)/);
});

test('Home shell loads the shared motion stylesheet and module', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../../apps/life/js/app/main.js', import.meta.url), 'utf8');
  const motion = await readFile(new URL('../../packages/design-kit/motion.css', import.meta.url), 'utf8');
  assert.match(html, /packages\/design-kit\/motion\.css/);
  assert.match(html, /page-header__title hub-kinetic/);
  assert.match(html, /data-hub-scroll-hide/);
  assert.match(html, /data-hub-scroll-scroller="#chat-messages"/);
  assert.match(html, /hub-scroll-hide--overlay/);
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
  assert.equal(
    nextScrollHideState({ current: 122, previous: 120, threshold: 80, hidden: true }),
    true,
    '2px layout nudge must not reverse a hide'
  );
  assert.equal(
    nextScrollHideState({ current: 118, previous: 120, threshold: 80, hidden: true }),
    true,
    '2px layout nudge must not reveal chrome'
  );
  assert.equal(nextScrollHideState({ current: 848, previous: 842, threshold: 80, hidden: true }), true, '6px follow() jitter must not reveal');
  assert.equal(nextScrollHideState({ current: 842, previous: 848, threshold: 80, hidden: false }), false, '6px follow() jitter must not hide');

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

test('scroll-hide ignores content growth and does not reveal just because overflow vanished', () => {
  assert.equal(
    scrollHideFromScroller({ current: 160, previous: 80, hidden: false, overflowing: true, contentGrew: true }),
    false,
    'growing the thread must not hide chrome'
  );
  assert.equal(
    scrollHideFromScroller({ current: 40, previous: 160, hidden: true, overflowing: true, contentGrew: true }),
    true,
    'growing the thread must not reveal chrome either'
  );
  assert.equal(
    scrollHideFromScroller({ current: 200, previous: 200, hidden: true, overflowing: false, contentGrew: false }),
    true,
    'in-flow collapse that removes overflow must not force a reveal loop'
  );
  assert.equal(
    scrollHideFromScroller({ current: 0, previous: 200, hidden: true, overflowing: false, contentGrew: false }),
    false,
    'back at the top still reveals'
  );
  assert.equal(
    scrollHideFromScroller({ current: 120, previous: 90, hidden: false, overflowing: true, contentGrew: false }),
    true
  );
  assert.equal(
    scrollHideFromScroller({ current: 400, previous: 0, hidden: false, overflowing: true, busy: true }),
    false,
    'a busy Chat turn must not tuck chrome from follow() scroll'
  );
  assert.equal(
    scrollHideFromScroller({ current: 0, previous: 400, hidden: true, overflowing: true, busy: true }),
    true,
    'a busy Chat turn must not reveal chrome from follow() scroll either'
  );
});

test('chat transcripts are not list-staggered — a data-state rescan must not fade them', async () => {
  const motion = await readFile(new URL('../../packages/design-kit/js/hub-motion.js', import.meta.url), 'utf8');
  assert.match(motion, /LIST_SELECTOR = \[[\s\S]*\.logging-list/);
  assert.doesNotMatch(
    motion,
    /LIST_SELECTOR = \[[\s\S]*\.chat-messages/,
    'hub-list-in on .chat-messages fades the whole Life Chat window on refresh'
  );
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

test('virtual list windows are not faded in on insert', async () => {
  const motion = await readFile(new URL('../../packages/design-kit/js/hub-motion.js', import.meta.url), 'utf8');
  assert.match(motion, /list-window, \.virtual-list__window/);
});

test('kit motion no longer ships a cursor-follow spotlight sheen', async () => {
  const css = await readFile(new URL('../../packages/design-kit/motion.css', import.meta.url), 'utf8');
  const motion = await readFile(new URL('../../packages/design-kit/js/hub-motion.js', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../../packages/design-kit/AGENTS.md', import.meta.url), 'utf8');

  for (const source of [css, motion, agents]) {
    assert.doesNotMatch(source, /hub-spotlight/);
    assert.doesNotMatch(source, /hub-spot-x/);
    assert.doesNotMatch(source, /hub-motion-spot/);
    assert.doesNotMatch(source, /spotlight sheen/);
    assert.doesNotMatch(source, /card sheen/);
  }
});
