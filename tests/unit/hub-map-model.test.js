import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLink,
  addNode,
  ancestorsOf,
  childIndex,
  defaultExpanded,
  nearestVisible,
  parentIndex,
  parseMap,
  removeLink,
  removeNode,
  statusCounts,
  updateNode,
  validateMap,
  visibleIds
} from '../../apps/life/js/app/hub-map-model.js';

const node = (id, name, hub, kind, extra = {}) => ({
  id, name, hub, kind, route: '', status: 'unreviewed', features: [], plans: [], notes: '', ...extra
});
const structure = (from, to) => ({ from, to, type: 'structure', label: '' });

function fixture() {
  return {
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
      structure('life-hub', 'hub-life'),
      structure('hub-life', 'life-home'),
      structure('hub-life', 'life-body'),
      structure('life-body', 'body-bloods'),
      structure('life-hub', 'hub-tasks'),
      structure('hub-tasks', 'tasks-board')
    ]
  };
}

test('validateMap accepts a well-formed map and fills missing list fields', () => {
  const raw = fixture();
  delete raw.nodes[2].features;
  delete raw.nodes[2].plans;
  delete raw.nodes[2].notes;
  raw.nodes[2].name = '  Home  ';
  const result = validateMap(raw);
  assert.equal(result.ok, true);
  assert.deepEqual(result.map.nodes[2].features, []);
  assert.deepEqual(result.map.nodes[2].plans, []);
  assert.equal(result.map.nodes[2].name, 'Home');
});

test('validateMap rejects structural problems', () => {
  const cases = {
    'missing central': map => { map.nodes.shift(); map.edges = map.edges.filter(e => e.from !== 'life-hub'); },
    'duplicate id': map => { map.nodes.push(node('life-home', 'Again', 'life', 'page')); },
    'dangling edge': map => { map.edges.push(structure('hub-life', 'nowhere')); },
    'two parents': map => { map.edges.push(structure('hub-tasks', 'life-home')); },
    'orphan': map => { map.nodes.push(node('lonely', 'Lonely', 'life', 'page')); },
    'cycle': map => {
      map.nodes.push(node('a', 'A', 'life', 'page'), node('b', 'B', 'life', 'page'));
      map.edges.push(structure('a', 'b'), structure('b', 'a'));
    },
    'link on central': map => { map.edges.push({ from: 'life-hub', to: 'life-home', type: 'link', label: '' }); },
    'self edge': map => { map.edges.push({ from: 'life-home', to: 'life-home', type: 'link', label: '' }); },
    'bad status': map => { map.nodes[2].status = 'done'; },
    'bad id': map => { map.nodes[2].id = 'Has Space'; }
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const map = fixture();
    mutate(map);
    assert.equal(validateMap(map).ok, false, name);
  }
  assert.equal(validateMap({ version: 2, nodes: [], edges: [] }).ok, false);
  assert.equal(validateMap(null).ok, false);
});

test('parseMap returns null for bad JSON or an invalid map', () => {
  assert.equal(parseMap('{nope'), null);
  assert.equal(parseMap(JSON.stringify({ version: 1, nodes: [], edges: [] })), null);
  assert.ok(parseMap(JSON.stringify(fixture())));
});

test('updateNode patches only editable fields and validates the result', () => {
  const map = validateMap(fixture()).map;
  const next = updateNode(map, 'life-home', { id: 'hacked', hub: 'tasks', status: 'built', features: ['a', 'b'] });
  const home = next.nodes.find(entry => entry.name === 'Home');
  assert.equal(home.id, 'life-home');
  assert.equal(home.hub, 'life');
  assert.equal(home.status, 'built');
  assert.deepEqual(home.features, ['a', 'b']);
  assert.equal(updateNode(map, 'missing', { status: 'built' }), null);
  assert.equal(updateNode(map, 'life-home', { status: 'nonsense' }), null);
  assert.equal(map.nodes[2].status, 'unreviewed', 'original map is not mutated');
});

