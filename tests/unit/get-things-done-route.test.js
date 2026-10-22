// tests/unit/get-things-done-route.test.js
// The route: the book's five sections as stations in the order a piece of work lives through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE, ROUTE_IDS, parseRoute, routeSections } from '../../packages/get-things-done/route.mjs';
import { SECTIONS } from '../../packages/get-things-done/catalogue.mjs';

test('five stations in a work’s order, one per section', () => {
  assert.deepEqual(ROUTE_IDS, ['before', 'doing', 'others', 'differently', 'after']);
  assert.deepEqual([...ROUTE.map((r) => r.section)].sort(), SECTIONS.map((s) => s.key).sort());
  for (const s of SECTIONS) assert.equal(ROUTE.find((r) => r.id === s.route).section, s.key);
});

test('parseRoute keeps up to two known stations, in route order', () => {
  assert.deepEqual(parseRoute('doing+before'), ['before', 'doing']);
  assert.deepEqual(parseRoute('after, others and differently'), ['others', 'differently']);
  assert.deepEqual(parseRoute('nowhere'), []);
  assert.deepEqual(parseRoute(undefined), []);
});

test('routeSections maps a stored value to section keys', () => {
  assert.deepEqual(routeSections('others+after'), ['working_with_others', 'reviewing']);
});
