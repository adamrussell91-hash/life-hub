import { describe, it, expect } from 'vitest';
import { studentStage, type DeviceProgress } from '@/tutorial/stage';

const none: DeviceProgress = { common: false, before: false, after: false, exit: false };
const server = (over: Partial<{ unlocked: boolean; hasCommon: boolean; hasAfter: boolean; hasExit: boolean }> = {}) => ({ unlocked: false, hasCommon: true, hasAfter: true, ...over });

describe('student stage', () => {
  it('walks Common → before → waiting', () => {
    expect(studentStage(none, server())).toBe('common');
    expect(studentStage({ ...none, common: true }, server())).toBe('before');
    expect(studentStage({ ...none, common: true, before: true }, server())).toBe('waiting');
  });
  it('skips Common when there is none', () => {
    expect(studentStage(none, server({ hasCommon: false }))).toBe('before');
  });
  it('After and the exit check open only when unlocked', () => {
    const done = { ...none, common: true, before: true };
    expect(studentStage(done, server({ unlocked: true }))).toBe('after');
    expect(studentStage({ ...done, after: true }, server({ unlocked: true }))).toBe('exit');
    expect(studentStage(done, server({ unlocked: true, hasAfter: false }))).toBe('exit');
    expect(studentStage({ ...done, after: true, exit: true }, server({ unlocked: true }))).toBe('done');
  });
  it('with no exit questions, You do finishes the tutorial', () => {
    const done = { ...none, common: true, before: true, after: true };
    expect(studentStage(done, server({ unlocked: true, hasExit: false }))).toBe('done');
    expect(studentStage({ ...none, common: true, before: true }, server({ unlocked: true, hasAfter: false, hasExit: false }))).toBe('done');
    expect(studentStage({ ...none, common: true, before: true }, server({ hasExit: false }))).toBe('waiting');
  });
});
