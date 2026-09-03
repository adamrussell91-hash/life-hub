import { describe, it, expect } from 'vitest';
import { formatStudentDate } from '@/student/format';

describe('formatStudentDate', () => {
  it('formats ISO dates for reading', () => {
    expect(formatStudentDate('2026-08-12')).toBe('12/08/26');
  });

  it('returns empty string for blank input', () => {
    expect(formatStudentDate('')).toBe('');
  });
});
