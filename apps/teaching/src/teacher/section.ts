import type { RouteMatch } from '@/app/router';

export type TeacherSection =
  | 'home'
  | 'classes'
  | 'scope-sequences'
  | 'units'
  | 'lessons'
  | 'resources'
  | 'templates'
  | 'trash';

export function sectionFromRoute(match: RouteMatch): TeacherSection | null {
  switch (match.name) {
    case 'teacher-home':
      return 'home';
    case 'teacher-classes':
    case 'teacher-class':
      return 'classes';
    case 'teacher-scope-sequences':
    case 'teacher-scope-sequence':
      return 'scope-sequences';
    case 'teacher-units':
    case 'teacher-unit':
      return 'units';
    case 'teacher-lessons':
    case 'teacher-lesson':
      return 'lessons';
    case 'teacher-resources':
      return 'resources';
    case 'teacher-templates':
      return 'templates';
    case 'teacher-trash':
      return 'trash';
    default:
      return null;
  }
}
