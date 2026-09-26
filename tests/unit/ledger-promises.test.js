import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEDGER_SCHEMA_VERSION,
  isValidDueDate,
  parseDueRangeQuery,
  parseLedgerItemRecord,
  projectLedgerItem,
  validateLedgerItemCreateInput,
  validateLedgerItemPatchInput
} from '../../netlify/functions/_shared/ledger-schema.mjs';
import { createLedgerItemRepository } from '../../netlify/functions/_shared/ledger-repository.mjs';

const PERSON = 'shared:person:person_denielle';
const COMM = 'professional:communication:communication_00000000-0000-4000-8000-000000000001';

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

const v1Record = {
  schema_version: 1,
  id: 'ledger_00000000-0000-4000-8000-000000000001',
  person_ref: PERSON,
  direction: 'you_owe',
  text: 'Email the summary',
  sources: [],
  task_ref: null,
  comm_ref: null,
  author: 'adam',
  status: 'open',
  source_key: 'abc',
  created_at: '2026-09-20T00:00:00.000Z',
  updated_at: '2026-09-20T00:00:00.000Z'
};

test('schema version is 2 and v1 records still parse with due and checked_in_ref as null', () => {
  assert.equal(LEDGER_SCHEMA_VERSION, 2);
  const parsed = parseLedgerItemRecord(v1Record);
  assert.equal(parsed.due, null);
  assert.equal(parsed.checked_in_ref, null);
  assert.equal(projectLedgerItem(parsed).due, null);
});

test('v2 records keep due and checked_in_ref; bad due is rejected', () => {
  const v2 = { ...v1Record, schema_version: 2, due: '2026-09-22', checked_in_ref: COMM };
  assert.equal(parseLedgerItemRecord(v2).due, '2026-09-22');
  assert.equal(parseLedgerItemRecord({ ...v2, due: '22/09/2026' }), null);
  assert.equal(parseLedgerItemRecord({ ...v2, due: '2026-02-30' }), null);
});

test('isValidDueDate accepts real calendar dates only', () => {
  assert.equal(isValidDueDate('2026-10-13'), true);
  assert.equal(isValidDueDate('2026-02-29'), false);
  assert.equal(isValidDueDate(''), false);
  assert.equal(isValidDueDate(null), false);
});

test('create and patch accept due; patch accepts checked_in_ref', () => {
  const created = validateLedgerItemCreateInput({
    person_ref: PERSON, direction: 'you_owe', text: 'Email the summary', author: 'adam', comm_ref: COMM, due: '2026-09-22'
  });
  assert.equal(created.due, '2026-09-22');
  assert.throws(
    () => validateLedgerItemCreateInput({ person_ref: PERSON, direction: 'you_owe', text: 'x', due: 'soon' }),
    { code: 'invalid_due' }
  );
  const patch = validateLedgerItemPatchInput({ due: null, checked_in_ref: COMM, status: 'done' });
  assert.deepEqual(patch, { due: null, checked_in_ref: COMM, status: 'done' });
});

test('parseDueRangeQuery reads due_from/due_to and rejects bad ranges', () => {
  assert.deepEqual(parseDueRangeQuery(new URLSearchParams('due_from=2026-09-21&due_to=2026-09-27')), {
    from: '2026-09-21', to: '2026-09-27'
  });
  assert.deepEqual(parseDueRangeQuery(new URLSearchParams('due_from=2026-09-21')), {
    from: '2026-09-21', to: '2026-09-21'
  });
  assert.throws(() => parseDueRangeQuery(new URLSearchParams('due_from=2026-09-27&due_to=2026-09-21')), {
    code: 'invalid_due_range'
  });
});

test('repository writes v2 records with due', async () => {
  const store = memoryStore();
  let n = 0;
  const repo = createLedgerItemRepository({
    store,
    now: () => '2026-09-26T00:00:00.000Z',
    generateId: () => `ledger_00000000-0000-4000-8000-00000000000${++n}`
  });
  const { item } = await repo.createItem({
    person_ref: PERSON, direction: 'you_owe', text: 'Email the summary', author: 'adam', comm_ref: COMM, due: '2026-09-22'
  });
  assert.equal(item.due, '2026-09-22');
  const stored = store._map.get(`ledger-items/records/${item.id}`);
  assert.equal(stored.schema_version, 2);
  assert.equal(stored.checked_in_ref, null);
});
