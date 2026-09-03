import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import { hourInTimeZone, isIntuitiveScanSlot } from '@/domain/intuitive-scan';
import type { IntuitiveJudge } from '@/ai/intuitive-judge';

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

describe('intuitive scan slots', () => {
  it('fires at 6am Sydney and skips the hour after', () => {
    const six = new Date('2026-08-26T20:00:00.000Z');
    const seven = new Date('2026-08-26T21:00:00.000Z');
    expect(hourInTimeZone(six)).toBe(6);
    expect(isIntuitiveScanSlot(six)).toBe(true);
    expect(hourInTimeZone(seven)).toBe(7);
    expect(isIntuitiveScanSlot(seven)).toBe(false);
  });
});

describe('runIntuitiveScan', () => {
  it('persists judgment flags once and skips the AI pass when no judge is configured', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const judge: IntuitiveJudge = async () => ({
      flags: [
        {
          pattern_description:
            'Lock MindWorks term brief is a fat piece of work and the week already has a pile of dues — start it before the admin swallows Thursday.',
          source_project_or_task_id: 'task_demo_mw_brief',
          fingerprint: 'intuitive:task_demo_mw_brief:crowded-week'
        }
      ],
      model: 'test-judge'
    });

    const first = await store.runIntuitiveScan({
      now: new Date('2026-08-16T12:00:00'),
      judge
    });
    expect(first.skipped_ai).toBe(false);
    expect(first.raised).toHaveLength(1);
    expect(first.raised[0]?.pattern_kind).toBe('intuitive');
    expect(first.model).toBe('test-judge');

    const hammond = await store.listAgentInbox('General Hammond');
    expect(hammond.some((flag) => flag.fingerprint === 'intuitive:task_demo_mw_brief:crowded-week')).toBe(
      true
    );

    const second = await store.runIntuitiveScan({
      now: new Date('2026-08-16T12:00:00'),
      judge
    });
    expect(second.raised).toHaveLength(0);
    expect(second.skipped).toBe(1);
    expect(second.judged).toBe(1);

    const skipped = await store.runIntuitiveScan({
      now: new Date('2026-08-16T12:00:00'),
      judge: null
    });
    expect(skipped.skipped_ai).toBe(true);
    expect(skipped.reason).toBe('no_api_key');
    expect(skipped.raised).toHaveLength(0);

    const meta = await store.getIntuitiveScanMeta();
    expect(meta?.reason).toBe('no_api_key');
  });
});
