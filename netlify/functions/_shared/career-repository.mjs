import {
  CAREER_SCHEMA_VERSION,
  compareAchievementsNewestFirst,
  generateAchievementId,
  generateCareerOperationId,
  generateFutureId,
  generateSteppingStoneId,
  isValidAchievementId,
  isValidFutureId,
  isValidSteppingStoneId,
  parseAchievementRecord,
  parseFutureRecord,
  parseSteppingStoneRecord,
  validateAchievementCreateInput,
  validateFutureCreateInput,
  validateSteppingStoneCreateInput
} from './career-schema.mjs';
import {
  careerAchievementIndexKey,
  careerAchievementKey,
  careerFutureIndexKey,
  careerFutureKey,
  careerOperationKey,
  careerStoneIndexKey,
  careerStoneKey,
  getJSON,
  listCareerAchievementIndexKeys,
  listCareerFutureIndexKeys,
  listCareerStoneIndexKeys,
  setJSON
} from './professional-blobs.mjs';

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound(kind) {
  return Object.assign(new Error(`${kind} not found.`), {
    status: 404,
    code: `${kind.toLowerCase().replace(/\s+/g, '_')}_not_found`
  });
}

/**
 * Career records repository — CRUD for achievements, futures, and stones.
 * Link writes for evidenced_by / supports_future / stone_for stay on the
 * Netlify handlers that already own Universal Link journals (Phase 5 keep).
 */
