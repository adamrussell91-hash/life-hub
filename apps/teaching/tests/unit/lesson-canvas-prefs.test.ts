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
  BUILDER_CHROME_KEY,
  DEFAULT_BUILDER_CHROME,
  readBuilderChromePrefs,
  writeBuilderChromePrefs
} from '@/teacher/lesson-canvas/prefs';

describe('lesson builder chrome prefs', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.removeItem(BUILDER_CHROME_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns defaults when storage is empty', () => {
    expect(readBuilderChromePrefs()).toEqual({
      rail: 'open',
      chat: 'shelved',
      suggestions: 'shelved'
    });
  });

  it('round-trips shelf state', () => {
    const next = { rail: 'shelved', chat: 'open', suggestions: 'open' } as const;
    writeBuilderChromePrefs(next);
    expect(readBuilderChromePrefs()).toEqual(next);
    expect(JSON.parse(localStorage.getItem(BUILDER_CHROME_KEY)!)).toEqual(next);
  });

  it('keeps prefs saved before suggestions existed', () => {
    localStorage.setItem(BUILDER_CHROME_KEY, JSON.stringify({ rail: 'shelved', chat: 'open' }));
    expect(readBuilderChromePrefs()).toEqual({
      rail: 'shelved',
      chat: 'open',
      suggestions: 'shelved'
    });
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(BUILDER_CHROME_KEY, '{nope');
    expect(readBuilderChromePrefs()).toEqual(DEFAULT_BUILDER_CHROME);
  });

  it('falls back to defaults when shape is invalid', () => {
    localStorage.setItem(BUILDER_CHROME_KEY, JSON.stringify({ rail: 'shelved' }));
    expect(readBuilderChromePrefs()).toEqual(DEFAULT_BUILDER_CHROME);

    localStorage.setItem(BUILDER_CHROME_KEY, JSON.stringify({ rail: 'open', chat: 'gone' }));
    expect(readBuilderChromePrefs()).toEqual(DEFAULT_BUILDER_CHROME);
  });
});
