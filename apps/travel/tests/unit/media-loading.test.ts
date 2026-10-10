import { describe, expect, it } from 'vitest';
import type { JournalMedia } from '@/journal/types';
import {
  buildJournalImageSrcset,
  computeInitialMomentWindow,
  expandMomentWindowEarlier,
  expandMomentWindowLater,
  isFixtureMediaUrl,
  journalMediaDerivativeUrl,
  orderedLiveMoments,
  pickDerivativeWidth,
  visibleMomentIdSet,
} from '@/journal/media-loading';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

describe('media-loading', () => {
  it('builds derivative srcset for API media only', () => {
    const apiMedia: JournalMedia = {
      id: 'med_live',
      url: 'https://cdn.example/original.jpg',
      width: 4000,
      height: 3000,
      lifecycle: 'live',
    };
    expect(isFixtureMediaUrl(apiMedia.url)).toBe(false);
    const srcset = buildJournalImageSrcset('trp_x', apiMedia);
    expect(srcset).toContain('width=320');
    expect(srcset).toContain('width=960');
    expect(srcset).toContain('width=1600');
    expect(journalMediaDerivativeUrl('trp_x', 'med_live', 320)).toBe(
      '/api/travel-journal-media?trip=trp_x&id=med_live&variant=derivative&width=320',
    );
  });

  it('skips srcset for fixture data URLs', () => {
    const m = klIstanbulFixture().media[0]!;
    expect(isFixtureMediaUrl(m.url)).toBe(true);
    expect(buildJournalImageSrcset('trp_kl_ist_fixture', m)).toBeUndefined();
  });

  it('picks derivative width from rendered size × DPR', () => {
    expect(pickDerivativeWidth(150, 2)).toBe(320);
    expect(pickDerivativeWidth(400, 2)).toBe(960);
    expect(pickDerivativeWidth(800, 2)).toBe(1600);
  });

  it('paginates moments in windows of 30 with stable expansion', () => {
    const ordered = Array.from({ length: 75 }, (_, i) => ({
      id: `mom_${i}`,
      leg_id: 'leg',
      local_date: '2026-01-01',
      media_ids: [],
      display_order: i,
      lifecycle: 'live' as const,
    }));
    const focus = computeInitialMomentWindow(ordered.length, 40);
    expect(focus.end - focus.start).toBe(30);
    expect(visibleMomentIdSet(ordered, focus).has('mom_40')).toBe(true);
    const earlier = expandMomentWindowEarlier(focus);
    expect(earlier.start).toBe(0);
    expect(earlier.end).toBe(focus.end);
    const later = expandMomentWindowLater(focus, ordered.length);
    expect(later.end).toBe(Math.min(ordered.length, focus.end + 30));
  });

  it('orderedLiveMoments follows leg/day order in fixture', () => {
    const ids = orderedLiveMoments(klIstanbulFixture()).map((m) => m.id);
    expect(ids[0]).toBe('mom_kul_single');
    expect(ids.at(-1)).toBe('mom_ist_reflection');
  });
});
