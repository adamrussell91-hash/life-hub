import { describe, expect, it } from 'vitest';
import { createStudentShell } from '@/student/shell';

describe('student shell', () => {
  it('exposes a skip link to the main content', () => {
    const { surface, content } = createStudentShell();
    const skip = surface.querySelector<HTMLAnchorElement>('.skip-link');
    expect(skip?.textContent).toBe('Skip to content');
    expect(skip?.getAttribute('href')).toBe('#student-main');
    expect(content.id).toBe('student-main');
  });
});
