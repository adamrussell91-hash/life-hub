import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import {
  ADAM_EXPORT_AUTHORSHIP_LABEL,
  authoritativeLiveMoments,
  PARTNER_EXPORT_AUTHORSHIP_LABEL,
  filterMomentsForPerspectiveDisplay,
  formatAuthorshipExportLabel,
  isAuthoritativeUserMoment,
  journalHasPartnerMoments,
  parseMomentAuthor,
  resolveMomentAuthor,
} from '@/journal/partner-perspective';
import { formatJournalPlainText, stripJournalForExport } from '@/journal/export-bundle';

function miniJournal(): JournalDocument {
  return {
    id: 'jrn_partner',
    schema_version: 1,
    trip_id: 'trp_partner',
    title: 'Perspective trip',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences: {},
    operations: [],
    legs: [
      {
        id: 'leg_a',
        trip_id: 'trp_partner',
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
        id: 'mom_partner',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: [],
        display_order: 2,
        lifecycle: 'live',
        author: 'partner',
        text: 'Agent line',
      },
    ],
    media: [],
    transitions: [],
  };
}

describe('journal Partner perspective', () => {
  it('defaults missing author to adam and treats partner as non-authoritative', () => {
    expect(parseMomentAuthor(undefined)).toBe('adam');
    expect(parseMomentAuthor('partner')).toBe('partner');
    expect(parseMomentAuthor('adam')).toBe('adam');
    // Ids saved before the rename are someone else's perspective, never Adam's words.
    expect(parseMomentAuthor('legacy-name')).toBe('partner');
    expect(isAuthoritativeUserMoment({ author: 'partner' })).toBe(false);
    expect(resolveMomentAuthor({ author: 'partner' })).toBe('partner');
  });

  it('filters display moments and authoritative digests separately', () => {
    const journal = miniJournal();
    expect(journalHasPartnerMoments(journal)).toBe(true);
    const all = journal.moments;
    expect(filterMomentsForPerspectiveDisplay(all, true)).toHaveLength(2);
    expect(filterMomentsForPerspectiveDisplay(all, false).map((m) => m.id)).toEqual(['mom_adam']);
    expect(authoritativeLiveMoments(journal).map((m) => m.id)).toEqual(['mom_adam']);
  });

  it('labels authorship in plain-text export', () => {
    const text = formatJournalPlainText(stripJournalForExport(miniJournal()));
    expect(text).toContain(PARTNER_EXPORT_AUTHORSHIP_LABEL);
    expect(text).toContain(ADAM_EXPORT_AUTHORSHIP_LABEL);
    expect(text).toContain('Agent line');
    expect(formatAuthorshipExportLabel('partner')).toBe(PARTNER_EXPORT_AUTHORSHIP_LABEL);
  });
});
