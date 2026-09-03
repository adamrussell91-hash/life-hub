import { describe, expect, it } from 'vitest';
import { appBasePath, stripAppBase, withAppBase } from '@/app/base-path';

describe('umbrella base path', () => {
  it('is a no-op when Vite base is /', () => {
    expect(appBasePath()).toBe('');
    expect(stripAppBase('/s/lessons/lesson_a')).toBe('/s/lessons/lesson_a');
    expect(withAppBase('/s/lessons/lesson_a')).toBe('/s/lessons/lesson_a');
    expect(withAppBase('/')).toBe('/');
  });
});
