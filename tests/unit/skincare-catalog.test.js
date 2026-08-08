import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINCARE_CATALOG_PATH,
  emptyCatalog,
  parseCatalog,
  resolveActiveProducts,
  appendProduct,
  retireProduct
} from '../../js/app/skincare-catalog.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

test('SKINCARE_CATALOG_PATH is the GitHub blob path', () => {
  assert.equal(SKINCARE_CATALOG_PATH, 'data/skincare/routine-catalog.json');
});

test('parseCatalog returns null for invalid input', () => {
  assert.equal(parseCatalog(null), null);
  assert.equal(parseCatalog('nope'), null);
  assert.equal(parseCatalog({}), null);
});

test('resolveActiveProducts uses defaults when catalog missing', () => {
  assert.deepEqual(
    resolveActiveProducts('am', null, SKINCARE_ROUTINES),
    [...SKINCARE_ROUTINES.am.products]
  );
});

test('resolveActiveProducts prefers catalog products and drops retired', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  catalog.am.products = ['Cleanser A', 'Moisturizer B'];
  catalog.am.retired = ['Moisturizer B'];
  assert.deepEqual(resolveActiveProducts('am', catalog, SKINCARE_ROUTINES), ['Cleanser A']);
});

test('appendProduct appends without wiping and skips duplicates', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  const base = [...catalog.am.products];
  const next = appendProduct(catalog, 'am', 'New Cleanser');
  assert.deepEqual(next.am.products.slice(0, base.length), base);
  assert.ok(next.am.products.includes('New Cleanser'));
  const again = appendProduct(next, 'am', 'New Cleanser');
  assert.equal(again.am.products.filter(n => n === 'New Cleanser').length, 1);
});

test('appendProduct refuses blank names', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  assert.equal(appendProduct(catalog, 'am', '  '), null);
});

test('appendProduct refuses retired names without un-retiring', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  catalog.am.retired = ['Old Serum'];
  assert.equal(appendProduct(catalog, 'am', 'Old Serum'), null);
  assert.equal(catalog.am.products.includes('Old Serum'), false);
  assert.deepEqual(catalog.am.retired, ['Old Serum']);
});

test('retireProduct moves from products to retired', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  const name = catalog.pm.products[0];
  const next = retireProduct(catalog, 'pm', name);
  assert.equal(next.pm.products.includes(name), false);
  assert.ok(next.pm.retired.includes(name));
});

test('retireProduct is a no-op for unknown names', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  const next = retireProduct(catalog, 'am', 'Not A Real Product');
  assert.deepEqual(next, catalog);
});
