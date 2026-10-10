import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import {
  ADAM_EXPORT_AUTHORSHIP_LABEL,
  authoritativeLiveMoments,
  COREY_EXPORT_AUTHORSHIP_LABEL,
  filterMomentsForPerspectiveDisplay,
  formatAuthorshipExportLabel,
  isAuthoritativeUserMoment,
  journalHasCoreyMoments,
  parseMomentAuthor,
  resolveMomentAuthor,
} from '@/journal/corey-perspective';
import { formatJournalPlainText, stripJournalForExport } from '@/journal/export-bundle';

function miniJournal(): JournalDocument {
  return {
    id: 'jrn_corey',
    schema_version: 1,
    trip_id: 'trp_corey',
    title: 'Perspective trip',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences: {},
    operations: [],
    legs: [
      {
        id: 'leg_a',
        trip_id: 'trp_corey',
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
        id: 'mom_corey',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: [],
        display_order: 2,
        lifecycle: 'live',
        author: 'corey',
        text: 'Agent line',
      },
    ],
    media: [],
    transitions: [],
  };
}

describe('journal Corey perspective', () => {
  it('defaults missing author to adam and treats corey as non-authoritative', () => {
    expect(parseMomentAuthor(undefined)).toBe('adam');
    expect(parseMomentAuthor('corey')).toBe('corey');
    expect(isAuthoritativeUserMoment({ author: 'corey' })).toBe(false);
    expect(resolveMomentAuthor({ author: 'corey' })).toBe('corey');
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
    expect(text).toContain(COREY_EXPORT_AUTHORSHIP_LABEL);
    expect(text).toContain(ADAM_EXPORT_AUTHORSHIP_LABEL);
    expect(text).toContain('Agent line');
    expect(formatAuthorshipExportLabel('corey')).toBe(COREY_EXPORT_AUTHORSHIP_LABEL);
  });
});
