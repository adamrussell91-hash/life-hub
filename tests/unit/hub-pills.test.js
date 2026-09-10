import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyHubPillsThumb, isActiveHubPill } from '../../packages/design-kit/js/hub-motion.js';

test('kit pills use a sliding paper thumb on a shore track', async () => {
  const css = await readFile(new URL('../../packages/design-kit/filters.css', import.meta.url), 'utf8');
  assert.match(css, /\.hub-pills__thumb/);
  assert.match(css, /0\.2s ease-in-out/);
  assert.match(css, /--shore/);
  assert.match(css, /\.hub-pills--loose/);
});

test('isActiveHubPill reads kit selected states', () => {
  const btn = {
    classList: { contains: name => name === 'is-selected' },
    getAttribute: () => null
  };
  assert.equal(isActiveHubPill(btn), true);
  assert.equal(isActiveHubPill(null), false);
});

test('applyHubPillsThumb measures the selected option and skips loose rows', () => {
  const day = makeBtn({ active: false, left: 2, width: 72 });
  const week = makeBtn({ active: true, left: 74, width: 80 });
  const group = makeGroup([day, week]);

  const box = applyHubPillsThumb(group, { animate: false, reduced: true });
  assert.deepEqual(box, { x: '74px', y: '2px', w: '80px', h: '32px' });
  assert.equal(group.style.props['--hub-pill-x'], '74px');
  assert.equal(group.style.props['--hub-pill-w'], '80px');
  assert.equal(group.classList.has('is-ready'), true);
  assert.equal(group.children[0].className, 'hub-pills__thumb');

  const loose = makeGroup([day, week], { loose: true });
  assert.equal(applyHubPillsThumb(loose, { reduced: true }), null);
  assert.equal(loose.children.some(child => child.className === 'hub-pills__thumb'), false);
});

function makeBtn({ active, left, width }) {
  const classes = new Set(['hub-pills__btn']);
  if (active) classes.add('is-active');
  return {
    classList: { contains: name => classes.has(name) },
    getAttribute: name => (name === 'aria-pressed' ? (active ? 'true' : 'false') : null),
    offsetLeft: left,
    offsetTop: 2,
    offsetWidth: width,
    offsetHeight: 32
  };
}

function makeGroup(buttons, { loose = false } = {}) {
  const classes = new Set(['hub-pills']);
  if (loose) classes.add('hub-pills--loose');
  const children = [...buttons];
  const props = {};
  return {
    children,
    classList: {
      contains: name => classes.has(name),
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, on) => {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      has: name => classes.has(name)
    },
    getAttribute: () => null,
    querySelectorAll: selector => (selector.includes('hub-pills__btn') ? buttons : []),
    querySelector: selector => {
      if (selector.includes('thumb')) {
        return children.find(child => child.className === 'hub-pills__thumb') ?? null;
      }
      return null;
    },
    insertBefore: node => {
      children.unshift(node);
    },
    ownerDocument: {
      createElement: () => ({
        className: '',
        setAttribute() {}
      })
    },
    style: {
      setProperty: (key, value) => {
        props[key] = value;
      },
      props
    }
  };
}
