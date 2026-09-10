import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPendingCnPatchId,
  parsePendingCnPatches,
  serializePendingCnPatches,
  addPendingCnPatch,
  removePendingCnPatchById,
  findPendingCnPatchById,
  purgeStalePendingCnPatches,
  formatPendingCnPatchesForPrompt,
  MAX_PENDING_CN_PATCHES
} from '../../netlify/functions/_shared/cn-patch-queue.mjs';

const samplePatch = { section: 'long_term_trends', op: 'condense', payload: { summary: 'Condense Trends.' } };

function entry(id, createdAt = '2026-08-29') {
  return { id, createdAt, slug: 'hammond', patch: samplePatch };
}

test('createPendingCnPatchId produces a distinct cnp_-prefixed id each time', () => {
  const a = createPendingCnPatchId();
  const b = createPendingCnPatchId();
  assert.match(a, /^cnp_[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

test('parsePendingCnPatches tolerates missing, corrupt, and non-array content', () => {
  assert.deepEqual(parsePendingCnPatches(''), []);
  assert.deepEqual(parsePendingCnPatches('not json'), []);
  assert.deepEqual(parsePendingCnPatches('{"not":"an array"}'), []);
  assert.deepEqual(parsePendingCnPatches(undefined), []);
});

test('parsePendingCnPatches filters out malformed entries but keeps valid ones', () => {
  const text = JSON.stringify([
    entry('cnp_a'),
    { id: 'cnp_b' }, // missing createdAt/slug/patch
    null,
    'not an object'
  ]);
  const parsed = parsePendingCnPatches(text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'cnp_a');
});

test('serializePendingCnPatches round-trips through parsePendingCnPatches', () => {
  const list = [entry('cnp_a'), entry('cnp_b')];
  const text = serializePendingCnPatches(list);
  assert.deepEqual(parsePendingCnPatches(text), list);
});

test('addPendingCnPatch appends and caps at MAX_PENDING_CN_PATCHES, dropping oldest first', () => {
  const many = Array.from({ length: MAX_PENDING_CN_PATCHES }, (_, index) => entry(`cnp_${index}`));
  const next = addPendingCnPatch(many, entry('cnp_new'));
  assert.equal(next.length, MAX_PENDING_CN_PATCHES);
  assert.equal(next[next.length - 1].id, 'cnp_new');
  assert.equal(next.some(item => item.id === 'cnp_0'), false);
});

test('addPendingCnPatch ignores a malformed entry', () => {
  const base = [entry('cnp_a')];
  assert.equal(addPendingCnPatch(base, { id: 'missing fields' }), base);
});

test('removePendingCnPatchById removes the matching entry and is a no-op for an unknown id', () => {
  const base = [entry('cnp_a'), entry('cnp_b')];
  assert.deepEqual(removePendingCnPatchById(base, 'cnp_a'), [entry('cnp_b')]);
  assert.deepEqual(removePendingCnPatchById(base, 'cnp_unknown'), base);
});

test('findPendingCnPatchById finds an entry or returns null', () => {
  const base = [entry('cnp_a'), entry('cnp_b')];
  assert.equal(findPendingCnPatchById(base, 'cnp_b').id, 'cnp_b');
  assert.equal(findPendingCnPatchById(base, 'cnp_unknown'), null);
});

test('purgeStalePendingCnPatches drops entries past the TTL and keeps malformed dates', () => {
  const base = [
    entry('cnp_fresh', '2026-08-20'),
    entry('cnp_stale', '2026-07-01'),
    entry('cnp_malformed', 'not-a-date')
  ];
  const next = purgeStalePendingCnPatches(base, '2026-08-29');
  const ids = next.map(item => item.id);
  assert.ok(ids.includes('cnp_fresh'));
  assert.ok(ids.includes('cnp_malformed'));
  assert.ok(!ids.includes('cnp_stale'));
});

test('formatPendingCnPatchesForPrompt renders a bounded, human-readable list', () => {
  const base = [entry('cnp_a'), entry('cnp_b')];
  const text = formatPendingCnPatchesForPrompt(base);
  assert.match(text, /cnp_a/);
  assert.match(text, /Condense Trends\./);
  assert.match(text, /section: long_term_trends, op: condense/);
});

test('formatPendingCnPatchesForPrompt returns empty string for an empty queue', () => {
  assert.equal(formatPendingCnPatchesForPrompt([]), '');
});
