import {
  generateRememberFactId,
  isValidRememberFactId,
  parseRememberFactRecord,
  projectRememberFact,
  REMEMBER_SCHEMA_VERSION,
  validateRememberFactCreateInput,
  validateRememberFactPatchInput
} from './remember-schema.mjs';
import {
  getJSON,
  listRememberFactKeysForPerson,
  rememberFactByPersonKey,
  rememberFactKey,
  setJSON
} from './professional-blobs.mjs';

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404, code: 'remember_fact_not_found' });
}

function normalizeText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function createRememberFactRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createRememberFactRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateRememberFactId;

  async function listForPerson(personRef, { status = 'active' } = {}) {
    const keys = await listRememberFactKeysForPerson(store, personRef);
    const records = [];
    for (const key of keys) {
      const id = key.slice(`remember-facts/by-person/${personRef}/`.length);
      if (!isValidRememberFactId(id)) continue;
      const record = parseRememberFactRecord(await getJSON(store, rememberFactKey(id)));
      if (!record) continue;
      if (status != null && record.status !== status) continue;
      records.push(record);
    }
    records.sort((a, b) => a.sort_order - b.sort_order || Date.parse(a.created_at) - Date.parse(b.created_at));
    return records.map(projectRememberFact);
  }

  async function createFact(input) {
    const validated = validateRememberFactCreateInput(input);
    const existing = await listForPerson(validated.person_ref, { status: null });
    const dup = existing.find(
      (f) =>
        f.status === 'active' &&
        (normalizeText(f.text) === normalizeText(validated.text) ||
          (f.author === 'adam' &&
            validated.author === 'ann' &&
            normalizeText(f.text) === normalizeText(validated.text)))
    );
    if (dup) {
      // Ann never overwrites Adam; identical active fact is skipped.
      return { fact: dup, created: false, skipped: dup.author === 'adam' ? 'adam_owns' : 'duplicate' };
    }
    // Also skip if Adam has an active fact Ann would replace by near-match on same source.
    const adamBlock = existing.find(
      (f) => f.author === 'adam' && f.status === 'active' && normalizeText(f.text) === normalizeText(validated.text)
    );
    if (adamBlock && validated.author === 'ann') {
      return { fact: adamBlock, created: false, skipped: 'adam_owns' };
    }

    const timestamp = now();
    const id = generateId();
    if (!isValidRememberFactId(id)) {
      throw validationError('invalid_remember_fact_id', 'Generated remember id is invalid.');
    }
    const sort_order =
      validated.sort_order ||
      existing.filter((f) => f.status === 'active').reduce((max, f) => Math.max(max, f.sort_order ?? 0), 0) + 1;

    const record = {
      schema_version: REMEMBER_SCHEMA_VERSION,
      id,
      person_ref: validated.person_ref,
      text: validated.text,
      sources: validated.sources,
      author: validated.author,
      status: 'active',
      sort_order,
      created_at: timestamp,
      updated_at: timestamp
    };

    await setJSON(store, rememberFactKey(id), record);
    await setJSON(store, rememberFactByPersonKey(validated.person_ref, id), { id });
    return { fact: projectRememberFact(record), created: true };
  }

  async function patchFact(id, input, { actor = 'adam' } = {}) {
    if (!isValidRememberFactId(id)) throw validationError('invalid_remember_fact_id', 'Invalid remember id.');
    const record = parseRememberFactRecord(await getJSON(store, rememberFactKey(id)));
    if (!record) throw notFound('Remember fact not found.');
    if (actor === 'ann' && record.author === 'adam' && (input.text !== undefined || input.status === 'dismissed')) {
      throw validationError('adam_fact_protected', 'Ann never overwrites an Adam-authored fact.');
    }
    const patch = validateRememberFactPatchInput(input);
    const updated = { ...record, ...patch, updated_at: now() };
    await setJSON(store, rememberFactKey(id), updated);
    return projectRememberFact(updated);
  }

  async function reorder(personRef, orderedIds) {
    if (!Array.isArray(orderedIds)) {
      throw validationError('invalid_order', 'ordered_ids must be an array.');
    }
    const facts = await listForPerson(personRef, { status: 'active' });
    const byId = new Map(facts.map((f) => [f.id, f]));
    let order = 0;
    const out = [];
    for (const id of orderedIds) {
      if (!byId.has(id)) continue;
      const patched = await patchFact(id, { sort_order: order++ }, { actor: 'adam' });
      out.push(patched);
    }
    return out;
  }

  return {
    listForPerson,
    createFact,
    patchFact,
    reorder
  };
}
