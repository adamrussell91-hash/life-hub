import { describe, expect, it } from 'vitest';
import { guideTimelinePoints, latestPerContext, renderMotivationStrip } from '@/components/motivation-strip';
import type { PlacedRun } from '@/guides/runs';

const placed = (id: string, context: string, at: string, meetingId = 'm1'): PlacedRun => ({
  meetingId, meetingTitle: 'Check-in',
  run: { id, guide: 'motivation_sdt', person_ref: 'shared:person:p', person_name: 'Jonah Pereira', context, taps: {}, quotes: [], checks: {},
    values: { external: 3, introjected: 7, identified: 5 }, profile: 'control', moves: [], created_at: at, updated_at: at }
});

const list = [
  placed('a', 'English · essays', '2026-10-27T00:00:00.000Z', 'm9'),
  placed('b', 'english · essays', '2026-08-04T00:00:00.000Z'),
  placed('c', 'Debating', '2026-08-12T00:00:00.000Z')
];

describe('motivation strip', () => {
  it('keeps the latest run per context and counts the rest', () => {
    expect(latestPerContext(list).map((e) => [e.latest.run.id, e.count])).toEqual([['a', 2], ['c', 1]]);
  });

  it('draws a mini card per context that links to its meeting', () => {
    const host = document.createElement('div');
    renderMotivationStrip(host, list);
    const cards = host.querySelectorAll<HTMLAnchorElement>('a.guide-mini');
    expect(cards.length).toBe(2);
    expect(cards[0]!.getAttribute('href')).toBe('#/meeting/m9');
    expect(cards[0]!.textContent).toContain('27 Oct · 2 runs');
    expect(cards[0]!.querySelectorAll('.guide-mini__bar').length).toBe(6);
  });

  it('gives the timeline one point per run', () => {
    expect(guideTimelinePoints(list).map((p) => p.label)).toEqual([
      '◐ Motivation guide · English · essays', '◐ Motivation guide · english · essays', '◐ Motivation guide · Debating'
    ]);
  });
});
