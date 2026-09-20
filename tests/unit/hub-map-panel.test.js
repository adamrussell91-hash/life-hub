import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderHubMapPanel } from '../../apps/life/js/app/hub-map-panel.js';
import { addLink, updateNode, validateMap } from '../../apps/life/js/app/hub-map-model.js';

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
      node('life-home', 'Home', 'life', 'page', {
        features: ['Pulse cards'],
        plans: [{ text: 'Polish', done: false }],
        notes: 'hello'
      }),
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
  map = addLink(map, 'life-home', 'tasks-board', 'pulse');
  return updateNode(map, 'life-home', { status: 'partial' });
}

function setup(nodeId = 'life-home') {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<aside id="panel"></aside>';
  const host = document.querySelector('#panel');
  const log = [];
  const handlers = {
    onChange: patch => log.push(['change', patch]),
    onAddChild: (name, kind) => log.push(['child', name, kind]),
    onRemove: () => log.push(['remove']),
    onAddLink: id => log.push(['addLink', id]),
    onRemoveLink: (from, to) => log.push(['removeLink', from, to]),
    onSelect: id => log.push(['select', id]),
    onClose: () => log.push(['close'])
  };
  const map = fixtureMap();
  const draw = id => renderHubMapPanel(host, { map, nodeId: id ?? nodeId, handlers });
  draw();
  return { window, document, host, log, draw, map };
}

const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { cancelable: true }));
const change = (window, control) => control.dispatchEvent(new window.Event('change', { bubbles: true }));

test('is hidden and empty without a node', () => {
  const { host, draw } = setup();
  draw('missing');
  assert.equal(host.hidden, true);
  assert.equal(host.children.length, 0);
});

test('shows the node title, hub and current values', () => {
  const { host } = setup();
  assert.match(host.querySelector('.hub-map-panel__title').textContent, /Home/);
  assert.match(host.querySelector('.hub-map-panel__eyebrow').textContent, /Life · Page/);
  assert.equal(host.querySelector('select').value, 'partial');
  assert.equal(host.querySelector('textarea').value, 'hello');
  assert.match(host.textContent, /Pulse cards/);
  assert.match(host.textContent, /Polish/);
});

test('changing status, name, route and notes reports a patch', () => {
  const { window, host, log } = setup();
  const [name, route] = host.querySelectorAll('input[type="text"]');
  const status = host.querySelector('select');
  status.value = 'built';
  change(window, status);
  name.value = ' Home page ';
  change(window, name);
  route.value = '#home';
  change(window, route);
  const notes = host.querySelector('textarea');
  notes.value = 'new';
  change(window, notes);
  assert.deepEqual(log, [
    ['change', { status: 'built' }],
    ['change', { name: ' Home page ' }],
    ['change', { route: '#home' }],
    ['change', { notes: 'new' }]
  ]);
});

test('an empty name is refused and restored', () => {
  const { window, host, log } = setup();
  const name = host.querySelector('input[type="text"]');
  name.value = '   ';
  change(window, name);
  assert.equal(name.value, 'Home');
  assert.equal(log.length, 0);
});

test('features can be added and removed', () => {
  const { window, host, log } = setup();
  const form = host.querySelector('[data-focus="add-feature"]').closest('form');
  form.querySelector('input').value = ' Search ';
  submit(window, form);
  host.querySelector('[aria-label="Remove Pulse cards"]').click();
  form.querySelector('input').value = '   ';
  submit(window, form);
  assert.deepEqual(log, [
    ['change', { features: ['Pulse cards', 'Search'] }],
    ['change', { features: [] }]
  ]);
});

test('plans can be added, ticked and removed', () => {
  const { window, host, log } = setup();
  const form = host.querySelector('[data-focus="add-plan"]').closest('form');
  form.querySelector('input').value = 'Ship it';
  submit(window, form);
  const check = host.querySelector('input[type="checkbox"]');
  check.checked = true;
  change(window, check);
  host.querySelector('[aria-label="Remove Polish"]').click();
  assert.deepEqual(log, [
    ['change', { plans: [{ text: 'Polish', done: false }, { text: 'Ship it', done: false }] }],
    ['change', { plans: [{ text: 'Polish', done: true }] }],
    ['change', { plans: [] }]
  ]);
});

test('connections list parent, links out, and offer other pages to link to', () => {
  const { window, host, log } = setup();
  const text = host.textContent;
  assert.match(text, /Part of/);
  assert.match(text, /Dashboard \(pulse\)/);
  host.querySelector('[aria-label="Remove link to Dashboard"]').click();
  const picker = host.querySelector('[aria-label="Link to another page"]');
  const values = [...picker.querySelectorAll('option')].map(option => option.value);
  assert.equal(values.includes('life-hub'), false, 'never the central node');
  assert.equal(values.includes('life-home'), false, 'never itself');
  assert.equal(values.includes('tasks-board'), false, 'not already linked');
  assert.equal(values.includes('life-body'), true);
  picker.value = 'life-body';
  change(window, picker);
  assert.deepEqual(log, [['removeLink', 'life-home', 'tasks-board'], ['addLink', 'life-body']]);
});

test('jump buttons select the related node', () => {
  const { host, log } = setup();
  [...host.querySelectorAll('.hub-map-panel__jump')].find(b => b.textContent === 'Life').click();
  assert.deepEqual(log, [['select', 'hub-life']]);
});

test('adds a child page with a kind', () => {
  const { window, host, log } = setup('life-body');
  const form = host.querySelector('[data-focus="add-child"]').closest('form');
  form.querySelector('input').value = 'Scan results';
  form.querySelector('select').value = 'section';
  submit(window, form);
  assert.deepEqual(log, [['child', 'Scan results', 'section']]);
});

test('removing needs a confirmation that counts what goes with it', () => {
  const { host, log } = setup('life-body');
  host.querySelector('.hub-map-panel__danger button').click();
  assert.match(host.querySelector('.hub-map-panel__confirm').textContent, /Body and 1 page inside it/);
  assert.equal(log.length, 0);
  [...host.querySelectorAll('.hub-map-panel__danger button')].find(b => b.textContent === 'Remove').click();
  assert.deepEqual(log, [['remove']]);
});

test('cancel restores the panel and hubs cannot be removed', () => {
  const { host, draw } = setup('life-home');
  host.querySelector('.hub-map-panel__danger button').click();
  [...host.querySelectorAll('.hub-map-panel__danger button')].find(b => b.textContent === 'Cancel').click();
  assert.ok(host.querySelector('.hub-map-panel__danger button'));
  draw('hub-life');
  assert.equal(host.querySelector('.hub-map-panel__danger'), null);
});

test('close reports onClose', () => {
  const { host, log } = setup();
  host.querySelector('.hub-map-panel__close').click();
  assert.deepEqual(log, [['close']]);
});
