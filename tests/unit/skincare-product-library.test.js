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
  migrateProductLibraryFromCatalog,
  normalizeProductStatus,
  groupProductsByCategory,
  defaultCategoryForProductName,
  upgradeOtherProductCategories
} from '../../apps/life/js/app/skincare-product-library.js';
import { SKINCARE_ROUTINES } from '../../apps/life/js/app/skincare-routines-data.js';

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
  const next = saveProductLibraryEntry(lib, { name: 'CeraVe Foam', category: 'Cleanser' });
  assert.equal(next.products.length, 1);
  assert.equal(next.products[0].name, 'CeraVe Foam');
  assert.equal(next.products[0].id, 'cerave-foam');
  assert.equal(next.products[0].category, 'Cleanser');
});

test('saveProductLibraryEntry rejects blank name', () => {
  assert.equal(saveProductLibraryEntry(emptyProductLibrary(), { name: '  ', category: 'Serum' }), null);
});

test('saveProductLibraryEntry requires category on create', () => {
  assert.equal(saveProductLibraryEntry(emptyProductLibrary(), { name: 'X' }), null);
  const next = saveProductLibraryEntry(emptyProductLibrary(), {
    name: 'X',
    category: 'Serum',
    brand: 'Brand'
  });
  assert.equal(next.products[0].category, 'Serum');
  assert.equal(next.products[0].status, 'in_use');
  assert.equal(next.products[0].brand, 'Brand');
});

test('saveProductLibraryEntry updates existing by id', () => {
  let lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'CeraVe Foam', category: 'Cleanser' });
  const id = lib.products[0].id;
  lib = saveProductLibraryEntry(lib, { id, name: 'CeraVe Foaming Cleanser', notes: 'AM' });
  assert.equal(lib.products.length, 1);
  assert.equal(lib.products[0].name, 'CeraVe Foaming Cleanser');
  assert.equal(lib.products[0].notes, 'AM');
  assert.equal(lib.products[0].category, 'Cleanser');
});

test('saveProductLibraryEntry update preserves omitted fields', () => {
  let lib = saveProductLibraryEntry(emptyProductLibrary(), {
    name: 'X', category: 'Serum', brand: 'B', notes: 'n'
  });
  const id = lib.products[0].id;
  lib = saveProductLibraryEntry(lib, { id, name: 'X2', category: 'Serum' });
  assert.equal(lib.products[0].brand, 'B');
  assert.equal(lib.products[0].notes, 'n');
  assert.equal(lib.products[0].name, 'X2');
});

test('findProductByName is case-insensitive exact', () => {
  const lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'CeraVe Foam', category: 'Cleanser' });
  assert.equal(findProductByName(lib, 'cerave foam').id, 'cerave-foam');
});

test('searchProductLibrary matches tokens', () => {
  let lib = emptyProductLibrary();
  lib = saveProductLibraryEntry(lib, { name: 'CeraVe Foaming Cleanser', category: 'Cleanser' });
  lib = saveProductLibraryEntry(lib, { name: 'The Ordinary HA', category: 'Serum' });
  const hits = searchProductLibrary(lib, 'cerave clean');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, 'CeraVe Foaming Cleanser');
});

test('searchProductLibrary matches brand category status', () => {
  const lib = saveProductLibraryEntry(emptyProductLibrary(), {
    name: 'Cicaplast',
    category: 'Moisturiser',
    brand: 'La Roche Posay',
    status: 'in_use'
  });
  assert.equal(searchProductLibrary(lib, 'roche moisturiser').length, 1);
});

test('parseProductLibrary normalizes rich fields', () => {
  const lib = parseProductLibrary({
    schema_version: 1,
    products: [{
      id: 'ha',
      name: 'HA 2% + B5',
      brand: 'The Ordinary',
      category: 'Serum',
      status: 'In Use',
      purpose: 'Hydration',
      active_ingredients: ['Hyaluronic Acid'],
      cost: 'A$12',
      purchase_date: '2026-01-01',
      opened_date: null,
      finished_date: null,
      notes: 'AM/PM',
      hint: 'backup'
    }]
  });
  assert.equal(lib.products[0].status, 'in_use');
  assert.equal(lib.products[0].brand, 'The Ordinary');
  assert.deepEqual(lib.products[0].active_ingredients, ['Hyaluronic Acid']);
  assert.equal(lib.products[0].hint, 'backup');
});

test('normalizeProductStatus maps Notion labels', () => {
  assert.equal(normalizeProductStatus('In Use'), 'in_use');
  assert.equal(normalizeProductStatus('To Try'), 'to_try');
  assert.equal(normalizeProductStatus('bogus'), null);
});

test('groupProductsByCategory orders and skips empty', () => {
  const groups = groupProductsByCategory([
    { id: '1', name: 'A', category: 'Serum' },
    { id: '2', name: 'B', category: 'Cleanser' },
    { id: '3', name: 'C', category: 'Serum' }
  ]);
  assert.deepEqual(groups.map(g => g.category), ['Cleanser', 'Serum']);
  assert.deepEqual(groups[1].products.map(p => p.name), ['A', 'C']);
});

test('defaultCategoryForProductName maps SPF and known defaults', () => {
  assert.equal(defaultCategoryForProductName('La Roche Posay Anthelios SPF 50+'), 'Sunscreen');
  assert.equal(defaultCategoryForProductName('Korres Greek Yoghurt Probiotic Gel Cream'), 'Moisturiser');
  assert.equal(defaultCategoryForProductName('Dr Jart+ Cicapair Colour Corrector'), 'Makeup');
  assert.equal(defaultCategoryForProductName('Korres Greek Yoghurt Foaming Cream Cleanser'), 'Cleanser');
  assert.equal(defaultCategoryForProductName('Retrieve Tretinoin 0.05% (sandwich method)'), 'Treatment');
  assert.equal(defaultCategoryForProductName('Mystery Bottle'), 'Other');
});

test('seedProductLibraryFromDefaults assigns real categories not Other for SPF', () => {
  const lib = seedProductLibraryFromDefaults(SKINCARE_ROUTINES);
  const spf = lib.products.find(p => p.name.includes('Anthelios'));
  assert.ok(spf);
  assert.equal(spf.category, 'Sunscreen');
  const gel = lib.products.find(p => p.name === 'Korres Greek Yoghurt Probiotic Gel Cream');
  assert.equal(gel.category, 'Moisturiser');
});

test('upgradeOtherProductCategories rewrites Other using name inference', () => {
  const library = {
    schema_version: 1,
    products: [
      { id: 'spf', name: 'La Roche Posay Anthelios SPF 50+', category: 'Other', notes: '' },
      { id: 'keep', name: 'Custom Gadget', category: 'Other', notes: '' },
      { id: 'serum', name: 'Already Serum', category: 'Serum', notes: '' }
    ]
  };
  const { library: next, changed } = upgradeOtherProductCategories(library);
  assert.equal(changed, true);
  assert.equal(next.products.find(p => p.id === 'spf').category, 'Sunscreen');
  assert.equal(next.products.find(p => p.id === 'keep').category, 'Other');
  assert.equal(next.products.find(p => p.id === 'serum').category, 'Serum');
  assert.equal(upgradeOtherProductCategories(next).changed, false);
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