export function createCareerRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createCareerRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());

  async function listAchievements() {
    const keys = await listCareerAchievementIndexKeys(store);
    const records = [];
    for (const key of keys) {
      const id = key.slice('career/achievements/index/'.length);
      if (!isValidAchievementId(id)) continue;
      const record = parseAchievementRecord(await getJSON(store, careerAchievementKey(id)));
      if (record) records.push(record);
    }
    records.sort(compareAchievementsNewestFirst);
    return records;
  }

  async function getAchievement(id) {
    if (!isValidAchievementId(id)) throw notFound('Achievement');
    const record = parseAchievementRecord(await getJSON(store, careerAchievementKey(id)));
    if (!record) throw notFound('Achievement');
    return record;
  }

  async function createAchievement(input) {
    const validated = validateAchievementCreateInput(input);
    const timestamp = now();
    const id = deps.generateAchievementId?.() ?? generateAchievementId();
    const operationId = deps.generateOperationId?.() ?? generateCareerOperationId();
    const record = {
      schema_version: CAREER_SCHEMA_VERSION,
      id,
      ...validated,
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(store, careerOperationKey(operationId), {
      operation_id: operationId,
      operation_type: 'create_achievement',
      status: 'committed',
      record_id: id,
      committed_at: timestamp
    });
    await setJSON(store, careerAchievementKey(id), record);
    await setJSON(store, careerAchievementIndexKey(id), { id, updated_at: timestamp });
    return record;
  }

  async function updateAchievement(id, patch) {
    const existing = await getAchievement(id);
    const merged = {
      ...existing,
      title: typeof patch.title === 'string' ? patch.title : existing.title,
      occurred_on: typeof patch.occurred_on === 'string' ? patch.occurred_on : existing.occurred_on,
      date_precision:
        typeof patch.date_precision === 'string' ? patch.date_precision : existing.date_precision,
      star: patch.star !== undefined ? patch.star : existing.star,
      skills: patch.skills !== undefined ? patch.skills : existing.skills,
      apst: patch.apst !== undefined ? patch.apst : existing.apst,
      lifecycle_status:
        typeof patch.lifecycle_status === 'string' ? patch.lifecycle_status : existing.lifecycle_status,
      updated_at: now()
    };
    const parsed = parseAchievementRecord(merged);
    if (!parsed) throw validationError('invalid_achievement', 'Updated achievement is invalid.');
    await setJSON(store, careerAchievementKey(id), parsed);
    await setJSON(store, careerAchievementIndexKey(id), { id, updated_at: parsed.updated_at });
    return parsed;
  }

  async function listFutures() {
    const keys = await listCareerFutureIndexKeys(store);
    const records = [];
    for (const key of keys) {
      const id = key.slice('career/futures/index/'.length);
      if (!isValidFutureId(id)) continue;
      const record = parseFutureRecord(await getJSON(store, careerFutureKey(id)));
      if (record) records.push(record);
    }
    records.sort((a, b) => a.lane_order - b.lane_order || a.title.localeCompare(b.title));
    return records;
  }

  async function getFuture(id) {
    if (!isValidFutureId(id)) throw notFound('Future');
    const record = parseFutureRecord(await getJSON(store, careerFutureKey(id)));
    if (!record) throw notFound('Future');
    return record;
  }

  async function createFuture(input) {
    const validated = validateFutureCreateInput(input);
    const timestamp = now();
    const id = deps.generateFutureId?.() ?? generateFutureId();
    const record = {
      schema_version: CAREER_SCHEMA_VERSION,
      id,
      ...validated,
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(store, careerFutureKey(id), record);
    await setJSON(store, careerFutureIndexKey(id), { id, updated_at: timestamp });
    return record;
  }

  async function updateFuture(id, patch) {
    const existing = await getFuture(id);
    const merged = { ...existing, ...patch, id: existing.id, schema_version: CAREER_SCHEMA_VERSION, updated_at: now() };
    const parsed = parseFutureRecord(merged);
    if (!parsed) throw validationError('invalid_future', 'Updated future is invalid.');
    await setJSON(store, careerFutureKey(id), parsed);
    await setJSON(store, careerFutureIndexKey(id), { id, updated_at: parsed.updated_at });
    return parsed;
  }

  async function listSteppingStones() {
    const keys = await listCareerStoneIndexKeys(store);
    const records = [];
    for (const key of keys) {
      const id = key.slice('career/stones/index/'.length);
      if (!isValidSteppingStoneId(id)) continue;
      const record = parseSteppingStoneRecord(await getJSON(store, careerStoneKey(id)));
      if (record) records.push(record);
    }
    records.sort((a, b) => {
      const aDate = a.target_term_start || '9999-12-31';
      const bDate = b.target_term_start || '9999-12-31';
      return aDate.localeCompare(bDate) || a.label.localeCompare(b.label);
    });
    return records;
  }

  async function getSteppingStone(id) {
    if (!isValidSteppingStoneId(id)) throw notFound('Stepping stone');
    const record = parseSteppingStoneRecord(await getJSON(store, careerStoneKey(id)));
    if (!record) throw notFound('Stepping stone');
    return record;
  }

  async function createSteppingStone(input) {
    const validated = validateSteppingStoneCreateInput(input);
    const timestamp = now();
    const id = deps.generateSteppingStoneId?.() ?? generateSteppingStoneId();
    const record = {
      schema_version: CAREER_SCHEMA_VERSION,
      id,
      ...validated,
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(store, careerStoneKey(id), record);
    await setJSON(store, careerStoneIndexKey(id), { id, updated_at: timestamp });
    return record;
  }

  async function updateSteppingStone(id, patch) {
    const existing = await getSteppingStone(id);
    const merged = { ...existing, ...patch, id: existing.id, schema_version: CAREER_SCHEMA_VERSION, updated_at: now() };
    const parsed = parseSteppingStoneRecord(merged);
    if (!parsed) throw validationError('invalid_stepping_stone', 'Updated stepping stone is invalid.');
    await setJSON(store, careerStoneKey(id), parsed);
    await setJSON(store, careerStoneIndexKey(id), { id, updated_at: parsed.updated_at });
    return parsed;
  }

  return {
    listAchievements,
    getAchievement,
    createAchievement,
    updateAchievement,
    listFutures,
    getFuture,
    createFuture,
    updateFuture,
    listSteppingStones,
    getSteppingStone,
    createSteppingStone,
    updateSteppingStone
  };
}
