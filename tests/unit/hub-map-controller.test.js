import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { createHubMapController } from '../../apps/life/js/app/hub-map-controller.js';
import { buildHubMapSeed } from '../../apps/life/js/app/hub-map-seed.js';

const html = readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
const markup = html.match(/<section id="hub-map-dashboard"[\s\S]*?<\/section>/)[0];

function setup({ loadResult, saveImpl } = {}) {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = markup;
  const saves = [];
  const timers = [];
  const api = {
    load: async () => loadResult ?? { map: buildHubMapSeed(), sha: null, seeded: true },
    save: async (map, baseSha) => {
      saves.push({ map, baseSha });
      if (saveImpl) return saveImpl(map, baseSha, saves.length);
      return { map, sha: `sha-${saves.length}`, seeded: false };
    }
  };
  const controller = createHubMapController({
    root: document,
    api,
    setTimer: fn => { timers.push(fn); return timers.length; },
    clearTimer: () => {}
  });
  const q = selector => document.querySelector(selector);
  const card = id => q(`[data-node-id="${id}"]`);
  const runTimers = async () => { while (timers.length) await timers.shift()(); await Promise.resolve(); };
  const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));
  const expandLife = () => card('hub-life').querySelector('.hub-map-card__toggle').click();
  const openLife = async () => { await controller.open(); expandLife(); };
  return { window, document, controller, saves, q, card, runTimers, flushMicrotasks, expandLife, openLife };
}

test('returns a no-op controller when the markup is missing', async () => {
  const window = new Window();
  const controller = createHubMapController({ root: window.document, api: {} });
  await controller.open();
});

test('open loads the seed and shows Life Hub with its five hubs, pages collapsed', async () => {
  const { controller, q, card, expandLife } = setup();
  await controller.open();
  assert.ok(card('life-hub'));
  for (const hub of ['hub-life', 'hub-teaching', 'hub-knowledge', 'hub-tasks', 'hub-professional']) assert.ok(card(hub), hub);
  assert.equal(card('life-home'), null, 'pages appear when a hub is expanded');
  expandLife();
  assert.ok(card('life-home'));
  assert.equal(card('life-body-bloods'), null, 'sections stay hidden until their page is expanded');
  assert.match(q('#hub-map-save-state').textContent, /Starter map/);
  assert.match(q('[data-hub-map-filter="all"]').textContent, /^All 89$/);
  assert.match(q('[data-hub-map-filter="unreviewed"]').textContent, /^Unreviewed 88$/);
});

test('a load failure shows an error with Retry', async () => {
  let fail = true;
  const window = new Window();
  window.document.body.innerHTML = markup;
  const api = {
    load: async () => {
      if (fail) throw new Error('down');
      return { map: buildHubMapSeed(), sha: null, seeded: true };
    },
    save: async () => ({})
  };
  const controller = createHubMapController({ root: window.document, api });
  await controller.open();
  const error = window.document.querySelector('#hub-map-error');
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /Could not load/);
  fail = false;
  error.querySelector('button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(error.hidden, true);
  assert.ok(window.document.querySelector('[data-node-id="hub-life"]'));
});

test('the chevron expands a page to reveal its sections', async () => {
  const { controller, card, openLife } = setup();
  await openLife();
  card('life-body').querySelector('.hub-map-card__toggle').click();
  assert.ok(card('life-body-bloods'));
  card('hub-life').querySelector('.hub-map-card__toggle').click();
  assert.equal(card('life-home'), null, 'collapsing a hub hides its pages');
});

test('selecting a card opens the panel; editing status autosaves after the debounce', async () => {
  const { window, controller, saves, q, card, runTimers, flushMicrotasks , openLife } = setup();
  await openLife();
  card('life-home').querySelector('.hub-map-card__main').click();
  assert.equal(q('#hub-map-panel').hidden, false);
  assert.ok(q('#hub-map-stage').classList.contains('has-panel'));
  const status = q('#hub-map-panel select');
  status.value = 'built';
  status.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.match(q('#hub-map-save-state').textContent, /Unsaved/);
  assert.equal(saves.length, 0, 'nothing saved before the debounce fires');
  await runTimers();
  await flushMicrotasks();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].baseSha, null);
  assert.equal(saves[0].map.nodes.find(n => n.id === 'life-home').status, 'built');
  assert.equal(q('#hub-map-save-state').textContent, 'Saved');
  assert.match(q('[data-hub-map-filter="built"]').textContent, /^Built 1$/);
});

