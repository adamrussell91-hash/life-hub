import { describe, expect, it } from 'vitest';
import { appBaseFor, appBasePath, stripAppBase, withAppBase } from '@/app/base-path';
import { CLASS_SITE_HOST } from '@/app/class-site';

describe('umbrella base path', () => {
  it('is a no-op when Vite base is /', () => {
    expect(appBasePath()).toBe('');
    expect(stripAppBase('/s/lessons/lesson_a')).toBe('/s/lessons/lesson_a');
    expect(withAppBase('/s/lessons/lesson_a')).toBe('/s/lessons/lesson_a');
    expect(withAppBase('/')).toBe('/');
  });

  it('drops the teaching prefix on the class site', () => {
    expect(appBaseFor('/teaching/', CLASS_SITE_HOST)).toBe('');
    expect(appBaseFor('/teaching/', 'life-hub.adam-russell.com')).toBe('/teaching');
  });
});
