import { describe, expect, it } from 'vitest';
import {
  parseClareBriefingJudgment,
  type ClareBriefingJudge
} from '@/ai/clare-briefing-judge';
import { buildMorningSweep } from '@/domain/clare-desk';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import * as keys from '@/storage/keys';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

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

describe('parseClareBriefingJudgment', () => {
  it('parses a matching flag count', () => {
    const judgment = parseClareBriefingJudgment(
      JSON.stringify({
        lead: 'One thing before we start.',
        flags: ['Flag one.'],
        closer: 'Dump away.'
      }),
      1
    );
    expect(judgment.ok).toBe(true);
    expect(judgment.lead).toBe('One thing before we start.');
    expect(judgment.flags).toEqual(['Flag one.']);
    expect(judgment.closer).toBe('Dump away.');
  });

  it('discards a flags array whose length does not match the facts', () => {
    const judgment = parseClareBriefingJudgment(
      JSON.stringify({ lead: 'Lead.', flags: ['a', 'b'], closer: 'Closer.' }),
      1
    );
    expect(judgment.flags).toBeNull();
  });

  it('is not ok on unparseable text — callers should keep the deterministic facts', () => {
    const judgment = parseClareBriefingJudgment('not json', 0);
    expect(judgment.ok).toBe(false);
  });
});

describe('store.briefWithClare with a judge', () => {
  it('overlays Clare-authored lead/flags/closer without touching sections', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const now = new Date(2026, 7, 27);
    const facts = buildMorningSweep(await store.listTasks(), now);

    const judge: ClareBriefingJudge = async () => ({
      ok: true,
      lead: 'Sharper lead written by the model.',
      flags: facts.flags.map((f) => `Rewritten: ${f.text}`),
      closer: 'Sharper closer.'
    });

    const briefing = await store.briefWithClare({ now, judge, lifeContext: null });
    expect(briefing.lead).toBe('Sharper lead written by the model.');
    expect(briefing.closer).toBe('Sharper closer.');
    expect(briefing.sections).toEqual(facts.sections);
    expect(briefing.flags.map((f) => f.text)).toEqual(
      facts.flags.map((f) => `Rewritten: ${f.text}`)
    );
  });

  it('falls back to the deterministic briefing when the judge fails', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const now = new Date(2026, 7, 27);
    const facts = buildMorningSweep(await store.listTasks(), now);

    const failingJudge: ClareBriefingJudge = async () => {
      throw new Error('network down');
    };

    const briefing = await store.briefWithClare({ now, judge: failingJudge, lifeContext: null });
    expect(briefing.lead).toBe(facts.lead);
    expect(briefing.closer).toBe(facts.closer);
  });

  it('returns the deterministic briefing unchanged when no judge is configured', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const now = new Date(2026, 7, 27);
    const facts = buildMorningSweep(await store.listTasks(), now);

    const briefing = await store.briefWithClare({ now, judge: null });
    expect(briefing).toEqual(facts);
  });
});
