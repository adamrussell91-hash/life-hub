import { describe, it, expect } from 'vitest';
import { studentStage } from '@/tutorial/stage';

describe('student stage', () => {
  it('goes Common, then the group page, then done', () => {
    expect(studentStage({ common: false, exit: false }, { hasCommon: true })).toBe('common');
    expect(studentStage({ common: true, exit: false }, { hasCommon: true })).toBe('waiting');
    expect(studentStage({ common: true, exit: true }, { hasCommon: true })).toBe('done');
  });
  it('skips Common when there is none', () => {
    expect(studentStage({ common: false, exit: false }, { hasCommon: false })).toBe('waiting');
  });
});
