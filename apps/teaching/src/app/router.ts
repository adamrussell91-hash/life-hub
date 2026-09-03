import { stripAppBase, withAppBase } from './base-path';

export type RouteName =
  | 'teacher-home'
  | 'teacher-classes'
  | 'teacher-class'
  | 'teacher-scope-sequences'
  | 'teacher-scope-sequence'
  | 'teacher-units'
  | 'teacher-unit'
  | 'teacher-lessons'
  | 'teacher-lesson'
  | 'teacher-resources'
  | 'teacher-templates'
  | 'teacher-trash'
  | 'student-lesson'
  | 'student-unit'
  | 'student-class'
  | 'student-class-lesson'
  | 'sign-in'
  | 'not-found';

export type RouteParams = {
  'teacher-home': Record<string, never>;
  'teacher-classes': Record<string, never>;
  'teacher-class': { classId: string };
  'teacher-scope-sequences': Record<string, never>;
  'teacher-scope-sequence': { subjectId: string };
  'teacher-units': Record<string, never>;
  'teacher-unit': { unitId: string };
  'teacher-lessons': Record<string, never>;
  'teacher-lesson': { lessonId: string };
  'teacher-resources': Record<string, never>;
  'teacher-templates': Record<string, never>;
  'teacher-trash': Record<string, never>;
  'student-lesson': { lessonId: string };
  'student-unit': { unitId: string };
  'student-class': { classId: string };
  'student-class-lesson': { classId: string; lessonId: string };
  'sign-in': Record<string, never>;
  'not-found': Record<string, never>;
};

export type RouteMatch<N extends RouteName = RouteName> = N extends RouteName
  ? { name: N; params: RouteParams[N]; requiresAuth: boolean; path: string }
  : never;

export type RouteHandler = (match: RouteMatch) => void;

const listeners = new Set<RouteHandler>();
let popStateBound = false;

function normalizePath(path: string): string {
  let pathname = path;

  if (/^https?:\/\//i.test(path)) {
    pathname = stripAppBase(new URL(path).pathname);
  } else {
    pathname = stripAppBase(path.split('?')[0]?.split('#')[0] ?? path);
  }

  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  return pathname;
}

export function match(pathname: string): RouteMatch | null {
  const path = normalizePath(pathname);

  if (path === '/') {
    return {
      name: 'teacher-home',
      params: {},
      requiresAuth: true,
      path: '/'
    };
  }

  if (path === '/sign-in') {
    return {
      name: 'sign-in',
      params: {},
      requiresAuth: false,
      path: '/sign-in'
    };
  }

  const studentLesson = path.match(/^\/s\/lessons\/([^/]+)$/);
  if (studentLesson) {
    return {
      name: 'student-lesson',
      params: { lessonId: studentLesson[1] },
      requiresAuth: false,
      path
    };
  }

  const studentUnit = path.match(/^\/s\/units\/([^/]+)$/);
  if (studentUnit) {
    return {
      name: 'student-unit',
      params: { unitId: studentUnit[1] },
      requiresAuth: false,
      path
    };
  }

  const studentClassLesson = path.match(/^\/s\/classes\/([^/]+)\/lessons\/([^/]+)$/);
  if (studentClassLesson) {
    return {
      name: 'student-class-lesson',
      params: { classId: studentClassLesson[1], lessonId: studentClassLesson[2] },
      requiresAuth: false,
      path
    };
  }

  const studentClass = path.match(/^\/s\/classes\/([^/]+)$/);
  if (studentClass) {
    return {
      name: 'student-class',
      params: { classId: studentClass[1] },
      requiresAuth: false,
      path
    };
  }

  if (path === '/classes') {
    return {
      name: 'teacher-classes',
      params: {},
      requiresAuth: true,
      path
    };
  }

  const teacherClass = path.match(/^\/classes\/([^/]+)$/);
  if (teacherClass) {
    return {
      name: 'teacher-class',
      params: { classId: teacherClass[1] },
      requiresAuth: true,
      path
    };
  }

  if (path === '/resources') {
    return {
      name: 'teacher-resources',
      params: {},
      requiresAuth: true,
      path
    };
  }

  if (path === '/templates') {
    return {
      name: 'teacher-templates',
      params: {},
      requiresAuth: true,
      path
    };
  }

  if (path === '/trash') {
    return {
      name: 'teacher-trash',
      params: {},
      requiresAuth: true,
      path
    };
  }

  if (path === '/units') {
    return {
      name: 'teacher-units',
      params: {},
      requiresAuth: true,
      path
    };
  }

  if (path === '/lessons') {
    return {
      name: 'teacher-lessons',
      params: {},
      requiresAuth: true,
      path
    };
  }

  if (path === '/scope-sequences') {
    return {
      name: 'teacher-scope-sequences',
      params: {},
      requiresAuth: true,
      path
    };
  }

  const scopeSequence = path.match(/^\/scope-sequences\/([^/]+)$/);
  if (scopeSequence) {
    return {
      name: 'teacher-scope-sequence',
      params: { subjectId: scopeSequence[1] },
      requiresAuth: true,
      path
    };
  }

  const teacherUnit = path.match(/^\/units\/([^/]+)$/);
  if (teacherUnit) {
    return {
      name: 'teacher-unit',
      params: { unitId: teacherUnit[1] },
      requiresAuth: true,
      path
    };
  }

  const teacherLesson = path.match(/^\/lessons\/([^/]+)$/);
  if (teacherLesson) {
    return {
      name: 'teacher-lesson',
      params: { lessonId: teacherLesson[1] },
      requiresAuth: true,
      path
    };
  }

  return {
    name: 'not-found',
    params: {},
    requiresAuth: false,
    path
  };
}

function notify(pathname: string): void {
  const result = match(pathname);
  if (!result) {
    return;
  }

  for (const listener of listeners) {
    listener(result);
  }
}

function bindPopState(): void {
  if (popStateBound) {
    return;
  }

  window.addEventListener('popstate', () => {
    notify(stripAppBase(window.location.pathname));
  });
  popStateBound = true;
}

function splitPathAndSearch(path: string): { pathname: string; search: string } {
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    return { pathname: normalizePath(url.pathname), search: url.search };
  }

  const hashIndex = path.indexOf('#');
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex < 0) {
    return { pathname: normalizePath(withoutHash), search: '' };
  }

  return {
    pathname: normalizePath(withoutHash.slice(0, queryIndex)),
    search: withoutHash.slice(queryIndex)
  };
}

export function navigate(path: string, options?: { replace?: boolean }): void {
  const { pathname, search } = splitPathAndSearch(path);
  const full = `${withAppBase(pathname)}${search}`;

  if (options?.replace) {
    history.replaceState(null, '', full);
  } else {
    history.pushState(null, '', full);
  }

  notify(pathname);
}

export function start(onRoute: RouteHandler): () => void {
  bindPopState();
  listeners.add(onRoute);
  notify(stripAppBase(window.location.pathname));

  return () => {
    listeners.delete(onRoute);
  };
}

export const mount = start;
