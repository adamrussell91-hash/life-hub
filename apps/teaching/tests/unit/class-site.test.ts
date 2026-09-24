import { describe, expect, it } from 'vitest';
import {
  isClassSiteStudentRoute,
  renderClassSiteDeadEnd
} from '@/app/class-site';

describe('class site', () => {
  it('allows only published student routes', () => {
    expect(isClassSiteStudentRoute('student-lesson')).toBe(true);
    expect(isClassSiteStudentRoute('student-unit')).toBe(true);
    expect(isClassSiteStudentRoute('student-class')).toBe(true);
    expect(isClassSiteStudentRoute('student-class-lesson')).toBe(true);
    expect(isClassSiteStudentRoute('sign-in')).toBe(false);
    expect(isClassSiteStudentRoute('teacher-home')).toBe(false);
    expect(isClassSiteStudentRoute('not-found')).toBe(false);
  });

  it('renders a dead end with no link back', () => {
    const root = document.createElement('div');
    root.innerHTML = '<a href="/sign-in">Sign in</a>';
    renderClassSiteDeadEnd(root);
    expect(root.textContent).toBe("This page isn't available.");
    expect(root.querySelector('a')).toBeNull();
    expect(root.innerHTML.toLowerCase()).not.toContain('sign');
    expect(document.title).toBe('Page not available');
  });
});