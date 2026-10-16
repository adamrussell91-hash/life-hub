import { describe, expect, it } from 'vitest';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import { ProgramSchema } from '@/schemas/program';
import { catalogPrograms, withCatalogueClasses, withCatalogueDates } from '@/domain/programs-seed';
import { programDatesLabel, queryPrograms, searchPrograms } from '@/domain/programs';
import { loadSeed } from './seed-fixture';

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

const seed = loadSeed();
seed.programs = catalogPrograms();

describe('program schema', () => {
  it('keeps every catalogue property from the git fixture', () => {
    const first = catalogPrograms()[0]!;
    const parsed = ProgramSchema.parse(first);
    expect(parsed.id).toBe('prog_abbmun-abbotsleigh-model-united-nations-conference');
    expect(parsed.name).toBe('ABBMUN (Abbotsleigh Model United Nations Conference)');
    expect(parsed.types).toContain('Event');
    expect(parsed.subjects).toEqual(['Debating']);
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

  it('composes year + subject filters with month sort', () => {
    const filtered = queryPrograms(
      programs,
      { age_group: 'Year 9', subject: 'Legal', type: 'Competition' },
      'month'
    );
    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every(
        (item) =>
          item.age_groups.includes('Year 9') &&
          item.subjects.includes('Legal') &&
          item.types.includes('Competition')
      )
    ).toBe(true);
    const months = filtered.map((item) => item.month).filter(Boolean) as string[];
    const rank = [
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
    ];
    for (let i = 1; i < months.length; i += 1) {
      expect(rank.indexOf(months[i]!)).toBeGreaterThanOrEqual(rank.indexOf(months[i - 1]!));
    }
  });

  it('sorts by competition length then title', () => {
    const sorted = queryPrograms(programs, { type: 'Competition' }, 'length');
    const lengths = sorted
      .map((item) => item.competition_length)
      .filter((value): value is string => Boolean(value));
    const rank = ['Single Day', 'Long Term', 'Year Long', 'Recurring'];
    for (let i = 1; i < lengths.length; i += 1) {
      expect(rank.indexOf(lengths[i]!)).toBeGreaterThanOrEqual(rank.indexOf(lengths[i - 1]!));
    }
  });

  it('keeps Model UN search hits when Year 9 and month sort are applied', () => {
    const hits = queryPrograms(programs, { query: 'model united', age_group: 'Year 9' }, 'month');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((item) => item.age_groups.includes('Year 9'))).toBe(true);
    expect(
      hits.some(
        (item) =>
          item.name.toLowerCase().includes('model united') ||
          item.description.toLowerCase().includes('model united')
      )
    ).toBe(true);
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

describe('catalogue dates', () => {
  it('only uses real dates, with the end never before the start', () => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const dated = catalogPrograms().filter((program) => program.starts_on || program.ends_on);
    expect(dated.length).toBeGreaterThanOrEqual(30);
    for (const program of dated) {
      if (program.starts_on) expect(program.starts_on, program.name).toMatch(iso);
      if (program.ends_on) expect(program.ends_on, program.name).toMatch(iso);
      if (program.starts_on && program.ends_on) expect(program.ends_on >= program.starts_on, program.name).toBe(true);
      if (program.dates_source_url) expect(program.dates_source_url, program.name).toMatch(/^https?:\/\//);
    }
  });

  it('gives a stored program the catalogue dates until dates are saved on it', () => {
    const fromStore = { id: 'prog_international-business-olympiad-ibo', name: 'IBO' };
    expect(withCatalogueDates(fromStore)).toMatchObject({ starts_on: '2026-07-25', ends_on: '2026-08-14' });
    const cleared = { ...fromStore, starts_on: null, ends_on: null };
    expect(withCatalogueDates(cleared)).toBe(cleared);
    const unknown = { id: 'prog_not-in-catalogue', name: 'Local' };
    expect(withCatalogueDates(unknown)).toBe(unknown);
  });

  it('labels a run, a single day, and a due date', () => {
    expect(programDatesLabel({ starts_on: '2026-07-25', ends_on: '2026-08-14' })).toBe('25 Jul 2026 – 14 Aug 2026');
    expect(programDatesLabel({ starts_on: '2026-04-04', ends_on: null })).toBe('4 Apr 2026');
    expect(programDatesLabel({ starts_on: null, ends_on: '2026-05-10' })).toBe('Due 10 May 2026');
    expect(programDatesLabel({ starts_on: null, ends_on: null })).toBeNull();
  });
});

describe('catalogue classification', () => {
  it('defaults the branch fields to empty on an unclassified entry', () => {
    const first = { ...catalogPrograms()[0]! };
    delete first.format;
    delete first.provider;
    delete first.settings;
    delete first.entry;
    delete first.entry_route;
    const parsed = ProgramSchema.parse(first);
    expect(parsed).toMatchObject({ format: null, provider: null, settings: [], entry: null, entry_route: null });
  });

  it('keeps known values and rejects unknown ones', () => {
    const base = catalogPrograms()[0]!;
    const parsed = ProgramSchema.parse({
      ...base,
      format: 'Simulation',
      provider: 'External',
      settings: ['At school', 'Online'],
      entry: 'Team',
      entry_route: 'School enters'
    });
    expect(parsed.settings).toEqual(['At school', 'Online']);
    expect(() => ProgramSchema.parse({ ...base, format: 'Mock legal' })).toThrow();
    expect(() => ProgramSchema.parse({ ...base, settings: ['Home'] })).toThrow();
  });

  it('leaves a stored record alone when it is saved or the catalogue has no class for it', () => {
    const saved = { id: catalogPrograms()[0]!.id, name: 'x', format: null };
    expect(withCatalogueClasses(saved)).toBe(saved);
    const unknown = { id: 'prog_not-in-catalogue', name: 'Local' };
    expect(withCatalogueClasses(unknown)).toBe(unknown);
  });

  it('classifies every catalogue entry, keeping Classics and Languages off Justice', () => {
    // Left blank on purpose: a professional association, a family reference, and an awards directory.
    const unclassified = new Set([
      'prog_world-council-for-gifted-and-talented-children-wcgtc',
      'prog_johns-hopkins-center-for-talented-youth-cty',
      'prog_extracurricular-activity-excellence-eae-awards'
    ]);
    // History of Greece and Rome is the subject, including the school Toga Day.
    const classicsOnJustice = new Set([
      'prog_national-hellenic-civilization-exam-nhce',
      'prog_national-roman-civilization-exam-nrce',
      'prog_toga-day-school-event'
    ]);
    const justiceSubjects = new Set([
      'Humanities',
      'History',
      'Public Speaking',
      'Legal',
      'Debating',
      'Geography',
      'Leadership',
      'Civics'
    ]);
    for (const program of catalogPrograms()) {
      if (!unclassified.has(program.id)) {
        expect(program.format, program.name).toBeTruthy();
        expect(program.provider, program.name).toBeTruthy();
        expect(program.settings.length, program.name).toBeGreaterThan(0);
        expect(program.entry, program.name).toBeTruthy();
        expect(program.entry_route, program.name).toBeTruthy();
      }
      const classical = program.subjects.includes('Classics') || program.subjects.includes('Languages');
      if (!classical || classicsOnJustice.has(program.id)) continue;
      expect(
        program.subjects.filter((subject) => justiceSubjects.has(subject)),
        program.name
      ).toEqual([]);
    }
  });

  it('filters by format', () => {
    const [a, b] = catalogPrograms();
    const programs = [
      { ...a!, format: 'Exam' as const },
      { ...b!, format: 'Speaking' as const }
    ];
    expect(queryPrograms(programs, { format: 'Speaking' }, 'name').map((p) => p.id)).toEqual([b!.id]);
  });
});
