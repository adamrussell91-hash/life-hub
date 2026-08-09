import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINCARE_PRODUCT_LIBRARY_PATH,
  emptyProductLibrary,
  parseProductLibrary,
  slugifyProductId,
  searchProductLibrary,
  saveProductLibraryEntry,
  findProductByName,
  seedProductLibraryFromDefaults,
  migrateProductLibraryFromCatalog
} from '../../js/app/skincare-product-library.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

test('path is data/skincare/product-library.json', () => {
  assert.equal(SKINCARE_PRODUCT_LIBRARY_PATH, 'data/skincare/product-library.json');
});

test('parseProductLibrary returns null for garbage', () => {
  assert.equal(parseProductLibrary(null), null);
  assert.equal(parseProductLibrary('{}'), null);
  assert.equal(parseProductLibrary({ schema_version: 1 }), null);
});

test('slugifyProductId lowercases and dashes', () => {
  assert.equal(slugifyProductId('CeraVe Foam!'), 'cerave-foam');
});

test('saveProductLibraryEntry creates with unique id', () => {
  const lib = emptyProductLibrary();
  const next = saveProductLibraryEntry(lib, { name: 'CeraVe Foam' });
  assert.equal(next.products.length, 1);
  assert.equal(next.products[0].name, 'CeraVe Foam');
  assert.equal(next.products[0].id, 'cerave-foam');
});

test('saveProductLibraryEntry rejects blank name', () => {
  assert.equal(saveProductLibraryEntry(emptyProductLibrary(), { name: '  ' }), null);
});

test('saveProductLibraryEntry updates existing by id', () => {
  let lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'CeraVe Foam' });
  const id = lib.products[0].id;
  lib = saveProductLibraryEntry(lib, { id, name: 'CeraVe Foaming Cleanser', notes: 'AM' });
  assert.equal(lib.products.length, 1);
  assert.equal(lib.products[0].name, 'CeraVe Foaming Cleanser');
  assert.equal(lib.products[0].notes, 'AM');
});

test('findProductByName is case-insensitive exact', () => {
  const lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'CeraVe Foam' });
  assert.equal(findProductByName(lib, 'cerave foam').id, 'cerave-foam');
});

test('searchProductLibrary matches tokens', () => {
  let lib = emptyProductLibrary();
  lib = saveProductLibraryEntry(lib, { name: 'CeraVe Foaming Cleanser' });
  lib = saveProductLibraryEntry(lib, { name: 'The Ordinary HA' });
  const hits = searchProductLibrary(lib, 'cerave clean');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, 'CeraVe Foaming Cleanser');
});

test('seedProductLibraryFromDefaults includes AM and PM unique names', () => {
  const lib = seedProductLibraryFromDefaults(SKINCARE_ROUTINES);
  const names = new Set(lib.products.map(p => p.name));
  for (const name of SKINCARE_ROUTINES.am.products) assert.ok(names.has(name));
  for (const name of SKINCARE_ROUTINES.pm.products) assert.ok(names.has(name));
});

test('migrateProductLibraryFromCatalog folds products and retired', () => {
  const catalog = {
    schema_version: 1,
    am: { products: ['A'], retired: ['B'], extras: [] },
    pm: { products: ['A', 'C'], retired: [], extras: [] }
  };
  const lib = migrateProductLibraryFromCatalog(catalog);
  const names = lib.products.map(p => p.name).sort();
  assert.deepEqual(names, ['A', 'B', 'C']);
});
