import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { classKey } from './_shared/teaching-blobs.mjs';
import { assignInitials } from './_shared/student-initials.mjs';

export const config = { path: '/api/classes/:id' };

export const MAX_CLASS_STUDENTS = 60;

/**
 * Tidy a class list before it is stored: names trimmed and capped, blanks and
 * repeats dropped, and every student given a lasting id and unique initials.
 * The list is teacher-only; published class pages never copy it.
 */
export function cleanClassStudents(value) {
  if (!Array.isArray(value)) throw new Error('students must be a list');
  const seen = new Set();
  const out = [];
  for (const row of value) {
    const name = typeof row?.name === 'string' ? row.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      skip_picker: row.skip_picker === true,
      ...(typeof row.id === 'string' ? { id: row.id } : {}),
      ...(typeof row.initials === 'string' ? { initials: row.initials } : {})
    });
    if (out.length >= MAX_CLASS_STUDENTS) break;
  }
  return assignInitials(out);
}

function prepareClassPatch(_record, patch) {
  if (patch.students === undefined) return patch;
  return { ...patch, students: cleanClassStudents(patch.students) };
}

export function createClassHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: classKey,
    notFound: 'Class not found',
    versionKind: 'class_homepage',
    preparePatch: prepareClassPatch
  }, deps);
}

export default createClassHandler();
