import { describe, it, expect } from 'vitest';
import { match } from '@/app/router';
import { sectionFromRoute } from '@/teacher/section';

describe('sectionFromRoute', () => {
  it('maps teacher routes to primary sections', () => {
    expect(sectionFromRoute(match('/')!)).toBe('home');
    expect(sectionFromRoute(match('/classes')!)).toBe('classes');
    expect(sectionFromRoute(match('/classes/class_2026_12engadv1')!)).toBe('classes');
    expect(sectionFromRoute(match('/scope-sequences')!)).toBe('scope-sequences');
    expect(sectionFromRoute(match('/scope-sequences/subject_y12_engadv')!)).toBe('scope-sequences');
    expect(sectionFromRoute(match('/units')!)).toBe('units');
    expect(sectionFromRoute(match('/units/unit_aotfw')!)).toBe('units');
    expect(sectionFromRoute(match('/lessons')!)).toBe('lessons');
    expect(sectionFromRoute(match('/lessons/lesson_aotfw_008')!)).toBe('lessons');
    expect(sectionFromRoute(match('/resources')!)).toBe('resources');
  });

  it('returns null for non-teacher workspace routes', () => {
    expect(sectionFromRoute(match('/sign-in')!)).toBeNull();
    expect(sectionFromRoute(match('/s/lessons/lesson_aotfw_008')!)).toBeNull();
  });
});
