import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchSkincareLibrarySchema,
  saveSkincareLibraryEntrySchema,
  setSkincareRoutineMembershipSchema,
  formatSkincareLibraryForPrompt,
  executeSearchSkincareLibrary,
  applySaveSkincareLibraryEntry,
  applySetSkincareRoutineMembership
} from '../../netlify/functions/_shared/skincare-library-tools.mjs';

test('schemas expose expected tool names and required fields', () => {
  assert.equal(searchSkincareLibrarySchema().name, 'search_skincare_library');
  assert.deepEqual(searchSkincareLibrarySchema().input_schema.required, ['query']);

  assert.equal(saveSkincareLibraryEntrySchema().name, 'save_skincare_library_entry');
  assert.deepEqual(saveSkincareLibraryEntrySchema().input_schema.required, ['name']);

  assert.equal(setSkincareRoutineMembershipSchema().name, 'set_skincare_routine_membership');
  assert.deepEqual(
    setSkincareRoutineMembershipSchema().input_schema.required,
    ['routine', 'product_id', 'op']
  );
});

test('formatSkincareLibraryForPrompt lists name and id, capped', () => {
  assert.equal(formatSkincareLibraryForPrompt(null), '');
  assert.equal(formatSkincareLibraryForPrompt({ products: [] }), '');
  const library = {
    schema_version: 1,
    products: [
      { id: 'cera-foaming', name: 'CeraVe Foaming', notes: '' },
      { id: 'korres-cleanser', name: 'Korres Cleanser', notes: 'AM' }
    ]
  };
  assert.equal(
    formatSkincareLibraryForPrompt(library),
    '- CeraVe Foaming (cera-foaming)\n- Korres Cleanser (korres-cleanser)'
  );
  assert.equal(formatSkincareLibraryForPrompt(library, 1), '- CeraVe Foaming (cera-foaming)');
});

test('executeSearchSkincareLibrary returns a JSON string of matches', () => {
  const library = {
    schema_version: 1,
    products: [
      { id: 'cera-foaming', name: 'CeraVe Foaming', notes: 'cleanser' },
      { id: 'spf-50', name: 'La Roche SPF', notes: '' }
    ]
  };
  const raw = executeSearchSkincareLibrary(library, { query: 'cera cleanser' });
  assert.equal(typeof raw, 'string');
  const hits = JSON.parse(raw);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'cera-foaming');
});

test('applySaveSkincareLibraryEntry creates and updates shelf rows', () => {
  const created = applySaveSkincareLibraryEntry(
    { schema_version: 1, products: [] },
    { name: 'CeraVe Moisturiser', notes: 'PM' }
  );
  assert.equal(created.ok, true);
  assert.equal(created.name, 'CeraVe Moisturiser');
  assert.ok(created.id);

  const updated = applySaveSkincareLibraryEntry(created.library, {
    id: created.id,
    name: 'CeraVe PM Moisturiser',
    notes: 'night'
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.name, 'CeraVe PM Moisturiser');
  assert.equal(updated.library.products[0].notes, 'night');
  assert.equal(applySaveSkincareLibraryEntry(created.library, { name: '' }).ok, false);
});

test('applySetSkincareRoutineMembership validates product and mutates membership', () => {
  const library = {
    schema_version: 1,
    products: [{ id: 'cera-foaming', name: 'CeraVe Foaming', notes: '' }]
  };
  const membership = {
    schema_version: 1,
    am: { product_ids: [] },
    pm: { product_ids: [] }
  };
  assert.deepEqual(
    applySetSkincareRoutineMembership(library, membership, {
      routine: 'am',
      product_id: 'missing',
      op: 'add'
    }),
    { ok: false, error: 'unknown_product' }
  );
  const added = applySetSkincareRoutineMembership(library, membership, {
    routine: 'am',
    product_id: 'cera-foaming',
    op: 'add'
  });
  assert.equal(added.ok, true);
  assert.deepEqual(added.product_ids, ['cera-foaming']);
  const removed = applySetSkincareRoutineMembership(library, added.membership, {
    routine: 'am',
    product_id: 'cera-foaming',
    op: 'remove'
  });
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.product_ids, []);
});
