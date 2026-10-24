/**
 * Where a Design Sprint keeps its state. One class per sprint.
 *
 *   sprint/{lesson}/config                    { version, class_id, groups, decider, lock_hours, phases, criteria, reflection_criteria, requirements, ideas }
 *   sprint/{lesson}/lock                      { ended: { [phase]: { at, present[] } }, lock: { phase, until, unlocked[] } | null }
 *   sprint/{lesson}/extend                    { group: { [g]: { [phase]: { due_date, due_time } } }, student: { [s]: { … } } }
 *   sprint/{lesson}/seen/{student}            { [phase]: iso }   first time the student opened the phase
 *   sprint/{lesson}/subs/{student}/{phase}    { payload, saved_at, submitted_at, late, frozen }
 *   sprint/{lesson}/groups/{group}            { in: { [phase]: student[] }, question, chosen, awaiting, votes_closed_at, parts, claims, pitch }
 *   sprint/{lesson}/fileowner/{id}            { owner, student }
 *   sprint/{lesson}/files/{student}/{id}      bytes, metadata { contentType }
 *   sprint/{lesson}/filemeta/{student}/{id}   { name, mime, size, at, phase }
 *   sprint/{lesson}/rounds/{group}            { status, opened_at, closed_at, entries: { [student]: { levels, worked, next, about, flagged, status } } }
 *   sprint/{lesson}/stage                     { running: group|null, spotlight: { text, label } | null }
 */
export const sprintKeys = (lesson) => ({
  config: `sprint/${lesson}/config`,
  lock: `sprint/${lesson}/lock`,
  extend: `sprint/${lesson}/extend`,
  seen: (student) => `sprint/${lesson}/seen/${student}`,
  sub: (student, phase) => `sprint/${lesson}/subs/${student}/${phase}`,
  group: (group) => `sprint/${lesson}/groups/${group}`,
  file: (student, id) => `sprint/${lesson}/files/${student}/${id}`,
  fileMeta: (student, id) => `sprint/${lesson}/filemeta/${student}/${id}`,
  fileMetaPrefix: (student) => `sprint/${lesson}/filemeta/${student}/`,
  fileOwner: (id) => `sprint/${lesson}/fileowner/${id}`,
  round: (group) => `sprint/${lesson}/rounds/${group}`,
  stage: `sprint/${lesson}/stage`
});

export const emptyGroup = () => ({ in: {}, question: null, chosen: null, awaiting: null, votes_closed_at: null, parts: [], claims: {}, pitch: null });
export const emptyLock = () => ({ ended: {}, lock: null });
