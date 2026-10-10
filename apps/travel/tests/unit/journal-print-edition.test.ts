import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import {
  JOURNAL_PRINT_CSS,
  buildJournalPrintHtml,
  journalPrintEditionHasNoExternalNetwork,
  journalPrintImageSrc,
} from '@/journal/print-edition';

describe('journal print edition', () => {
  it('builds A4 print HTML with leg/day sections for the 2-leg fixture', () => {
    const html = buildJournalPrintHtml(klIstanbulFixture(), {
      tripId: klIstanbulFixture().trip_id,
    });
    expect(html).toContain('@page');
    expect(html).toContain(JOURNAL_PRINT_CSS.trim().slice(0, 20));
    expect(html.match(/data-journal-print-leg=/g)?.length).toBe(2);
    expect(html.match(/data-journal-print-day=/g)?.length).toBeGreaterThanOrEqual(3);
    expect(journalPrintEditionHasNoExternalNetwork(html)).toBe(true);
    expect(html).toContain('system-ui');
    expect(html).not.toMatch(/fonts\.googleapis/i);
  });

  it('uses derivative URLs for live API media', () => {
    const fixture = klIstanbulFixture();
    const journal: JournalDocument = {
      ...fixture,
      leg_ids: fixture.legs.map((l) => l.id),
      preferences: {},
      operations: [],
      media: [
        {
          id: 'med_api',
          url: '/api/travel-journal-media?trip=x&id=med_api',
          width: 1200,
          height: 800,
          lifecycle: 'live',
        },
      ],
      moments: [
        {
          id: 'mom_api',
          leg_id: 'leg_kul',
          local_date: '2026-03-01',
          media_ids: ['med_api'],
          display_order: 1,
          lifecycle: 'live',
        },
      ],
    };
    const src = journalPrintImageSrc(journal.trip_id, journal.media[0]!);
    expect(src).toContain('variant=derivative');
    expect(src).toContain('width=960');
    const html = buildJournalPrintHtml(journal, { tripId: journal.trip_id });
    expect(html).toContain('variant=derivative');
    expect(html).toContain('width=960');
    expect(html).toContain('med_api');
  });
});
