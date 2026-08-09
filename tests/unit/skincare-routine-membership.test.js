import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINCARE_ROUTINE_MEMBERSHIP_PATH,
  emptyMembership,
  parseMembership,
  resolveRoutineProducts,
  addToRoutine,
  removeFromRoutine,
  seedMembershipFromDefaults,
  migrateMembershipFromCatalog
} from '../../js/app/skincare-routine-membership.js';
import {
  emptyProductLibrary,
  saveProductLibraryEntry,
  seedProductLibraryFromDefaults,
  findProductByName
} from '../../js/app/skincare-product-library.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

test('path is data/skincare/routine-membership.json', () => {
  assert.equal(SKINCARE_ROUTINE_MEMBERSHIP_PATH, 'data/skincare/routine-membership.json');
});

test('parseMembership rejects bad shapes', () => {
  assert.equal(parseMembership(null), null);
  assert.equal(parseMembership({ schema_version: 1 }), null);
});

test('resolveRoutineProducts maps ids through library in order', () => {
  let lib = emptyProductLibrary();
  lib = saveProductLibraryEntry(lib, { name: 'A' });
  lib = saveProductLibraryEntry(lib, { name: 'B' });
  const a = findProductByName(lib, 'A');
  const b = findProductByName(lib, 'B');
  const membership = {
    schema_version: 1,
    am: { product_ids: [b.id, a.id, 'missing'] },
    pm: { product_ids: [] }
  };
  assert.deepEqual(
    resolveRoutineProducts('am', membership, lib).map(p => p.name),
    ['B', 'A']
  );
});

test('addToRoutine appends id once', () => {
  const lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'A' });
  const id = lib.products[0].id;
  let m = emptyMembership();
  m = addToRoutine(m, 'am', id);
  m = addToRoutine(m, 'am', id);
  assert.deepEqual(m.am.product_ids, [id]);
});

test('removeFromRoutine drops id only from that routine', () => {
  const lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'A' });
  const id = lib.products[0].id;
  let m = emptyMembership();
  m = addToRoutine(m, 'am', id);
  m = addToRoutine(m, 'pm', id);
  m = removeFromRoutine(m, 'am', id);
  assert.deepEqual(m.am.product_ids, []);
  assert.deepEqual(m.pm.product_ids, [id]);
});

test('seedMembershipFromDefaults uses library ids for default names', () => {
  const lib = seedProductLibraryFromDefaults(SKINCARE_ROUTINES);
  const m = seedMembershipFromDefaults(SKINCARE_ROUTINES, lib);
  assert.equal(m.am.product_ids.length, SKINCARE_ROUTINES.am.products.length);
  assert.equal(m.pm.product_ids.length, SKINCARE_ROUTINES.pm.products.length);
});

test('migrateMembershipFromCatalog uses products not retired', () => {
  const catalog = {
    schema_version: 1,
    am: { products: ['Keep'], retired: ['Gone'], extras: [] },
    pm: { products: [], retired: [], extras: [] }
  };
  let lib = emptyProductLibrary();
  lib = saveProductLibraryEntry(lib, { name: 'Keep' });
  lib = saveProductLibraryEntry(lib, { name: 'Gone' });
  const m = migrateMembershipFromCatalog(catalog, lib);
  assert.deepEqual(
    m.am.product_ids,
    [findProductByName(lib, 'Keep').id]
  );
});
