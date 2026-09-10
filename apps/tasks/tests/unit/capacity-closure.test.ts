import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import { buildCapacitySnapshot, toCoreyPublicView } from '@/domain/capacity';
import { computeProjectVariance, formatSlip } from '@/domain/closure';

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

describe('capacity (Corey)', () => {
  it('builds headlines without exposing task titles in the public view', () => {
    const snapshot = buildCapacitySnapshot(seed.tasks, new Date('2026-08-16T12:00:00'), 14);
    expect(snapshot.days.length).toBe(14);
    expect(snapshot.headlines.length).toBeGreaterThan(0);
    const pub = toCoreyPublicView(snapshot);
    const blob = JSON.stringify(pub);
    expect(blob).not.toContain('Finish lesson pack');
    expect(blob).not.toContain('florist');
    expect(pub.days[0]).not.toHaveProperty('open_task_count');
  });

  it('issues a share token and serves public capacity', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const share = await store.ensureCapacityShare();
    expect(share.token.length).toBeGreaterThan(8);
    const view = await store.getPublicCapacityByToken(share.token);
    expect(view?.headlines.length).toBeGreaterThan(0);
    expect(await store.getPublicCapacityByToken('nope')).toBeNull();
  });
});

describe('closure loop', () => {
  it('computes slip vs baseline for the wrap demo project', () => {
    const project = seed.projects.find((p) => p.id === 'proj_close_demo')!;
    const variance = computeProjectVariance(
      project,
      seed.tasks,
      new Date('2026-08-16T12:00:00')
    );
    expect(variance.all_tasks_done).toBe(true);
    expect(variance.ready_to_close).toBe(true);
    expect(variance.slip_days).toBe(17);
    expect(formatSlip(17)).toMatch(/past baseline/);
  });

  it('closes a project and writes a ReviewLog with planned-vs-actual', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const { project, review, variance } = await store.closeProject({
      project_id: 'proj_close_demo',
      reason: 'Marks landed; wrap the arc.'
    });
    expect(project.status).toBe('archived_dead');
    expect(project.review_summary).toContain('Marks landed');
    expect(review.outcome).toBe('closed');
    expect(review.slip_days).toBe(variance.slip_days);
    expect(review.baseline_end_date).toBe('2026-07-15');
  });
});
