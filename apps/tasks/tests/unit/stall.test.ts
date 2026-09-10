import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import { findStallCandidates, lastProjectActivityAt } from '@/domain/stall';

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

describe('stall detection', () => {
  it('flags Masters reading notes as quiet past six weeks', () => {
    const from = new Date('2026-08-16T12:00:00');
    const candidates = findStallCandidates(seed.projects, seed.tasks, from, 6);
    expect(candidates.some((c) => c.project.id === 'proj_stalled_masters')).toBe(true);
    expect(candidates.some((c) => c.project.id === 'proj_mindworks')).toBe(false);
  });

  it('uses the latest of project and child task activity', () => {
    const project = seed.projects.find((p) => p.id === 'proj_stalled_masters')!;
    const last = lastProjectActivityAt(project, seed.tasks);
    expect(last.toISOString().startsWith('2026-06-01')).toBe(true);
  });
});

describe('stall store flow', () => {
  it('flags, revives, and writes a review log', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);

    const { flagged } = await store.flagStalledProjects({
      now: new Date('2026-08-16T12:00:00'),
      weeks: 6
    });
    expect(flagged.some((p) => p.id === 'proj_stalled_masters' && p.status === 'stalled')).toBe(
      true
    );

    const { project, review } = await store.resolveStalledProject({
      project_id: 'proj_stalled_masters',
      outcome: 'revived',
      reason: 'Back on the schedule for Term 4'
    });
    expect(project.status).toBe('revived');
    expect(project.stall_flagged_at).toBeNull();
    expect(review.outcome).toBe('revived');
    const logs = await store.listReviewLogs();
    expect(logs.some((l) => l.id === review.id)).toBe(true);
  });

  it('frankensteins tasks into another project then buries the shell', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    await store.flagStalledProjects({ now: new Date('2026-08-16T12:00:00') });

    const { project, moved_task_ids } = await store.resolveStalledProject({
      project_id: 'proj_stalled_masters',
      outcome: 'frankensteined',
      reason: 'Fold notes into MindWorks',
      merge_into_project_id: 'proj_mindworks'
    });
    expect(project.status).toBe('archived_dead');
    expect(moved_task_ids).toContain('task_demo_masters_notes');
    const moved = await store.getTask('task_demo_masters_notes');
    expect(moved?.parent_project_id).toBe('proj_mindworks');
  });
});
