import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import {
  rebuildJournalSearchIndex,
  searchJournalIndex,
} from '@/journal/search-index';

function miniJournal(overrides: Partial<JournalDocument> = {}): JournalDocument {
  return {
    id: 'jrn_test',
    schema_version: 1,
    trip_id: 'trp_test',
    title: 'Summer notes',
    revision: 3,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences: {},
    operations: [],
    legs: [
      {
        id: 'leg_a',
        trip_id: 'trp_test',
        pattern_id: 'pat',
        destination: 'Kuala Lumpur',
        timezone: 'Asia/Kuala_Lumpur',
        order: 1,
        lifecycle: 'live',
      },
    ],
    days: [],
    moments: [
      {
        id: 'mom_live',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: ['med_1'],
        display_order: 1,
        lifecycle: 'live',
        place: { name: 'Petronas Towers' },
        text: 'Morning light on steel.',
      },
      {
        id: 'mom_deleted',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: [],
        display_order: 2,
        lifecycle: 'deleted',
        text: 'Should never appear',
      },
    ],
    media: [
      {
        id: 'med_1',
        url: 'https://example.test/1.jpg',
        width: 100,
        height: 100,
        lifecycle: 'live',
        caption: 'Tower detail',
        transcript: 'We arrived early.',
        object_notes: 'Brass door handle',
      },
      {
        id: 'med_gone',
        url: 'https://example.test/2.jpg',
        width: 100,
        height: 100,
        lifecycle: 'deleted',
        caption: 'Deleted caption',
      },
    ],
    transitions: [],
    ...overrides,
  };
}

describe('rebuildJournalSearchIndex', () => {
  it('indexes live places, titles, captions, text, notes, and transcripts', () => {
    const index = rebuildJournalSearchIndex(miniJournal());
    const fields = new Set(index.rows.map((r) => r.field));
    expect(fields).toContain('title');
    expect(fields).toContain('place');
    expect(fields).toContain('text');
    expect(fields).toContain('caption');
    expect(fields).toContain('transcript');
    expect(fields).toContain('object_note');
    expect(index.rows.some((r) => r.label.includes('Should never'))).toBe(false);
    expect(index.rows.some((r) => r.label.includes('Deleted caption'))).toBe(false);
  });

  it('excludes deleted legs and their moments', () => {
    const journal = miniJournal({
      legs: [
        {
          id: 'leg_dead',
          trip_id: 'trp_test',
          pattern_id: 'pat',
          destination: 'Hidden city',
          timezone: 'UTC',
          order: 1,
          lifecycle: 'deleted',
        },
      ],
      moments: [
        {
          id: 'mom_orphan',
          leg_id: 'leg_dead',
          local_date: '2026-03-01',
          media_ids: [],
          display_order: 1,
          lifecycle: 'live',
          text: 'Orphan moment',
        },
      ],
    });
    const index = rebuildJournalSearchIndex(journal);
    expect(index.rows.some((r) => r.label.includes('Orphan'))).toBe(false);
    expect(index.rows.some((r) => r.label.includes('Hidden city'))).toBe(false);
  });
});

describe('searchJournalIndex', () => {
  it('matches substring queries case-insensitively', () => {
    const index = rebuildJournalSearchIndex(miniJournal());
    const hits = searchJournalIndex(index, 'PETRONAS');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.field).toBe('place');
  });
});
