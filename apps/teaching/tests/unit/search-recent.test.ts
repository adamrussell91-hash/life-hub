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
  RECENT_STORAGE_KEY,
  pushRecent,
  readRecent,
  type RecentItem
} from '@/teacher/search/recent';

describe('recent store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.removeItem(RECENT_STORAGE_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pushes newest first and dedupes by type+id', () => {
    pushRecent({ type: 'lesson', id: 'l1', title: 'A', opened_at: '2026-08-11T01:00:00.000Z' });
    pushRecent({ type: 'lesson', id: 'l2', title: 'B', opened_at: '2026-08-11T02:00:00.000Z' });
    pushRecent({ type: 'lesson', id: 'l1', title: 'A updated', opened_at: '2026-08-11T03:00:00.000Z' });
    const items = readRecent();
    expect(items.map((i) => i.id)).toEqual(['l1', 'l2']);
    expect(items[0]?.title).toBe('A updated');
  });

  it('caps at 10', () => {
    for (let i = 0; i < 12; i++) {
      pushRecent({
        type: 'class',
        id: `c${i}`,
        title: `C${i}`,
        opened_at: `2026-08-11T${String(i).padStart(2, '0')}:00:00.000Z`
      });
    }
    expect(readRecent()).toHaveLength(10);
  });

  it('returns [] on corrupt JSON', () => {
    localStorage.setItem(RECENT_STORAGE_KEY, '{nope');
    expect(readRecent()).toEqual([]);
  });
});
