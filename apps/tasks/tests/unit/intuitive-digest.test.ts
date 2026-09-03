import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildIntuitiveDigest } from '@/domain/intuitive-digest';
import type { SeedData } from '@/services/types';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

describe('buildIntuitiveDigest', () => {
  const now = new Date('2026-08-16T12:00:00');

  it('packs open work, day load, and already-detected rule hits — not the full store', () => {
    const digest = buildIntuitiveDigest(seed.projects, seed.tasks, now);

    expect(digest.timezone).toBe('Australia/Sydney');
    expect(digest.horizon_days).toBe(21);
    expect(digest.tasks.length).toBeGreaterThan(0);
    expect(digest.tasks.length).toBeLessThanOrEqual(60);
    expect(digest.projects.length).toBeGreaterThan(0);
    expect(digest.load).toHaveLength(14);
    expect(digest.already_detected.some((fact) => fact.kind === 'overlapping_excursions')).toBe(
      true
    );
    expect(digest.tasks.every((task) => task.status !== 'done' && task.status !== 'dead')).toBe(
      true
    );
    expect(JSON.stringify(digest).length).toBeLessThan(20_000);
  });

  it('keeps a large undated or far-out piece when the week is already loaded', () => {
    const digest = buildIntuitiveDigest(seed.projects, seed.tasks, now);
    expect(digest.tasks.some((task) => (task.minutes ?? 0) >= 120)).toBe(true);
    expect(digest.week.tasks).toBeGreaterThan(0);
  });
});
