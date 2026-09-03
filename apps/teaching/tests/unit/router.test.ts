import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { match, navigate, start, mount, type RouteMatch } from '@/app/router';

describe('router match', () => {
  it('matches teacher home', () => {
    expect(match('/')).toEqual({
      name: 'teacher-home',
      params: {},
      requiresAuth: true,
      path: '/'
    });
  });

  it('matches teacher lesson editor', () => {
    expect(match('/lessons/lesson_aotfw_008')).toEqual({
      name: 'teacher-lesson',
      params: { lessonId: 'lesson_aotfw_008' },
      requiresAuth: true,
      path: '/lessons/lesson_aotfw_008'
    });
  });

  it('matches public student lesson view', () => {
    expect(match('/s/lessons/lesson_aotfw_008')).toEqual({
      name: 'student-lesson',
      params: { lessonId: 'lesson_aotfw_008' },
      requiresAuth: false,
      path: '/s/lessons/lesson_aotfw_008'
    });
  });

  it('matches public student unit view', () => {
    expect(match('/s/units/unit_aotfw')).toEqual({
      name: 'student-unit',
      params: { unitId: 'unit_aotfw' },
      requiresAuth: false,
      path: '/s/units/unit_aotfw'
    });
  });

  it('matches public student class view', () => {
    expect(match('/s/classes/class_2026_12engadv1')).toEqual({
      name: 'student-class',
      params: { classId: 'class_2026_12engadv1' },
      requiresAuth: false,
      path: '/s/classes/class_2026_12engadv1'
    });
  });

  it('matches public student class-scoped lesson view', () => {
    expect(match('/s/classes/class_2026_12engadv1/lessons/lesson_aotfw_008')).toEqual({
      name: 'student-class-lesson',
      params: {
        classId: 'class_2026_12engadv1',
        lessonId: 'lesson_aotfw_008'
      },
      requiresAuth: false,
      path: '/s/classes/class_2026_12engadv1/lessons/lesson_aotfw_008'
    });
  });

  it('still matches bare student class and bare lesson', () => {
    expect(match('/s/classes/class_2026_12engadv1')?.name).toBe('student-class');
    expect(match('/s/lessons/lesson_aotfw_008')?.name).toBe('student-lesson');
  });

  it('matches sign-in gate', () => {
    expect(match('/sign-in')).toEqual({
      name: 'sign-in',
      params: {},
      requiresAuth: false,
      path: '/sign-in'
    });
  });

  it('normalizes trailing slashes and query strings', () => {
    expect(match('/sign-in/?next=%2F')).toEqual({
      name: 'sign-in',
      params: {},
      requiresAuth: false,
      path: '/sign-in'
    });
  });

  it('matches a not-found page for unknown paths', () => {
    expect(match('/unknown')).toEqual({
      name: 'not-found',
      params: {},
      requiresAuth: false,
      path: '/unknown'
    });
    expect(match('/s/lessons')?.name).toBe('not-found');
    expect(match('/s/units')?.name).toBe('not-found');
    expect(match('/s/classes')?.name).toBe('not-found');
  });

  it('matches teacher section list routes', () => {
    expect(match('/lessons')).toEqual({
      name: 'teacher-lessons',
      params: {},
      requiresAuth: true,
      path: '/lessons'
    });
    expect(match('/classes')).toEqual({
      name: 'teacher-classes',
      params: {},
      requiresAuth: true,
      path: '/classes'
    });
    expect(match('/resources')).toEqual({
      name: 'teacher-resources',
      params: {},
      requiresAuth: true,
      path: '/resources'
    });
    expect(match('/trash')).toEqual({
      name: 'teacher-trash',
      params: {},
      requiresAuth: true,
      path: '/trash'
    });
    expect(match('/units')).toEqual({
      name: 'teacher-units',
      params: {},
      requiresAuth: true,
      path: '/units'
    });
    expect(match('/scope-sequences')).toEqual({
      name: 'teacher-scope-sequences',
      params: {},
      requiresAuth: true,
      path: '/scope-sequences'
    });
  });

  it('matches teacher section detail routes', () => {
    expect(match('/units/unit_aotfw')).toEqual({
      name: 'teacher-unit',
      params: { unitId: 'unit_aotfw' },
      requiresAuth: true,
      path: '/units/unit_aotfw'
    });
    expect(match('/scope-sequences/subject_y12_engadv')).toEqual({
      name: 'teacher-scope-sequence',
      params: { subjectId: 'subject_y12_engadv' },
      requiresAuth: true,
      path: '/scope-sequences/subject_y12_engadv'
    });
  });

  it('matches teacher class detail', () => {
    expect(match('/classes/class_2026_12engadv1')).toEqual({
      name: 'teacher-class',
      params: { classId: 'class_2026_12engadv1' },
      requiresAuth: true,
      path: '/classes/class_2026_12engadv1'
    });
  });

  it('does not treat list paths as lesson editor', () => {
    expect(match('/lessons')?.name).toBe('teacher-lessons');
    expect(match('/lessons/lesson_aotfw_008')?.name).toBe('teacher-lesson');
  });

  it('marks only teacher routes as auth-required', () => {
    const cases: Array<[string, boolean]> = [
      ['/', true],
      ['/classes', true],
      ['/lessons', true],
      ['/lessons/lesson_aotfw_008', true],
      ['/units/unit_aotfw', true],
      ['/s/lessons/lesson_aotfw_008', false],
      ['/s/units/unit_aotfw', false],
      ['/s/classes/class_2026_12engadv1', false],
      ['/s/classes/class_2026_12engadv1/lessons/lesson_aotfw_008', false],
      ['/sign-in', false]
    ];

    for (const [path, requiresAuth] of cases) {
      expect(match(path)?.requiresAuth).toBe(requiresAuth);
    }
  });
});

