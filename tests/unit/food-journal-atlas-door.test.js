import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_URL, bindLongPress, isAtlasDoor, openAtlas } from '../../apps/life/js/food-journal/atlas-door.js';

test('food journal: only "maccas" opens the Atlas door', () => {
  assert.equal(isAtlasDoor('maccas'), true);
  assert.equal(isAtlasDoor('  MACCAS '), true);
  assert.equal(isAtlasDoor('macca'), false);
  assert.equal(isAtlasDoor('maccas burger'), false);
  assert.equal(isAtlasDoor(''), false);
});

test('food journal: the door goes to the Atlas in Travel', () => {
  const visited = [];
  openAtlas({ location: { assign: (url) => visited.push(url) } });
  assert.deepEqual(visited, ['/travel/#/atlas']);
  assert.equal(ATLAS_URL, '/travel/#/atlas');
});

function fakeNode() {
  const handlers = {};
  return {
    addEventListener: (type, fn) => (handlers[type] = fn),
    fire: (type, e = {}) => handlers[type]?.({ clientX: 0, clientY: 0, button: 0, preventDefault() {}, ...e })
  };
}

test('food journal: a held press on the masthead opens, a quick tap or drag does not', async () => {
  const node = fakeNode();
  let opened = 0;
  bindLongPress(node, () => (opened += 1), 20);
  node.fire('pointerdown');
  node.fire('pointerup');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(opened, 0);
  node.fire('pointerdown');
  node.fire('pointermove', { clientX: 30, clientY: 0 });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(opened, 0);
  node.fire('pointerdown');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(opened, 1);
});
