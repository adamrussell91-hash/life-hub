import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
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

describe('closure loop', () => {
  it('computes slip vs baseline for the wrap demo project', () => {
    const project = seed.projects.find((p) => p.id === 'proj_close_demo')!;
    const variance = computeProjectVariance(
      project,
      seed.tasks,
      new Date('2026-08-16T12:00:00')
    );
    expect(variance.all_tasks_done).toBe(true);
    expect(variance.end_passed).toBe(true);
    expect(variance.ready_to_close).toBe(true);
    expect(variance.slip_days).toBe(17);
    expect(formatSlip(17)).toMatch(/past baseline/);
  });

  it('does not mark ready_to_close when the end has passed but open tasks remain', () => {
    const unfinished = seed.projects.find((p) => p.id === 'proj_close_demo')!;
    const openWork = [
      {
        ...seed.tasks.find((t) => t.parent_project_id === 'proj_close_demo')!,
        id: 'task_still_open',
        status: 'open' as const,
        completed_at: null,
        due_date: '2026-08-01'
      }
    ];
    const variance = computeProjectVariance(
      unfinished,
      openWork,
      new Date('2026-08-16T12:00:00')
    );
    expect(variance.end_passed).toBe(true);
    expect(variance.open_task_count).toBe(1);
    expect(variance.all_tasks_done).toBe(false);
    expect(variance.ready_to_close).toBe(false);
  });

  it('does not mark a standard project ready_to_close on past end with no tasks', () => {
    const emptyPast = seed.projects.find((p) => p.id === 'proj_aotfw')!;
    const variance = computeProjectVariance(emptyPast, [], new Date('2026-09-26T12:00:00'));
    expect(variance.end_passed).toBe(true);
    expect(variance.open_task_count).toBe(0);
    expect(variance.all_tasks_done).toBe(false);
    expect(variance.ready_to_close).toBe(false);
  });

  it('allows an excursion to close when the event day has passed and nothing is open', () => {
    const trip = seed.projects.find((p) => p.id === 'proj_ex_ethics_seed')!;
    const past = {
      ...trip,
      current_end_date: '2026-08-01',
      baseline_end_date: '2026-08-01'
    };
    const variance = computeProjectVariance(past, [], new Date('2026-08-16T12:00:00'));
    expect(past.type).toBe('excursion');
    expect(variance.end_passed).toBe(true);
    expect(variance.ready_to_close).toBe(true);
  });

  it('closes a project and writes a ReviewLog with planned-vs-actual', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const { project, review, variance } = await store.closeProject({
      project_id: 'proj_close_demo',
      reason: 'Marks landed; wrap the arc.'
    });
    expect(project.status).toBe('completed');
    expect(project.review_summary).toContain('Marks landed');
    expect(review.outcome).toBe('completed');
    expect(review.slip_days).toBe(variance.slip_days);
    expect(review.baseline_end_date).toBe('2026-07-15');
  });

  it('refuses to close an already-archived project', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    await store.closeProject({ project_id: 'proj_close_demo', reason: 'Done.' });
    await expect(
      store.closeProject({ project_id: 'proj_close_demo', reason: 'Again?' })
    ).rejects.toThrow(/already archived/);
  });
});
