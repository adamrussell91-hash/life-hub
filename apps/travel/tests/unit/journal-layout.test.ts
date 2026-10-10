import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

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
});
