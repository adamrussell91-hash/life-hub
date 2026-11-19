/**
 * Where a lab keeps things, under lab/{lesson}:
 *
 *   config                        the published settings, whole (teacher-only lines included)
 *   active, {session}/round       the live round and its copy (activity-rounds.mjs)
 *   {session}/students/{owner}    one student's record
 *   {session}/pairs/{pairId}      one pair's record (Pairs design it)
 *   {session}/deal                the reading lists, written once when the teacher moves to Test
 *   {session}/late/{owner}        the list of a reader who joined after the deal
 *   {session}/held/{owner}        the teacher's release or remove of flagged writing
 */
export function labKeys(lesson) {
  const base = `lab/${lesson}`;
  return {
    base,
    config: `${base}/config`,
    active: `${base}/active`,
    students: (session) => `${base}/${session}/students/`,
    student: (session, owner) => `${base}/${session}/students/${owner}`,
    pairs: (session) => `${base}/${session}/pairs/`,
    pair: (session, pairId) => `${base}/${session}/pairs/${pairId}`,
    deal: (session) => `${base}/${session}/deal`,
    lates: (session) => `${base}/${session}/late/`,
    late: (session, owner) => `${base}/${session}/late/${owner}`,
    held: (session, owner) => `${base}/${session}/held/${owner}`
  };
}
