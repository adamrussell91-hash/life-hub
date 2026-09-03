import { describe, expect, it } from 'vitest';
import type { CurriculumResponse } from '@/teacher/nav';
import { searchCurriculumTitles } from '@/teacher/search/client-search';
import { mergeAndRankHits } from '@/teacher/search/rank';
import type { ContentSearchHit, SearchHit } from '@/teacher/search/types';

function curriculumFixture(): CurriculumResponse {
  return {
    years: [
      {
        id: 'y12',
        type: 'year',
        title: 'Year 12',
        slug: 'year-12',
        year_level: 12,
        subject_ids: ['eng'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    subjects: [
      {
        id: 'eng',
        type: 'subject',
        title: 'English Advanced',
        display_title: 'English Advanced',
        slug: 'english-advanced',
        unit_ids: ['u1'],
        outcome_ids: [],
        class_ids: ['c1'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    units: [
      {
        id: 'u1',
        type: 'unit',
        title: 'Artist of the Floating World',
        slug: 'aotfw',
        year_id: 'y12',
        subject_id: 'eng',
        lesson_ids: ['l1'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    lessons: [
      {
        id: 'l1',
        title: 'Memory and Identity',
        slug: 'memory',
        unit_id: 'u1',
        sequence: 1,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ],
    classes: [
      {
        id: 'c1',
        type: 'class',
        title: 'English Advanced 12A',
        code: '12ENG-A',
        slug: '12eng-a',
        subject_id: 'eng',
        year_id: 'y12',
        academic_year: 2026,
        active_unit_ids: ['u1'],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    scheduled_lessons: [],
    scope_sequences: [
      {
        id: 'ss1',
        type: 'scope_sequence',
        title: 'English Adv 2026',
        slug: 'eng-2026',
        subject_id: 'eng',
        academic_year: 2026,
        week_count: 40,
        terms: [],
        timeline_items: [
          {
            id: 'n1',
            kind: 'note',
            title: 'HSC trial week',
            start_week: 30,
            end_week: 31,
            order: 0
          }
        ],
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    media: [
      {
        id: 'm1',
        type: 'media',
        title: 'Floating World slides',
        slug: 'fw-slides',
        provider: 'external',
        media_type: 'pdf',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    schedule_anchor_date: '2026-08-12'
  };
}

describe('searchCurriculumTitles', () => {
  it('returns empty for blank query', () => {
    expect(searchCurriculumTitles(curriculumFixture(), '', [])).toEqual([]);
    expect(searchCurriculumTitles(curriculumFixture(), '   ', [])).toEqual([]);
  });

  it('matches lesson title and builds hierarchy', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'memory', []);
    const lesson = hits.find((h) => h.type === 'lesson' && h.id === 'l1');
    expect(lesson).toBeTruthy();
    expect(lesson?.hierarchy).toMatch(/Year 12/i);
    expect(lesson?.hierarchy).toMatch(/English/i);
    expect(lesson?.match).toBe('title');
    expect(lesson?.href).toBe('/lessons/l1');
  });

  it('matches unit title and builds full hierarchy', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'floating', []);
    const unit = hits.find((h) => h.type === 'unit' && h.id === 'u1');
    expect(unit).toBeTruthy();
    expect(unit?.hierarchy).toMatch(/Year 12/i);
    expect(unit?.hierarchy).toMatch(/English/i);
    expect(unit?.hierarchy).toMatch(/Floating World/i);
    expect(unit?.href).toBe('/units/u1');
  });

  it('matches class code', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), '12eng', []);
    expect(hits.some((h) => h.type === 'class' && h.match === 'code')).toBe(true);
  });

  it('matches scope note titles', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'trial', []);
    const note = hits.find((h) => h.type === 'scope_note');
    expect(note).toBeTruthy();
    expect(note?.href).toBe('/scope-sequences/eng?selectNote=n1');
  });

  it('opens a subject at its scope sequence', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'english advanced', []);
    const subject = hits.find((h) => h.type === 'subject' && h.id === 'eng');
    expect(subject?.href).toBe('/scope-sequences/eng');
  });

  it('opens a composition from search', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'starter pack', [
      { id: 'comp1', title: 'Starter pack' }
    ]);
    const composition = hits.find((h) => h.type === 'composition' && h.id === 'comp1');
    expect(composition?.href).toBe('/templates');
  });

  it('emits hierarchy matches when year/subject/unit labels match but title does not', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'english', []);
    const lesson = hits.find((h) => h.type === 'lesson' && h.id === 'l1');
    expect(lesson).toBeTruthy();
    expect(lesson?.match).toBe('hierarchy');
    expect(lesson?.hierarchy).toMatch(/English/i);
    expect(lesson?.title).toBe('Memory and Identity');

    const unit = hits.find((h) => h.type === 'unit' && h.id === 'u1');
    expect(unit).toBeTruthy();
    expect(unit?.match).toBe('hierarchy');
    expect(unit?.hierarchy).toMatch(/English/i);
    expect(unit?.title).toBe('Artist of the Floating World');
  });

  it('prefers title match over hierarchy when both would match', () => {
    const hits = searchCurriculumTitles(curriculumFixture(), 'floating', []);
    const unit = hits.find((h) => h.type === 'unit' && h.id === 'u1');
    expect(unit?.match).toBe('title');

    const lesson = hits.find((h) => h.type === 'lesson' && h.id === 'l1');
    expect(lesson?.match).toBe('hierarchy');
    expect(lesson?.hierarchy).toMatch(/Floating World/i);
  });
});

describe('mergeAndRankHits', () => {
  it('prefers title matches over body and attaches snippets', () => {
    const client: SearchHit[] = [
      {
        type: 'lesson',
        id: 'l1',
        title: 'Other',
        match: 'title',
        href: '/lessons/l1'
      }
    ];
    const content: ContentSearchHit[] = [
      { type: 'lesson', id: 'l2', snippet: '…newton laws…' },
      { type: 'lesson', id: 'l1', snippet: '…also in body…' }
    ];
    const enrichBody = (hit: ContentSearchHit): SearchHit => ({
      type: hit.type,
      id: hit.id,
      title: hit.id === 'l2' ? 'Body only' : 'Other',
      match: 'body',
      snippet: hit.snippet,
      href: `/lessons/${hit.id}`
    });
    const merged = mergeAndRankHits(client, content, enrichBody);
    expect(merged[0]?.id).toBe('l1');
    expect(merged[0]?.snippet).toBe('…also in body…');
    expect(merged.some((h) => h.id === 'l2')).toBe(true);
  });
});