test('addNode creates a unique id, inherits the hub and links to its parent', () => {
  const map = validateMap(fixture()).map;
  const first = addNode(map, { parentId: 'life-body', name: 'Bloods', kind: 'section' });
  assert.equal(first.id, 'bloods');
  const second = addNode(first.map, { parentId: 'life-body', name: 'Bloods', kind: 'section' });
  assert.equal(second.id, 'bloods-2');
  const added = second.map.nodes.find(entry => entry.id === 'bloods-2');
  assert.equal(added.hub, 'life');
  assert.equal(added.status, 'not-started');
  assert.ok(second.map.edges.some(edge => edge.type === 'structure' && edge.from === 'life-body' && edge.to === 'bloods-2'));
  assert.equal(addNode(map, { parentId: 'life-hub', name: 'Nope' }), null);
  assert.equal(addNode(map, { parentId: 'life-body', name: '   ' }), null);
  assert.equal(addNode(map, { parentId: 'life-body', name: '!!!' }), null);
  assert.equal(addNode(map, { parentId: 'life-body', name: 'X', kind: 'hub' }), null);
});

test('removeNode removes descendants and their edges, and refuses hubs', () => {
  let map = validateMap(fixture()).map;
  map = addLink(map, 'tasks-board', 'body-bloods');
  const next = removeNode(map, 'life-body');
  assert.deepEqual(next.nodes.map(entry => entry.id), ['life-hub', 'hub-life', 'life-home', 'hub-tasks', 'tasks-board']);
  assert.equal(next.edges.some(edge => edge.to === 'body-bloods' || edge.from === 'body-bloods'), false);
  assert.equal(removeNode(map, 'hub-life'), null);
  assert.equal(removeNode(map, 'life-hub'), null);
  assert.equal(removeNode(map, 'missing'), null);
});

test('addLink and removeLink manage cross-links', () => {
  const map = validateMap(fixture()).map;
  const linked = addLink(map, 'life-home', 'tasks-board', 'hub pulse');
  assert.deepEqual(linked.edges.at(-1), { from: 'life-home', to: 'tasks-board', type: 'link', label: 'hub pulse' });
  assert.equal(addLink(linked, 'life-home', 'tasks-board'), null, 'duplicate');
  assert.equal(addLink(map, 'life-home', 'life-home'), null, 'self');
  assert.equal(addLink(map, 'life-home', 'missing'), null, 'missing');
  assert.equal(addLink(map, 'life-hub', 'life-home'), null, 'central');
  assert.equal(removeLink(linked, 'life-home', 'tasks-board').edges.some(edge => edge.type === 'link'), false);
  assert.equal(removeLink(map, 'life-home', 'tasks-board'), null);
});

test('visibleIds follows the expanded set and defaultExpanded opens hubs only', () => {
  const map = validateMap(fixture()).map;
  const expanded = defaultExpanded(map);
  assert.deepEqual([...expanded].sort(), ['hub-life', 'hub-tasks', 'life-hub']);
  assert.deepEqual([...visibleIds(map, expanded)].sort(),
    ['hub-life', 'hub-tasks', 'life-hub', 'life-body', 'life-home', 'tasks-board'].sort());
  expanded.add('life-body');
  assert.ok(visibleIds(map, expanded).has('body-bloods'));
  expanded.delete('hub-life');
  assert.equal(visibleIds(map, expanded).has('life-home'), false);
  assert.equal(visibleIds(map, expanded).has('body-bloods'), false);
});

test('nearestVisible climbs to the closest visible ancestor', () => {
  const map = validateMap(fixture()).map;
  const parents = parentIndex(map);
  const visible = visibleIds(map, defaultExpanded(map));
  assert.equal(nearestVisible(parents, 'body-bloods', visible), 'life-body');
  assert.equal(nearestVisible(parents, 'life-home', visible), 'life-home');
  assert.equal(nearestVisible(parents, 'missing', visible), null);
  assert.deepEqual(ancestorsOf(parents, 'body-bloods'), ['life-body', 'hub-life', 'life-hub']);
});

test('childIndex keeps node order and statusCounts ignores the central node', () => {
  const map = validateMap(fixture()).map;
  assert.deepEqual(childIndex(map).get('hub-life'), ['life-home', 'life-body']);
  assert.deepEqual(statusCounts(map), { unreviewed: 6, 'not-started': 0, partial: 0, built: 0 });
});
