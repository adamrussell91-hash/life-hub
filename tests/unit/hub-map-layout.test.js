import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMap, visibleIds } from '../../apps/life/js/app/hub-map-model.js';
import {
  CARD_H, CARD_W, COL_PITCH, ROW_PITCH, layoutMap, linkPath, structurePath
} from '../../apps/life/js/app/hub-map-layout.js';

const node = (id, hub, kind) => ({
  id, name: id, hub, kind, route: '', status: 'unreviewed', features: [], plans: [], notes: ''
});
const structure = (from, to) => ({ from, to, type: 'structure', label: '' });

function fixture() {
  return validateMap({
    version: 1,
    nodes: [
      node('life-hub', 'central', 'hub'),
      node('hub-life', 'life', 'hub'),
      node('life-home', 'life', 'page'),
      node('life-body', 'life', 'page'),
      node('body-bloods', 'life', 'section'),
      node('hub-tasks', 'tasks', 'hub'),
      node('tasks-board', 'tasks', 'page')
    ],
    edges: [
      structure('life-hub', 'hub-life'), structure('hub-life', 'life-home'), structure('hub-life', 'life-body'),
      structure('life-body', 'body-bloods'), structure('life-hub', 'hub-tasks'), structure('hub-tasks', 'tasks-board')
    ]
  }).map;
}

test('layoutMap gives each leaf a row and centres parents on their children', () => {
  const map = fixture();
  const { positions, width, height } = layoutMap(map, visibleIds(map, new Set(map.nodes.map(n => n.id))));
  assert.equal(positions.get('life-home').y, 0);
  assert.equal(positions.get('body-bloods').y, ROW_PITCH);
  assert.equal(positions.get('tasks-board').y, ROW_PITCH * 2);
  assert.equal(positions.get('life-body').y, ROW_PITCH);
  assert.equal(positions.get('hub-life').y, ROW_PITCH / 2);
  assert.equal(positions.get('hub-tasks').y, ROW_PITCH * 2);
  assert.equal(positions.get('life-hub').y, (ROW_PITCH / 2 + ROW_PITCH * 2) / 2);
  assert.equal(positions.get('hub-life').x, COL_PITCH);
  assert.equal(positions.get('body-bloods').x, COL_PITCH * 3);
  assert.equal(width, COL_PITCH * 3 + CARD_W);
  assert.equal(height, ROW_PITCH * 2 + CARD_H);
});

test('layoutMap never overlaps two visible cards', () => {
  const map = fixture();
  const visible = visibleIds(map, new Set(map.nodes.map(n => n.id)));
  const rects = [...layoutMap(map, visible).positions.values()];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, `${i} overlaps ${j}`);
    }
  }
});

test('layoutMap only places visible nodes', () => {
  const map = fixture();
  const visible = visibleIds(map, new Set(['life-hub']));
  const { positions } = layoutMap(map, visible);
  assert.deepEqual([...positions.keys()].sort(), ['hub-life', 'hub-tasks', 'life-hub']);
  const opened = layoutMap(map, visibleIds(map, new Set(['life-hub', 'hub-life', 'hub-tasks']))).positions;
  assert.equal(opened.has('life-home'), true);
  assert.equal(opened.has('body-bloods'), false);
});

test('paths curve between cards for structure, forward, backward and same-column links', () => {
  const a = { x: 0, y: 0, w: 100, h: 40 };
  const right = { x: 200, y: 100, w: 100, h: 40 };
  const left = { x: -300, y: 100, w: 100, h: 40 };
  const below = { x: 0, y: 200, w: 100, h: 40 };
  assert.equal(structurePath(a, right), 'M100 20 C150 20 150 120 200 120');
  assert.equal(linkPath(a, right), structurePath(a, right));
  assert.equal(linkPath(a, left), 'M0 20 C-100 20 -100 120 -200 120');
  assert.match(linkPath(a, below), /^M100 20 C\S+ 20 \S+ 220 100 220$/);
});
