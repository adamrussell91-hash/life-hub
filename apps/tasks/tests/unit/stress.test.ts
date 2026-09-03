import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import {
  detectMissedDeadlines,
  detectOverlappingExcursions,
  detectStressPatterns
} from '@/domain/stress';

function memoryKv(): KvAdapter {
  const map = new Map<string, unknown>();
  return {
    async getJSON<T>(key: string) {
      return (map.has(key) ? map.get(key) : null) as T | null;
    },
    async setJSON(key: string, value: unknown) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    }
  };
}

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

describe('stress pattern detection', () => {
  it('detects Ethics and Da Vinci overlapping in a fortnight', () => {
    const hits = detectOverlappingExcursions(seed.projects);
    expect(hits.some((h) => h.pattern_kind === 'overlapping_excursions')).toBe(true);
    expect(hits[0]?.pattern_description).toMatch(/Ethics|Da Vinci/);
  });

  it('detects a cluster of missed deadlines', () => {
    const hits = detectMissedDeadlines(seed.tasks, new Date('2026-08-16T12:00:00'));
    expect(hits).toHaveLength(1);
    expect(hits[0]?.pattern_description).toMatch(/past due/);
  });

  it('aggregates patterns for a scan', () => {
    const patterns = detectStressPatterns(
      seed.projects,
      seed.tasks,
      new Date('2026-08-16T12:00:00')
    );
    expect(patterns.length).toBeGreaterThanOrEqual(2);
  });
});

describe('stress store routing', () => {
  it('writes flags into Hammond / Penelope / Vera inboxes without duplicates', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);

    const first = await store.scanAndRaiseStressFlags({
      now: new Date('2026-08-16T12:00:00')
    });
    expect(first.raised.length).toBeGreaterThanOrEqual(2);

    const hammond = await store.listAgentInbox('General Hammond');
    const penelope = await store.listAgentInbox('Penelope Rose Quillian');
    const vera = await store.listAgentInbox('Dr Vera Lenz');
    expect(hammond.length).toBe(first.raised.length);
    expect(penelope.length).toBe(first.raised.length);
    expect(vera.length).toBe(first.raised.length);

    const second = await store.scanAndRaiseStressFlags({
      now: new Date('2026-08-16T12:00:00')
    });
    expect(second.raised.length).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(first.raised.length);
  });
});
