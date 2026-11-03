/**
 * Who a side lesson is for. Core lessons are for the whole class. A support, extension or optional
 * lesson shows on a student's map once the teacher ticks them (markbook `took`), once they sit in
 * its tutorial group, or once they have started it, so nobody loses work they have begun.
 * Teachers' own views never go through this.
 */
const SIDE = new Set(['support', 'extension', 'optional']);

/** A lesson's place on the route: its own role, else the side stop on the unit map that names it. */
export function routeRoleOf(unit, lesson) {
  if (lesson.route_role) return lesson.route_role;
  const map = (unit?.blocks ?? []).find((b) => b?.block_type === 'curriculum_lines' && b.content?.version === 2);
  const stop = map?.content.rail_stops?.find((s) => s.lesson_id === lesson.id && SIDE.has(s.kind));
  return stop?.kind;
}

export const isSideLesson = (unit, lesson) => SIDE.has(routeRoleOf(unit, lesson));

/** The student has a done record, a quiz go or saved writing on this lesson. `done` is their own records. */
export function hasStarted(studentId, lessonId, { quizzes, work, done }) {
  const quiz = quizzes.find((q) => q.lesson_id === lessonId);
  return Boolean(done?.[lessonId])
    || Boolean(quiz?.scores?.[studentId])
    || Boolean(quiz?.started?.includes(studentId))
    || Boolean(work.find((w) => w.lesson_id === lessonId)?.students?.[studentId]);
}

function inTutorial(lesson, classId, studentId) {
  const t = lesson.pedagogical_mode === 'tutorial' ? lesson.tutorial : null;
  return t?.class_id === classId && (t.groups ?? []).some((g) => g?.students?.includes(studentId));
}

/** The lessons this student's map draws. `view` is the class's markbook load, `done` their own records. */
export function lessonsForStudent(lessons, view, done, studentId, classId) {
  const ticked = new Set(view.markbook.took?.[studentId] ?? []);
  return lessons.filter((l) => !SIDE.has(l.route_role)
    || ticked.has(l.id)
    || inTutorial(l, classId, studentId)
    || hasStarted(studentId, l.id, { quizzes: view.quizzes, work: view.work ?? [], done }));
}
