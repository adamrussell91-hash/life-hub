// Phone calendar: the Zoom control is on every view, and the item card's ↗ works
// from an installed Home Screen app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { buildZoomPills, ZOOM_LABELS } from '../../packages/design-kit/js/calendar/zoom-pills.js';
import { bindItemCard, isStandaloneApp, itemCardHtml } from '../../packages/design-kit/js/calendar/calendar-item-card.js';

const kit = (file) => readFile(new URL(`../../packages/design-kit/${file}`, import.meta.url), 'utf8');

test('zoom pills: the desktop five, one pressed', () => {
  const { document } = new Window();
  const group = buildZoomPills(document, 'term');
  assert.equal(group.dataset.part, 'zoom-pills');
  assert.deepEqual([...group.querySelectorAll('[data-zoom]')].map((b) => b.textContent), [...ZOOM_LABELS]);
  assert.deepEqual([...group.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.zoom), ['term']);
});

test('zoom pills: no calendar view hides them on a phone', async () => {
  for (const file of ['calendar-tideline.css', 'calendar-day-dial.css', 'calendar-term-river.css', 'calendar-almanac.css']) {
    const css = await kit(file);
    assert.doesNotMatch(css, /zoom-pills"\]\{display:none\}/, `${file} hides Zoom`);
    assert.doesNotMatch(css, /\.alm__nav \.hub-pills[^{]*\{display:none/, `${file} hides Zoom`);
  }
  const bar = await kit('calendar-zoom-bar.css');
  assert.match(bar, /@media \(max-width:719px\)/);
  assert.match(bar, /zoom-pills"\]\{\s*display:flex;flex:1 0 100%/);
});

test('zoom bar css loads in every hub after the view css', async () => {
  const files = {
    'apps/life/index.html': /calendar-term-river\.css">\s*<link rel="stylesheet" href="packages\/design-kit\/calendar-zoom-bar\.css">/,
    'apps/life/service-worker.js': /calendar-zoom-bar\.css/,
    'apps/tasks/src/app/main.ts': /calendar-term-river\.css';\nimport '..\/..\/design-kit\/calendar-zoom-bar\.css';/,
    'apps/professional/src/app/main.ts': /calendar-term-river\.css';\nimport '..\/..\/design-kit\/calendar-zoom-bar\.css';/,
    'apps/teaching/src/design/tokens.css': /calendar-term-river\.css";\n@import "..\/..\/design-kit\/calendar-zoom-bar\.css";/
  };
  for (const [file, pattern] of Object.entries(files)) {
    assert.match(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'), pattern, file);
  }
});

test('standalone: iOS navigator.standalone or display-mode standalone', () => {
  assert.equal(isStandaloneApp(null), false);
  assert.equal(isStandaloneApp({ navigator: { standalone: true } }), true);
  assert.equal(isStandaloneApp({ navigator: {}, matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }) }), true);
  assert.equal(isStandaloneApp({ navigator: {}, matchMedia: () => ({ matches: false }) }), false);
});

const task = { record: { type: 'task', id: 't1', title: 'Mark drafts', date: '2026-09-24' } };

function mountCard(window) {
  const node = window.document.createElement('div');
  window.document.body.append(node);
  node.innerHTML = itemCardHtml(task, { location: { href: 'https://life-hub.example/#/calendar' } });
  bindItemCard(node, task, {});
  return node.querySelector('[data-part="open-in-hub"]');
}

test('item card ↗: a Home Screen app opens the hub in place, keeping its sign-in', () => {
  const window = new Window({ url: 'https://life-hub.example/#/calendar' });
  Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
  const assigned = [];
  window.location.assign = (href) => assigned.push(href);
  const link = mountCard(window);
  assert.equal(link.getAttribute('target'), '_blank');
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(assigned, [link.href]);
  assert.match(link.href, /^https:\/\/life-hub\.example\/tasks\//);
});

test('item card ↗: a browser keeps the new tab', () => {
  const window = new Window({ url: 'https://life-hub.example/#/calendar' });
  window.matchMedia = () => ({ matches: false });
  const assigned = [];
  window.location.assign = (href) => assigned.push(href);
  const link = mountCard(window);
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(assigned, []);
});
