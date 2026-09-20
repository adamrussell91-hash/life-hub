import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHubMapSeed } from '../../apps/life/js/app/hub-map-seed.js';
import { defaultExpanded, validateMap, visibleIds } from '../../apps/life/js/app/hub-map-model.js';

test('the seed is a valid map', () => {
  const result = validateMap(buildHubMapSeed());
  assert.deepEqual(result.errors ?? [], []);
  assert.equal(result.ok, true);
});

test('the seed covers the five hubs and stays at template level', () => {
  const { nodes } = buildHubMapSeed();
  const hubs = nodes.filter(node => node.kind === 'hub' && node.id !== 'life-hub').map(node => node.hub);
  assert.deepEqual(hubs, ['life', 'teaching', 'knowledge', 'tasks', 'professional']);
  assert.ok(nodes.length >= 80 && nodes.length <= 110, `unexpected size ${nodes.length}`);
  const visible = visibleIds(validateMap(buildHubMapSeed()).map, defaultExpanded(validateMap(buildHubMapSeed()).map));
  assert.ok(visible.size < nodes.length, 'sections and page types start hidden');
});

test('every page starts unreviewed except the map itself', () => {
  const { nodes } = buildHubMapSeed();
  const others = nodes.filter(node => node.id !== 'life-hub-map' && node.kind !== 'hub');
  assert.ok(others.every(node => node.status === 'unreviewed'));
  assert.equal(nodes.find(node => node.id === 'life-hub-map').status, 'partial');
});

test('buildHubMapSeed returns a fresh copy each call', () => {
  const a = buildHubMapSeed();
  a.nodes[1].name = 'changed';
  assert.notEqual(buildHubMapSeed().nodes[1].name, 'changed');
});
