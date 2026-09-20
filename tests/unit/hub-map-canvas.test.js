import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createHubMapCanvas } from '../../apps/life/js/app/hub-map-canvas.js';
import { defaultExpanded, updateNode, validateMap, visibleIds, addLink } from '../../apps/life/js/app/hub-map-model.js';

const node = (id, name, hub, kind, extra = {}) => ({
  id, name, hub, kind, route: '', status: 'unreviewed', features: [], plans: [], notes: '', ...extra
});
const structure = (from, to) => ({ from, to, type: 'structure', label: '' });

function fixtureMap() {
  let map = validateMap({
    version: 1,
    nodes: [
      node('life-hub', 'Life Hub', 'central', 'hub'),
      node('hub-life', 'Life', 'life', 'hub'),
      node('life-home', 'Home', 'life', 'page'),
      node('life-body', 'Body', 'life', 'page'),
      node('body-bloods', 'Bloods', 'life', 'section'),
      node('hub-tasks', 'Tasks', 'tasks', 'hub'),
      node('tasks-board', 'Dashboard', 'tasks', 'page')
    ],
    edges: [
      structure('life-hub', 'hub-life'), structure('hub-life', 'life-home'), structure('hub-life', 'life-body'),
      structure('life-body', 'body-bloods'), structure('life-hub', 'hub-tasks'), structure('hub-tasks', 'tasks-board')
    ]
  }).map;
  map = updateNode(map, 'life-home', {
    status: 'built',
    features: ['One', 'Two'],
    plans: [{ text: 'a', done: true }, { text: 'b', done: false }]
  });
  return addLink(map, 'body-bloods', 'tasks-board', 'test');
}

function setup() {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `
    <div id="canvas"><div id="world"><svg id="edges"></svg><div id="nodes"></div></div><span id="zoom"></span></div>`;
  const calls = { select: [], toggle: [] };
  const api = createHubMapCanvas({
    canvas: document.querySelector('#canvas'),
    world: document.querySelector('#world'),
    edges: document.querySelector('#edges'),
    nodes: document.querySelector('#nodes'),
    zoomLabel: document.querySelector('#zoom'),
    onSelect: id => calls.select.push(id),
    onToggle: id => calls.toggle.push(id)
  });
  const map = fixtureMap();
  const draw = (extra = {}) => api.render({
    map,
    visible: visibleIds(map, defaultExpanded(map)),
    expanded: defaultExpanded(map),
    ...extra
  });
  return { window, document, api, calls, map, draw };
}

const cards = document => [...document.querySelectorAll('.hub-map-card')];

test('renders a card for each visible node only', () => {
  const { document, draw } = setup();
  draw();
  assert.deepEqual(cards(document).map(card => card.getAttribute('data-node-id')).sort(),
    ['hub-life', 'hub-tasks', 'life-body', 'life-home', 'life-hub', 'tasks-board']);
});

test('card shows status, feature count and plan progress', () => {
  const { document, draw } = setup();
  draw();
  const home = cards(document).find(card => card.getAttribute('data-node-id') === 'life-home');
  assert.match(home.textContent, /Built/);
  assert.match(home.textContent, /2 features/);
  assert.match(home.textContent, /1\/2 plans/);
  assert.match(home.textContent, /Life · Page/);
});

test('clicking a card selects it and the chevron toggles expansion', () => {
  const { document, calls, draw } = setup();
  draw();
  const body = cards(document).find(card => card.getAttribute('data-node-id') === 'life-body');
  body.querySelector('.hub-map-card__main').click();
  body.querySelector('.hub-map-card__toggle').click();
  assert.deepEqual(calls.select, ['life-body']);
  assert.deepEqual(calls.toggle, ['life-body']);
  const home = cards(document).find(card => card.getAttribute('data-node-id') === 'life-home');
  assert.equal(home.querySelector('.hub-map-card__toggle'), null, 'leaf cards have no toggle');
});

test('marks the selected card and dims cards that do not match the filter', () => {
  const { document, draw } = setup();
  draw({ selectedId: 'life-home', filter: 'built' });
  const byId = id => cards(document).find(card => card.getAttribute('data-node-id') === id);
  assert.ok(byId('life-home').className.includes('is-selected'));
  assert.equal(byId('life-home').className.includes('is-dim'), false);
  assert.ok(byId('life-body').className.includes('is-dim'));
  assert.equal(byId('hub-life').className.includes('is-dim'), false, 'hubs never dim');
});

test('draws structure edges plus cross-links attached to the nearest visible ancestor', () => {
  const { document, draw } = setup();
  draw();
  const structureEdges = document.querySelectorAll('.hub-map-edge--structure');
  const linkEdges = document.querySelectorAll('.hub-map-edge--link');
  assert.equal(structureEdges.length, 5);
  assert.equal(linkEdges.length, 1, 'bloods is hidden, so its link attaches to Body');
  assert.match(linkEdges[0].querySelector('title').textContent, /Bloods → Dashboard \(test\)/);
});

test('zoom label follows zoomBy and fit resets it', () => {
  const { document, api, draw } = setup();
  draw();
  assert.equal(document.querySelector('#zoom').textContent, '100%');
  api.zoomBy(1.1);
  assert.equal(document.querySelector('#zoom').textContent, '110%');
  api.fit();
  assert.equal(document.querySelector('#zoom').textContent, '100%');
});

test('destroy removes the pointer listeners', () => {
  const { window, document, api, draw } = setup();
  draw();
  api.destroy();
  const canvas = document.querySelector('#canvas');
  canvas.dispatchEvent(new window.Event('pointerdown'));
  assert.equal(canvas.classList.contains('is-panning'), false);
});
