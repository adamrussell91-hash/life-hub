import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

import {
  DEFAULT_TEACHER_RAIL_PREFS,
  TEACHER_RAIL_PREFS_KEY,
  readTeacherRailPrefs,
  writeTeacherRailPrefs
} from '@/teacher/rail-prefs';

describe('teacher rail prefs', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.removeItem(TEACHER_RAIL_PREFS_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns defaults when storage is empty', () => {
    expect(readTeacherRailPrefs()).toEqual(DEFAULT_TEACHER_RAIL_PREFS);
  });

  it('round-trips collapsed state', () => {
    writeTeacherRailPrefs({ collapsed: true });
    expect(readTeacherRailPrefs()).toEqual({ collapsed: true });
    expect(JSON.parse(localStorage.getItem(TEACHER_RAIL_PREFS_KEY)!)).toEqual({
      collapsed: true
    });
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(TEACHER_RAIL_PREFS_KEY, '{nope');
    expect(readTeacherRailPrefs()).toEqual(DEFAULT_TEACHER_RAIL_PREFS);
  });

  it('falls back to defaults when shape is invalid', () => {
    localStorage.setItem(TEACHER_RAIL_PREFS_KEY, JSON.stringify({ collapsed: 'yes' }));
    expect(readTeacherRailPrefs()).toEqual(DEFAULT_TEACHER_RAIL_PREFS);
  });
});
