import {
  MENTORSHIP_SCHEMA_VERSION,
  generateMentorshipId,
  isValidMentorshipId,
  parseMentorshipRecord,
  projectMentorship,
  projectMentorshipSummary,
  validateMentorshipCreateInput,
  validateMentorshipPatchInput
} from './mentorship-schema.mjs';
import { getJSON, listMentorshipKeys, mentorshipKey, setJSON } from './professional-blobs.mjs';

function notFound() {
  return Object.assign(new Error('Mentorship not found.'), { status: 404, code: 'mentorship_not_found' });
}

const newestFirst = (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at);

export function createMentorshipRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createMentorshipRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateMentorshipId;

  async function load(id) {
    if (!isValidMentorshipId(id)) throw notFound();
    const record = parseMentorshipRecord(await getJSON(store, mentorshipKey(id)));
    if (!record) throw notFound();
    return record;
  }

  async function allRecords() {
    const out = [];
    for (const key of await listMentorshipKeys(store)) {
      const record = parseMentorshipRecord(await getJSON(store, key));
      if (record) out.push(record);
    }
    out.sort(newestFirst);
    return out;
  }

  async function getMentorshipForPerson(personRef) {
    const mine = (await allRecords()).filter((record) => record.person_ref === personRef);
    const record = mine.find((item) => item.status === 'active') ?? mine[0] ?? null;
    return record ? projectMentorship(record) : null;
  }

  async function createMentorship(input) {
    const validated = validateMentorshipCreateInput(input);
    if (validated.status === 'active') {
      const existing = (await allRecords()).find((r) => r.person_ref === validated.person_ref && r.status === 'active');
      if (existing) {
        throw Object.assign(new Error('This person already has an active mentorship.'), { status: 409, code: 'mentorship_exists' });
      }
    }
    const timestamp = now();
    const record = {
      schema_version: MENTORSHIP_SCHEMA_VERSION,
      id: generateId(),
      ...validated,
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(store, mentorshipKey(record.id), record);
    return projectMentorship(record);
  }

  async function getMentorship(id) {
    return projectMentorship(await load(id));
  }

  async function listMentorships() {
    return (await allRecords()).map(projectMentorshipSummary);
  }

  async function patchMentorship(id, input) {
    const record = await load(id);
    const patch = validateMentorshipPatchInput(input);
    const updated = { ...record, ...patch, updated_at: now() };
    await setJSON(store, mentorshipKey(id), updated);
    return projectMentorship(updated);
  }

  return { createMentorship, getMentorship, getMentorshipForPerson, listMentorships, patchMentorship };
}
