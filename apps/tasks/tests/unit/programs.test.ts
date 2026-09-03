import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import { ProgramSchema } from '@/schemas/program';
import { catalogPrograms } from '@/domain/programs-seed';
import { queryPrograms, searchPrograms } from '@/domain/programs';

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

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;
seed.programs = catalogPrograms();

describe('program schema', () => {
  it('keeps every catalogue property from the git fixture', () => {
    const first = catalogPrograms()[0]!;
    const parsed = ProgramSchema.parse(first);
    expect(parsed.id).toBe('prog_abbmun-abbotsleigh-model-united-nations-conference');
    expect(parsed.name).toBe('ABBMUN (Abbotsleigh Model United Nations Conference)');
    expect(parsed.types).toContain('Event');
    expect(parsed.subjects).toEqual(expect.arrayContaining(['Humanities', 'Debating']));
    expect(parsed.month).toBe('March');
    expect(parsed.age_groups).toContain('Year 9');
    expect(parsed.competition_level).toBe('Beginners');
    expect(parsed.competition_length).toBe('Single Day');
    expect(parsed.location).toContain('Abbotsleigh');
    expect(parsed.organiser).toContain('Abbotsleigh');
    expect(parsed.cost).toContain('AUD 15');
    expect(parsed.cost_basis).toBe('Per student');
    expect(parsed.description).toContain('Model United Nations');
    expect(parsed.registration_link).toContain('http');
    expect(parsed.registration_window).toContain('March');
    expect(parsed.not_available_nsw).toBe(false);
    expect(parsed).not.toHaveProperty('notion_url');
  });

  it('imports the full 290-row git catalogue with stable slugs', () => {
    const programs = catalogPrograms();
    expect(programs).toHaveLength(290);
    const ids = programs.map((item) => item.id);
    expect(new Set(ids).size).toBe(290);
    for (const program of programs) {
      expect(program.id).toMatch(/^prog_[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(JSON.stringify(program).toLowerCase()).not.toContain('notion');
    }
  });
});

describe('program queries', () => {
  const programs = catalogPrograms();

  it('filters by subject, month, and NSW availability', () => {
    const maths = queryPrograms(programs, { subject: 'Mathematics' }, 'name');
    expect(maths.length).toBeGreaterThan(10);
    expect(maths.every((item) => item.subjects.includes('Mathematics'))).toBe(true);

    const august = queryPrograms(programs, { month: 'August' }, 'month');
    expect(august.every((item) => item.month === 'August')).toBe(true);

    const blocked = queryPrograms(programs, { nsw: 'unavailable' }, 'name');
    expect(blocked.every((item) => item.not_available_nsw)).toBe(true);
    expect(blocked.some((item) => item.name.includes('Craig Silvey'))).toBe(true);
  });

  it('searches across name, organiser, and description', () => {
    const hits = searchPrograms(programs, 'da vinci');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((item) => item.name.toLowerCase().includes('da vinci'))).toBe(true);
  });

  it('sorts by calendar month then name', () => {
    const sorted = queryPrograms(programs, { type: 'Competition' }, 'month');
    const months = sorted.map((item) => item.month).filter(Boolean);
    const index = (month: string) =>
      [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
        'TBA',
        'Various'
      ].indexOf(month);
    for (let i = 1; i < months.length; i += 1) {
      expect(index(months[i]!)).toBeGreaterThanOrEqual(index(months[i - 1]!));
    }
  });
});

describe('program store', () => {
  it('seeds the catalogue and supports add and delete', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const listed = await store.listPrograms();
    expect(listed.length).toBe(290);

    const created = await store.createProgram({
      name: 'Test Cup',
      types: ['Competition'],
      subjects: ['Mathematics'],
      month: 'May',
      age_groups: ['Year 7'],
      competition_level: 'All Abilities',
      competition_length: 'Single Day',
      location: 'Sydney',
      organiser: 'Tasks Hub',
      cost: 'Free',
      cost_basis: 'Free',
      description: 'A unit-test only entry.'
    });
    expect(created.id).toMatch(/^prog_/);
    expect((await store.listPrograms()).length).toBe(291);

    await store.deleteProgram(created.id);
    expect(await store.getProgram(created.id)).toBeNull();
    expect((await store.listPrograms()).length).toBe(290);
  });

  it('backfills an empty programs index from the catalogue', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, { ...seed, programs: [] });
    await kv.setJSON(keys.programsIndexKey(), { ids: [] });
    const store = createTasksStore(kv, keys);
    const listed = await store.listPrograms();
    expect(listed.length).toBe(290);
  });
});
