import {
  OBSERVATION_SCHEMA_VERSION,
  compareObservationsNewestFirst,
  generateObservationId,
  isValidObservationId,
  observationIndexRecord,
  parseObservationRecord,
  projectObservation,
  validateAboutRef,
  validateObservationCreateInput
} from './observation-schema.mjs';
import {
  getJSON,
  listObservationIndexKeysForAboutRef,
  observationByAboutRefKey,
  observationKey,
  setJSON
} from './professional-blobs.mjs';

// Repository for Professional Hub Observations (`professional-hub-content`).
// Deliberately much simpler than communication-repository.mjs: an
// Observation is a plain, directly-written record with no Universal Links,
// so there is no journal, link-intent, or retry machinery here — only
// create and list, append-only (no update/delete in Phase 1).

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

export function createObservationRepository(deps = {}) {
  const store = deps.store;
  if (!store) {
    throw new Error('createObservationRepository requires a professional store.');
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateObservationId;

  async function listObservationsForAboutRef(aboutRefInput) {
    const aboutRef = validateAboutRef(aboutRefInput);
    const pointerKeys = await listObservationIndexKeysForAboutRef(store, aboutRef);
    const ids = [
      ...new Set(
        pointerKeys
          .map((key) => key.slice(`observations/by-about-ref/${aboutRef}/`.length))
          .filter((id) => isValidObservationId(id))
      )
    ];
    const records = [];
    for (const id of ids) {
      const record = parseObservationRecord(await getJSON(store, observationKey(id)));
      if (record) records.push(record);
    }
    records.sort(compareObservationsNewestFirst);
    return records.map((record) => projectObservation(record));
  }

  async function createObservation(input) {
    const validated = validateObservationCreateInput(input);
    const timestamp = now();
    const id = generateId();
    if (!isValidObservationId(id)) {
      throw validationError('invalid_observation_id', 'Generated Observation id is invalid.');
    }

    const record = {
      schema_version: OBSERVATION_SCHEMA_VERSION,
      id,
      about_ref: validated.about_ref,
      text: validated.text,
      occurred_at: validated.occurred_at,
      source: validated.source,
      linked_ref: validated.linked_ref,
      created_at: timestamp,
      updated_at: timestamp
    };

    await setJSON(store, observationKey(id), record);
    // The by-about-ref key stores only a pointer, not a copy of the index
    // projection: listObservationsForAboutRef must load the full record
    // anyway (projectObservation includes text, which the minimal index
    // fields don't carry), so duplicating the index fields here would be
    // redundant data with no read savings — a pointer keeps the write small
    // and there is only one place (`observationKey`) that ever needs
    // updating.
    await setJSON(store, observationByAboutRefKey(validated.about_ref, id), { id });

    return { observation: projectObservation(record), created: true };
  }

  return {
    listObservationsForAboutRef,
    createObservation
  };
}

export { observationIndexRecord };
