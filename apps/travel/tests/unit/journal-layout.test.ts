import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import {
  photoLayout,
  shouldShowDayMapPreview,
  storyColumnMaxRem,
  truncateReflectionLines,
} from '@/journal/layout';

describe('journal layout helpers', () => {
  it('maps photo counts to Codex layouts', () => {
    expect(photoLayout(1)).toBe('single');
    expect(photoLayout(2)).toBe('pair');
    expect(photoLayout(3)).toBe('lead-pair');
    expect(photoLayout(4)).toBe('lead-pair-more');
    expect(photoLayout(5)).toBe('lead-pair-more');
  });

  it('shows map preview only when a located moment exists', () => {
    expect(shouldShowDayMapPreview([])).toBe(false);
    expect(shouldShowDayMapPreview([{ coordinates: undefined }])).toBe(false);
    expect(shouldShowDayMapPreview([{ coordinates: { lat: 41.0, lon: 28.9 } }])).toBe(true);
  });

  it('fixes story column max width at 48rem', () => {
    expect(storyColumnMaxRem()).toBe(48);
  });

  it('truncates reflection text after maxLines with remainder', () => {
    const lines = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n');
    const { preview, remainder } = truncateReflectionLines(lines, 6);
    expect(preview).toBe(['a', 'b', 'c', 'd', 'e', 'f'].join('\n'));
    expect(remainder).toBe(['g', 'h'].join('\n'));
  });

  it('returns null remainder when within maxLines', () => {
    const text = 'one\n two';
    const { preview, remainder } = truncateReflectionLines(text, 6);
    expect(preview).toBe(text);
    expect(remainder).toBeNull();
  });
});

describe('klIstanbulFixture', () => {
  it('has two legs with distinct pattern ids and one transition', () => {
    const j = klIstanbulFixture();
    expect(j.legs).toHaveLength(2);
    expect(j.legs[0]?.pattern_id).toBe('kul');
    expect(j.legs[1]?.pattern_id).toBe('ist');
    expect(j.transitions).toHaveLength(1);
    expect(j.moments.some((m) => m.media_ids.length === 0 && m.text)).toBe(true);
    expect(j.moments.some((m) => m.media_ids.length >= 4)).toBe(true);
    expect(j.moments.some((m) => (m.place?.name.length ?? 0) > 40)).toBe(true);
  });

  it('empty_marker days have zero moments on that local_date', () => {
    const j = klIstanbulFixture();
    const emptyDays = j.days.filter((d) => d.empty_marker);
    expect(emptyDays.length).toBeGreaterThan(0);
    for (const day of emptyDays) {
      const onDate = j.moments.filter((m) => m.local_date === day.local_date);
      expect(onDate).toHaveLength(0);
    }
  });
});
