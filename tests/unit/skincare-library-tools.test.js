import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchSkincareLibrarySchema,
  saveSkincareLibraryEntrySchema,
  setSkincareRoutineMembershipSchema,
  listSkincareRoutinesSchema,
  formatSkincareLibraryForPrompt,
  formatSkincareRoutinesForPrompt,
  executeSearchSkincareLibrary,
  executeListSkincareRoutines,
  applySaveSkincareLibraryEntry,
  applySetSkincareRoutineMembership
} from '../../netlify/functions/_shared/skincare-library-tools.mjs';

test('schemas expose expected tool names and required fields', () => {
  assert.equal(searchSkincareLibrarySchema().name, 'search_skincare_library');
  assert.deepEqual(searchSkincareLibrarySchema().input_schema.required, ['query']);

  assert.equal(saveSkincareLibraryEntrySchema().name, 'save_skincare_library_entry');
  assert.deepEqual(saveSkincareLibraryEntrySchema().input_schema.required, ['name']);
  assert.ok(saveSkincareLibraryEntrySchema().input_schema.properties.category);
  assert.ok(saveSkincareLibraryEntrySchema().input_schema.properties.status);

  assert.equal(setSkincareRoutineMembershipSchema().name, 'set_skincare_routine_membership');
  assert.deepEqual(
    setSkincareRoutineMembershipSchema().input_schema.required,
    ['routine', 'product_id', 'op']
  );

  assert.equal(listSkincareRoutinesSchema().name, 'list_skincare_routines');
  assert.equal(listSkincareRoutinesSchema().input_schema.properties.routine.enum.join(','), 'am,pm');
});

test('formatSkincareRoutinesForPrompt lists resolved AM/PM products', () => {
  assert.equal(formatSkincareRoutinesForPrompt(null, null), '');
  const library = {
    schema_version: 1,
    products: [
      { id: 'spf-50', name: 'La Roche SPF', category: 'Sunscreen', notes: '' },
      { id: 'cera-foam', name: 'CeraVe Foaming', category: 'Cleanser', notes: '' },
      { id: 'shelf-only', name: 'Shelf Only Serum', category: 'Serum', notes: '' }
    ]
  };
  const membership = {
    schema_version: 1,
    am: { product_ids: ['spf-50'] },
    pm: { product_ids: ['cera-foam'] }
  };
  const text = formatSkincareRoutinesForPrompt(membership, library);
  assert.match(text, /Current AM\/PM rotation/);
  assert.match(text, /AM:\n- La Roche SPF \(spf-50\) \[Sunscreen\]/);
  assert.match(text, /PM:\n- CeraVe Foaming \(cera-foam\) \[Cleanser\]/);
  assert.doesNotMatch(text, /Shelf Only Serum/);
});

test('executeListSkincareRoutines returns resolved membership products', () => {
  const library = {
    schema_version: 1,
    products: [
      { id: 'spf-50', name: 'La Roche SPF', category: 'Sunscreen', notes: '' },
      { id: 'cera-foam', name: 'CeraVe Foaming', category: 'Cleanser', notes: '' }
    ]
  };
  const membership = {
    schema_version: 1,
    am: { product_ids: ['spf-50'] },
    pm: { product_ids: ['cera-foam'] }
  };
  const both = JSON.parse(executeListSkincareRoutines(membership, library, {}));
  assert.deepEqual(both.am, [{ id: 'spf-50', name: 'La Roche SPF', category: 'Sunscreen' }]);
  assert.deepEqual(both.pm, [{ id: 'cera-foam', name: 'CeraVe Foaming', category: 'Cleanser' }]);

  const amOnly = JSON.parse(executeListSkincareRoutines(membership, library, { routine: 'am' }));
  assert.deepEqual(amOnly.am, [{ id: 'spf-50', name: 'La Roche SPF', category: 'Sunscreen' }]);
  assert.equal(amOnly.pm, undefined);
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
    { name: 'CeraVe Moisturiser', category: 'Moisturiser', notes: 'PM' }
  );
  assert.equal(created.ok, true);
  assert.equal(created.name, 'CeraVe Moisturiser');
  assert.ok(created.id);
  assert.equal(created.library.products[0].category, 'Moisturiser');

  const updated = applySaveSkincareLibraryEntry(created.library, {
    id: created.id,
    name: 'CeraVe PM Moisturiser',
    notes: 'night'
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.name, 'CeraVe PM Moisturiser');
  assert.equal(updated.library.products[0].notes, 'night');
  assert.equal(updated.library.products[0].category, 'Moisturiser');
  assert.equal(applySaveSkincareLibraryEntry(created.library, { name: '' }).ok, false);
  assert.equal(
    applySaveSkincareLibraryEntry({ schema_version: 1, products: [] }, { name: 'No Category' }).ok,
    false
  );
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