describe('router navigation', () => {
  let pushState: MockInstance<History['pushState']>;
  let replaceState: MockInstance<History['replaceState']>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    pushState = vi.spyOn(history, 'pushState');
    replaceState = vi.spyOn(history, 'replaceState');
  });

  afterEach(() => {
    pushState.mockRestore();
    replaceState.mockRestore();
  });

  it('navigate pushes history and notifies listeners', () => {
    const onRoute = vi.fn<(match: RouteMatch) => void>();
    const stop = start(onRoute);
    onRoute.mockClear();

    navigate('/lessons/lesson_aotfw_008');

    expect(pushState).toHaveBeenCalledWith(null, '', '/lessons/lesson_aotfw_008');
    expect(onRoute).toHaveBeenCalledWith({
      name: 'teacher-lesson',
      params: { lessonId: 'lesson_aotfw_008' },
      requiresAuth: true,
      path: '/lessons/lesson_aotfw_008'
    });

    stop();
  });

  it('navigate can replace history entries', () => {
    navigate('/sign-in', { replace: true });

    expect(replaceState).toHaveBeenCalledWith(null, '', '/sign-in');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('navigate notifies listeners for unknown paths', () => {
    const onRoute = vi.fn<(match: RouteMatch) => void>();
    const stop = start(onRoute);
    onRoute.mockClear();

    navigate('/nope');

    expect(onRoute).toHaveBeenCalledWith({
      name: 'not-found',
      params: {},
      requiresAuth: false,
      path: '/nope'
    });

    stop();
  });

  it('navigate preserves query strings in history', () => {
    const onRoute = vi.fn<(match: RouteMatch) => void>();
    const stop = start(onRoute);
    onRoute.mockClear();

    navigate('/scope-sequences/subject_y12_engadv?selectNote=ti_note_mid');

    expect(pushState).toHaveBeenCalledWith(
      null,
      '',
      '/scope-sequences/subject_y12_engadv?selectNote=ti_note_mid'
    );
    expect(onRoute).toHaveBeenCalledWith({
      name: 'teacher-scope-sequence',
      params: { subjectId: 'subject_y12_engadv' },
      requiresAuth: true,
      path: '/scope-sequences/subject_y12_engadv'
    });

    stop();
  });

  it('start handles browser back and forward', () => {
    const onRoute = vi.fn<(match: RouteMatch) => void>();
    const stop = start(onRoute);
    onRoute.mockClear();

    window.history.pushState(null, '', '/sign-in');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(onRoute).toHaveBeenCalledWith({
      name: 'sign-in',
      params: {},
      requiresAuth: false,
      path: '/sign-in'
    });

    stop();
  });

  it('mount is an alias for start', () => {
    expect(mount).toBe(start);
  });
});
