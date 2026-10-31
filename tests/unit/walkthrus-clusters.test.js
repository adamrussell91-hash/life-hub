import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addToCluster, belowTitle, clustersFromPicked, clusterTileIds, isClusterId, MAX_CLUSTERS, MAX_CLUSTER_TILES, newClusterId, nextCell, normalizeClusters, touchingFreeCells
} from '../../packages/walkthrus/clusters.mjs';
import { normalizeArrows, normalizePicked } from '../../packages/walkthrus/arrows.mjs';
import { CATALOGUE } from '../../packages/walkthrus/catalogue.mjs';
import { createWalkthrusBoardHandler } from '../../netlify/functions/walkthrus-board.mjs';

const A = 'w1-cold-calling';
const B = 'w1-quizzing';
const FU = 'fu_abc123def';
const techniques = CATALOGUE.filter((e) => e.kind === 'technique').map((e) => e.id);

test('normalizeClusters keeps valid clusters and drops junk', () => {
  const out = normalizeClusters([
    { id: 'cl_one', name: '  Starters  ', x: 12.345, y: 'no', tiles: [{ id: A, q: 0, r: 0 }, { id: A, q: 1, r: 0 }, { id: B, q: 0, r: 0 }, { id: B, q: 1.5, r: 0 }, { id: 'nope', q: 2, r: 0 }, { id: FU, q: 0, r: 1 }] },
    { id: 'cl_one', name: 'Twin' },
    { id: 'CL_bad', name: 'Bad id' },
    { id: 'cl_blank', name: '   ' },
    { id: 'cl_long', name: 'x'.repeat(60), x: 1, y: 2, tiles: 'junk' },
    null, 'text'
  ]);
  assert.deepEqual(out, [
    { id: 'cl_one', name: 'Starters', x: 12.3, y: 0, tiles: [{ id: A, q: 0, r: 0 }, { id: FU, q: 0, r: 1 }] },
    { id: 'cl_long', name: 'x'.repeat(40), x: 1, y: 2, tiles: [] }
  ]);
  assert.deepEqual(normalizeClusters('nope'), []);
});

test('normalizeClusters caps clusters and tiles', () => {
  const many = Array.from({ length: MAX_CLUSTERS + 5 }, (_, i) => ({ id: `cl_${i}`, name: `Group ${i}`, x: 0, y: 0, tiles: [] }));
  assert.equal(normalizeClusters(many).length, MAX_CLUSTERS);
  const tiles = techniques.slice(0, MAX_CLUSTER_TILES + 5).map((id, i) => ({ id, q: i, r: 0 }));
  assert.equal(normalizeClusters([{ id: 'cl_big', name: 'Big', x: 0, y: 0, tiles }])[0].tiles.length, Math.min(MAX_CLUSTER_TILES, tiles.length));
});

test('a tile may sit in several clusters', () => {
  const out = normalizeClusters([
    { id: 'cl_a', name: 'A', x: 0, y: 0, tiles: [{ id: A, q: 0, r: 0 }] },
    { id: 'cl_b', name: 'B', x: 500, y: 0, tiles: [{ id: A, q: 0, r: 0 }] }
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(clusterTileIds(out), [A]);
});

test('clustersFromPicked packs the picks into one compact honeycomb under the title', () => {
  const picked = techniques.slice(0, 9);
  const [c] = clustersFromPicked([...picked, 'nope', picked[0]]);
  assert.equal(c.id, 'cl_board');
  assert.equal(c.name, 'My board');
  assert.deepEqual(c.tiles.map((t) => t.id), picked);
  assert.deepEqual(c.tiles[0], { id: picked[0], q: 0, r: 0 });
  const cells = new Set(c.tiles.map((t) => `${t.q},${t.r}`));
  assert.equal(cells.size, picked.length, 'no two on one cell');
  for (const t of c.tiles) assert.ok(belowTitle(t.q, t.r), `${t.q},${t.r} under the title`);
  // every tile after the first touches an earlier one
  c.tiles.forEach((t, i) => {
    if (!i) return;
    const touches = c.tiles.slice(0, i).some((o) => { const dq = t.q - o.q; const dr = t.r - o.r; return Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr) === 2; });
    assert.ok(touches, `${t.id} touches the cluster`);
  });
  assert.deepEqual(normalizeClusters(clustersFromPicked(picked)), clustersFromPicked(picked), 'stays valid');
  assert.deepEqual(clustersFromPicked(null)[0].tiles, []);
});

test('touching free cells and the next cell', () => {
  assert.deepEqual(touchingFreeCells([]), [{ q: 0, r: 0 }]);
  const free = touchingFreeCells([{ id: A, q: 0, r: 0 }]);
  assert.ok(free.every((c) => belowTitle(c.q, c.r)));
  assert.ok(!free.some((c) => c.q === 0 && c.r === 0));
  assert.deepEqual(nextCell([]), { q: 0, r: 0 });
  const cluster = addToCluster(addToCluster({ id: 'cl_x', name: 'X', x: 0, y: 0, tiles: [] }, A), B);
  assert.equal(cluster.tiles.length, 2);
  assert.equal(addToCluster(cluster, A), cluster, 'already there');
});

test('cluster ids', () => {
  assert.ok(isClusterId(newClusterId()));
  assert.ok(!isClusterId('cl_'));
  assert.ok(!isClusterId('cl_' + 'a'.repeat(31)));
});

test('arrows and picks accept fusion tiles', () => {
  assert.equal(normalizeArrows([{ id: 'a1', from: FU, to: A, type: 'leads_to' }]).length, 1);
  assert.deepEqual(normalizePicked([FU, 'fu_x', A]), [FU, A]);
});

function store() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : null; },
    async setJSON(k, v) { map.set(k, structuredClone(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const gateEnv = { GITHUB_TOKEN: 't', LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
const post = (url, body) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const URL_ = 'https://example.test/api/walkthrus-board';

test('the board endpoint serves clusters, made from picks until some are saved', async () => {
  const s = store();
  const handler = createWalkthrusBoardHandler({ env: gateEnv, getContentStore: async () => s, verifySessionToken: () => ({ valid: true }) });
  const read = async () => (await (await handler(new Request(URL_))).json()).data.board;
  const empty = await read();
  assert.deepEqual(empty.clusters, [{ id: 'cl_board', name: 'My board', x: 0, y: 0, tiles: [] }]);
  assert.deepEqual(empty.fusions, []);
  await handler(post(URL_, { picked: [A, B] }));
  assert.deepEqual((await read()).clusters[0].tiles.map((t) => t.id), [A, B]);

  const mine = [{ id: 'cl_starts', name: 'Starts', x: 40, y: -20, tiles: [{ id: B, q: 0, r: 0 }, { id: 'nope', q: 1, r: 0 }] }];
  const saved = await (await handler(post(URL_, { clusters: mine }))).json();
  assert.deepEqual(saved.data.board.clusters, [{ id: 'cl_starts', name: 'Starts', x: 40, y: -20, tiles: [{ id: B, q: 0, r: 0 }] }]);
  // saving arrows alone keeps the clusters and picks
  await handler(post(URL_, { arrows: [{ id: 'a1', from: A, to: B, type: 'leads_to' }] }));
  const board = await read();
  assert.deepEqual(board.clusters.map((c) => c.id), ['cl_starts']);
  assert.deepEqual(board.picked, [A, B]);
  assert.deepEqual(board.arrows.map((a) => a.id), ['a1']);
  assert.deepEqual(board.fusions, []);
  // junk fusions drop out
  await handler(post(URL_, { fusions: [{ id: 'nope' }] }));
  assert.deepEqual((await read()).fusions, []);
});
