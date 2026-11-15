import { describe, it, expect } from 'vitest';
import { burstLabel, formatTickTime, formatPlanned, sydneyToday } from '@/student/share-format';
import { match } from '@/app/router';
import { isClassSiteStudentRoute } from '@/app/class-site';

describe('share format', () => {
  it('shows Sydney time with weekday', () => {
    expect(formatTickTime('2026-11-11T10:42:00Z')).toBe('Wed 11 Nov, 9:42pm');
    expect(formatTickTime('2026-11-10T22:05:00Z')).toBe('Wed 11 Nov, 9:05am');
  });
  it('labels a burst in whole minutes, at least one', () => {
    expect(burstLabel({ from: '2026-11-11T10:40:00Z', to: '2026-11-11T10:43:10Z', count: 5 })).toBe('5 ticked within 4 minutes');
    expect(burstLabel({ from: '2026-11-11T10:40:00Z', to: '2026-11-11T10:40:20Z', count: 3 })).toBe('3 ticked within 1 minute');
  });
  it('shows a planned day and Sydney today', () => {
    expect(formatPlanned('2026-11-03')).toBe('planned Tue 3 Nov');
    expect(sydneyToday(new Date('2026-11-14T14:00:00Z'))).toBe('2026-11-15');
  });
});

describe('share routes', () => {
  const token = 'Abc123_-Abc123_-Abc123_-';
  it('matches the page and a lesson, on the class site, with no sign-in', () => {
    expect(match(`/s/share/${token}`)).toMatchObject({ name: 'student-share', params: { token }, requiresAuth: false });
    expect(match(`/s/share/${token}/lessons/l1`)).toMatchObject({ name: 'student-share-lesson', params: { token, lessonId: 'l1' }, requiresAuth: false });
    expect(isClassSiteStudentRoute('student-share')).toBe(true);
    expect(isClassSiteStudentRoute('student-share-lesson')).toBe(true);
  });
  it('does not match a short token', () => {
    expect(match('/s/share/short')?.name).not.toBe('student-share');
  });
});