test('later saves send the sha returned by the previous save', async () => {
  const { window, controller, saves, q, card, runTimers, flushMicrotasks , openLife } = setup();
  await openLife();
  card('life-home').querySelector('.hub-map-card__main').click();
  for (const value of ['partial', 'built']) {
    const status = q('#hub-map-panel select');
    status.value = value;
    status.dispatchEvent(new window.Event('change', { bubbles: true }));
    await runTimers();
    await flushMicrotasks();
  }
  assert.deepEqual(saves.map(save => save.baseSha), [null, 'sha-1']);
});

test('a failed save keeps the edit on screen and offers Try again', async () => {
  let fail = true;
  const { window, controller, saves, q, card, runTimers, flushMicrotasks , openLife } = setup({
    saveImpl: async (map, _base, count) => {
      if (fail) throw Object.assign(new Error('boom'), { status: 503, code: 'github_unavailable' });
      return { map, sha: `sha-${count}` };
    }
  });
  await openLife();
  card('life-home').querySelector('.hub-map-card__main').click();
  const status = q('#hub-map-panel select');
  status.value = 'built';
  status.dispatchEvent(new window.Event('change', { bubbles: true }));
  await runTimers();
  await flushMicrotasks();
  assert.equal(q('#hub-map-save-state').textContent, 'Not saved');
  assert.match(q('#hub-map-error').textContent, /Could not save/);
  assert.equal(q('#hub-map-panel select').value, 'built', 'edit is still shown');
  fail = false;
  q('#hub-map-error button').click();
  await flushMicrotasks();
  assert.equal(q('#hub-map-save-state').textContent, 'Saved');
  assert.equal(saves.length, 2);
});

test('a write conflict offers to reload the server copy', async () => {
  const { window, controller, q, card, runTimers, flushMicrotasks , openLife } = setup({
    saveImpl: async () => { throw Object.assign(new Error('conflict'), { status: 409, code: 'write_conflict' }); }
  });
  await openLife();
  card('life-home').querySelector('.hub-map-card__main').click();
  const status = q('#hub-map-panel select');
  status.value = 'built';
  status.dispatchEvent(new window.Event('change', { bubbles: true }));
  await runTimers();
  await flushMicrotasks();
  assert.match(q('#hub-map-error').textContent, /changed somewhere else/);
  assert.equal(q('#hub-map-error button').textContent, 'Reload map');
});

test('the status filter dims cards that do not match', async () => {
  const { controller, q, card , openLife } = setup();
  await openLife();
  q('[data-hub-map-filter="built"]').click();
  assert.ok(card('life-home').className.includes('is-dim'));
  assert.equal(card('hub-life').className.includes('is-dim'), false);
  assert.equal(q('[data-hub-map-filter="built"]').getAttribute('aria-pressed'), 'true');
});

test('adding a child selects and reveals it', async () => {
  const { window, controller, q, card , openLife } = setup();
  await openLife();
  card('life-body').querySelector('.hub-map-card__main').click();
  const form = q('[data-focus="add-child"]').closest('form');
  form.querySelector('input').value = 'Scan results';
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.ok(card('scan-results'), 'new child is visible');
  assert.match(q('#hub-map-panel .hub-map-panel__title').textContent, /Scan results/);
});

test('import accepts a valid map and rejects bad files without changing anything', async () => {
  const { controller, q, card, expandLife } = setup();
  await controller.open();
  controller.importText('{nope');
  assert.match(q('#hub-map-error').textContent, /not valid JSON/);
  controller.importText(JSON.stringify({ version: 1, nodes: [], edges: [] }));
  assert.match(q('#hub-map-error').textContent, /not a valid hub map/);
  expandLife();
  assert.ok(card('life-home'), 'map unchanged');
  const changed = buildHubMapSeed();
  changed.nodes.find(n => n.id === 'life-home').name = 'Home base';
  controller.importText(JSON.stringify(changed));
  assert.equal(q('#hub-map-error').hidden, true);
  expandLife();
  assert.match(card('life-home').textContent, /Home base/);
});
