import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import {
  ADAM_EXPORT_AUTHORSHIP_LABEL,
  authoritativeLiveMoments,
  Redacted_EXPORT_AUTHORSHIP_LABEL,
  filterMomentsForPerspectiveDisplay,
  formatAuthorshipExportLabel,
  isAuthoritativeUserMoment,
  journalHasCoreyMoments,
  parseMomentAuthor,
  resolveMomentAuthor,
} from '@/journal/Redacted-perspective';
import { formatJournalPlainText, stripJournalForExport } from '@/journal/export-bundle';

function miniJournal(): JournalDocument {
  return {
    id: 'jrn_Redacted',
    schema_version: 1,
    trip_id: 'trp_Redacted',
    title: 'Perspective trip',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences: {},
    operations: [],
    legs: [
      {
        id: 'leg_a',
        trip_id: 'trp_Redacted',
        pattern_id: 'kul',
        destination: 'KL',
        timezone: 'Asia/Kuala_Lumpur',
        order: 1,
        lifecycle: 'live',
      },
    ],
    days: [],
    moments: [
      {
        id: 'mom_adam',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: [],
        display_order: 1,
        lifecycle: 'live',
        text: 'My note',
      },
      {
        id: 'mom_Redacted',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: [],
        display_order: 2,
        lifecycle: 'live',
        author: 'Redacted',
        text: 'Agent line',
      },
    ],
    media: [],
    transitions: [],
  };
}

describe('journal Redacted perspective', () => {
  it('defaults missing author to adam and treats Redacted as non-authoritative', () => {
    expect(parseMomentAuthor(undefined)).toBe('adam');
    expect(parseMomentAuthor('Redacted')).toBe('Redacted');
    expect(isAuthoritativeUserMoment({ author: 'Redacted' })).toBe(false);
    expect(resolveMomentAuthor({ author: 'Redacted' })).toBe('Redacted');
  });

  it('filters display moments and authoritative digests separately', () => {
    const journal = miniJournal();
    expect(journalHasCoreyMoments(journal)).toBe(true);
    const all = journal.moments;
    expect(filterMomentsForPerspectiveDisplay(all, true)).toHaveLength(2);
    expect(filterMomentsForPerspectiveDisplay(all, false).map((m) => m.id)).toEqual(['mom_adam']);
    expect(authoritativeLiveMoments(journal).map((m) => m.id)).toEqual(['mom_adam']);
  });

  it('labels authorship in plain-text export', () => {
    const text = formatJournalPlainText(stripJournalForExport(miniJournal()));
    expect(text).toContain(Redacted_EXPORT_AUTHORSHIP_LABEL);
    expect(text).toContain(ADAM_EXPORT_AUTHORSHIP_LABEL);
    expect(text).toContain('Agent line');
    expect(formatAuthorshipExportLabel('Redacted')).toBe(Redacted_EXPORT_AUTHORSHIP_LABEL);
  });
});
