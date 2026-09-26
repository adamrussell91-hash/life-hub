import {
  generateLedgerItemId,
  isValidLedgerItemId,
  LEDGER_SCHEMA_VERSION,
  parseLedgerItemRecord,
  projectLedgerItem,
  validateLedgerItemCreateInput,
  validateLedgerItemPatchInput
} from './ledger-schema.mjs';
import {
  getJSON,
  ledgerItemByPersonKey,
  ledgerItemBySourceKey,
  ledgerItemKey,
  listLedgerItemKeysForPerson,
  setJSON
} from './professional-blobs.mjs';

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404, code: 'ledger_item_not_found' });
}

export function createLedgerItemRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createLedgerItemRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateLedgerItemId;

  async function listForPerson(personRef, { status } = {}) {
    const keys = await listLedgerItemKeysForPerson(store, personRef);
    const records = [];
    for (const key of keys) {
      const id = key.slice(`ledger-items/by-person/${personRef}/`.length);
      if (!isValidLedgerItemId(id)) continue;
      const record = parseLedgerItemRecord(await getJSON(store, ledgerItemKey(id)));
      if (!record) continue;
      if (status && record.status !== status) continue;
      records.push(record);
    }
    records.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    return records.map(projectLedgerItem);
  }

  async function createItem(input) {
    const validated = validateLedgerItemCreateInput(input);
    const bySource = await getJSON(store, ledgerItemBySourceKey(validated.source_key));
    if (bySource?.id) {
      const existing = parseLedgerItemRecord(await getJSON(store, ledgerItemKey(bySource.id)));
      if (existing) {
        if (existing.status === 'dismissed' || existing.status === 'done') {
          return { item: projectLedgerItem(existing), created: false, skipped: existing.status };
        }
        if (existing.status === 'open') {
          return { item: projectLedgerItem(existing), created: false, skipped: 'open' };
        }
      }
    }

    const timestamp = now();
    const id = generateId();
    if (!isValidLedgerItemId(id)) {
      throw validationError('invalid_ledger_item_id', 'Generated ledger id is invalid.');
    }

    const record = {
      schema_version: LEDGER_SCHEMA_VERSION,
      id,
      person_ref: validated.person_ref,
      direction: validated.direction,
      text: validated.text,
      sources: validated.sources,
      task_ref: validated.task_ref,
      comm_ref: validated.comm_ref,
      due: validated.due ?? null,
      checked_in_ref: null,
      author: validated.author,
      status: 'open',
      source_key: validated.source_key,
      created_at: timestamp,
      updated_at: timestamp
    };

    await setJSON(store, ledgerItemKey(id), record);
    await setJSON(store, ledgerItemByPersonKey(validated.person_ref, id), { id });
    await setJSON(store, ledgerItemBySourceKey(validated.source_key), { id });

    return { item: projectLedgerItem(record), created: true };
  }

  async function patchItem(id, input) {
    if (!isValidLedgerItemId(id)) throw validationError('invalid_ledger_item_id', 'Invalid ledger id.');
    const record = parseLedgerItemRecord(await getJSON(store, ledgerItemKey(id)));
    if (!record) throw notFound('Ledger item not found.');
    const patch = validateLedgerItemPatchInput(input);
    const updated = {
      ...record,
      ...patch,
      updated_at: now()
    };
    await setJSON(store, ledgerItemKey(id), updated);
    return projectLedgerItem(updated);
  }

  return {
    listForPerson,
    createItem,
    patchItem
  };
}
