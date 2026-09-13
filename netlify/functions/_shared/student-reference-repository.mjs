import { createHash, randomUUID } from 'node:crypto';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { deleteKey, getJSON, setJSON } from './teaching-blobs.mjs';
import {
  isStudentReferenceId,
  normalizeInitials,
  parseStudentContextInput,
  parseStudentReference,
  studentReferenceError
} from './student-reference-schema.mjs';

export const STUDENT_REFERENCE_PREFIX = 'protected/student-references/';
export const STUDENT_CONTEXT_PREFIX = 'protected/student-contexts/';
export const STUDENT_TOMBSTONE_PREFIX = 'protected/student-reference-tombstones/';

export function studentReferenceKey(id) {
  if (!isStudentReferenceId(id)) throw studentReferenceError();
  return `${STUDENT_REFERENCE_PREFIX}${id}`;
}

export function studentContextPrefix(contextType, contextId) {
  const context = parseStudentContextInput({ context_type: contextType, context_id: contextId });
  const hash = createHash('sha256').update(context.context_id).digest('hex');
  return `${STUDENT_CONTEXT_PREFIX}${context.context_type}/${hash}/`;
}

export function studentContextKey(contextType, contextId, studentId) {
  if (!isStudentReferenceId(studentId)) throw studentReferenceError();
  return `${studentContextPrefix(contextType, contextId)}${studentId}`;
}

async function listReferences(store) {
  const keys = await listBlobKeys(store, STUDENT_REFERENCE_PREFIX);
  const values = await mapBounded(keys, 10, key => getJSON(store, key));
  return values.map(parseStudentReference).filter(Boolean);
}

function nextDisplayCode(initials, records) {
  const used = new Set(records.map(record => record.display_code));
  if (!used.has(initials)) return initials;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${initials}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw studentReferenceError('display_code_exhausted', 409);
}

function publicProjection(record) {
  return {
    ref: `teaching:student_reference:${record.id}`,
    display_code: record.display_code,
    lifecycle_status: record.lifecycle_status
  };
}

export function createStudentReferenceRepository({
  store,
  now = () => new Date().toISOString(),
  generateId = () => `student_ref_${randomUUID()}`
}) {
  if (!store) throw studentReferenceError('student_reference_store_unbound', 503);

  async function getRequired(id) {
    if (!isStudentReferenceId(id)) throw studentReferenceError();
    const record = parseStudentReference(await getJSON(store, studentReferenceKey(id)));
    if (!record || record.lifecycle_status === 'deleted') {
      throw studentReferenceError('student_reference_not_found', 404);
    }
    return record;
  }

  return {
    async create(initialsInput) {
      const initials = normalizeInitials(initialsInput);
      const records = await listReferences(store);
      const timestamp = now();
      const record = {
        schema_version: 1,
        id: generateId(),
        kind: 'student_reference',
        display_code: nextDisplayCode(initials, records),
        lifecycle_status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      };
      if (!parseStudentReference(record)) throw studentReferenceError();
      await setJSON(store, studentReferenceKey(record.id), record);
      return publicProjection(record);
    },

    async assign(studentId, input) {
      const student = await getRequired(studentId);
      if (student.lifecycle_status !== 'active') {
        throw studentReferenceError('student_reference_not_active', 409);
      }
      const context = parseStudentContextInput(input);
      const timestamp = now();
      const record = {
        schema_version: 1,
        student_ref_id: student.id,
        ...context,
        lifecycle_status: 'active',
        created_at: timestamp,
        updated_at: timestamp
      };
      await setJSON(store, studentContextKey(context.context_type, context.context_id, student.id), record);
      return { student: publicProjection(student), context };
    },

    async setPermission(studentId, input) {
      await getRequired(studentId);
      const context = parseStudentContextInput(input);
      if (context.permission_status === null) throw studentReferenceError('invalid_permission_status');
      const key = studentContextKey(context.context_type, context.context_id, studentId);
      const existing = await getJSON(store, key);
      if (!existing || existing.lifecycle_status !== 'active') {
        throw studentReferenceError('student_context_not_found', 404);
      }
      const updated = {
        ...existing,
        permission_status: context.permission_status,
        updated_at: now()
      };
      await setJSON(store, key, updated);
      return { permission_status: updated.permission_status };
    },

    async search(input) {
      const context = parseStudentContextInput(input);
      const query = typeof input.query === 'string' ? input.query.trim().toUpperCase() : '';
      if (query.length > 20) throw studentReferenceError('invalid_query');
      const keys = await listBlobKeys(store, studentContextPrefix(context.context_type, context.context_id));
      const memberships = await mapBounded(keys, 10, key => getJSON(store, key));
      const activeIds = memberships
        .filter(row => row?.lifecycle_status === 'active' && isStudentReferenceId(row.student_ref_id))
        .map(row => row.student_ref_id);
      const records = await mapBounded(activeIds, 10, id => getJSON(store, studentReferenceKey(id)));
      return records
        .map(parseStudentReference)
        .filter(record => record?.lifecycle_status === 'active')
        .filter(record => !query || record.display_code.startsWith(query))
        .sort((a, b) => a.display_code.localeCompare(b.display_code))
        .slice(0, 20)
        .map(publicProjection);
    },

    async archive(studentId) {
      const record = await getRequired(studentId);
      const updated = { ...record, lifecycle_status: 'archived', updated_at: now() };
      await setJSON(store, studentReferenceKey(studentId), updated);
      return publicProjection(updated);
    },

    async delete(studentId) {
      await getRequired(studentId);
      const keys = await listBlobKeys(store, STUDENT_CONTEXT_PREFIX);
      const matching = await mapBounded(keys, 10, async key => {
        const row = await getJSON(store, key);
        return row?.student_ref_id === studentId ? key : null;
      });
      for (const key of matching.filter(Boolean)) await deleteKey(store, key);
      await deleteKey(store, studentReferenceKey(studentId));
      await setJSON(store, `${STUDENT_TOMBSTONE_PREFIX}${studentId}`, {
        schema_version: 1,
        id: studentId,
        kind: 'student_reference_tombstone',
        deleted_at: now()
      });
      return { deleted: true };
    }
  };
}
