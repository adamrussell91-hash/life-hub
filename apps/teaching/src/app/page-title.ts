import type { RouteMatch } from './router';
import type { CurriculumResponse } from '@/teacher/nav';

const HUB_NAME = 'Teaching Hub';

function classLabel(curriculum: CurriculumResponse | null | undefined, classId: string): string | null {
  const cls = curriculum?.classes.find((entry) => entry.id === classId);
  return cls ? cls.code || cls.title : null;
}

/** The page's own name for its browser tab. Null when the page sets its own. */
export function pageName(route: RouteMatch, curriculum?: CurriculumResponse | null): string | null {
  switch (route.name) {
    case 'teacher-home':
      return 'Dashboard';
    case 'teacher-chat':
      return 'Chat';
    case 'teacher-calendar':
      return 'Calendar';
    case 'teacher-classes':
      return 'Classes';
    case 'teacher-scope-sequences':
      return 'Scope & Sequences';
    case 'teacher-units':
      return 'Units';
    case 'teacher-lessons':
      return 'Lessons';
    case 'teacher-resources':
      return 'Resource Library';
    case 'teacher-templates':
      return 'Templates';
    case 'teacher-to-mark':
      return 'To mark';
    case 'teacher-feedback':
      return 'Feedback';
    case 'teacher-trash':
      return 'Trash';
    case 'teacher-organiser-run':
      return 'Knowledge organiser';
    case 'sign-in':
      return 'Sign in';
    case 'not-found':
      return 'Page not found';
    case 'teacher-class':
      return classLabel(curriculum, route.params.classId) ?? 'Class';
    case 'teacher-mark': {
      const label = classLabel(curriculum, route.params.classId);
      return label ? `Marking ${label}` : 'Marking';
    }
    case 'teacher-student':
      return classLabel(curriculum, route.params.classId) ?? 'Student';
    case 'teacher-scope-sequence':
      return curriculum?.subjects.find((entry) => entry.id === route.params.subjectId)?.display_title ?? 'Scope & Sequence';
    case 'teacher-unit':
      return curriculum?.units.find((entry) => entry.id === route.params.unitId)?.title || 'Unit';
    case 'teacher-document':
      return curriculum?.documents?.find((entry) => entry.id === route.params.documentId)?.title || 'Document';
    case 'teacher-lesson':
      return curriculum?.lessons.find((entry) => entry.id === route.params.lessonId)?.title || 'Lesson';
    default:
      return null;
  }
}

/** Pages named after a class, unit or lesson. They load the curriculum anyway. */
export function namedByCurriculum(route: RouteMatch): boolean {
  return [
    'teacher-class',
    'teacher-mark',
    'teacher-student',
    'teacher-scope-sequence',
    'teacher-unit',
    'teacher-document',
    'teacher-lesson'
  ].includes(route.name);
}

/** Puts a page's name on its tab, first so a row of tabs can be told apart. */
export function setPageName(name: string | null): void {
  const trimmed = name?.trim();
  document.title = trimmed ? `${trimmed} · ${HUB_NAME}` : HUB_NAME;
}
