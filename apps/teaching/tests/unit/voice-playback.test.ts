import { describe, expect, it } from 'vitest';
import { activeClipAt } from '@/blocks/voice-playback';

const clips = [
  { id: 'clip_1', start_s: 0, end_s: 2 },
  { id: 'clip_2', start_s: 2, end_s: 5 },
  { id: 'clip_3', start_s: 5, end_s: 9 }
];

describe('activeClipAt', () => {
  it('returns null for empty clips or negative/NaN time', () => {
    expect(activeClipAt([], 1)).toBeNull();
    expect(activeClipAt(clips, Number.NaN)).toBeNull();
  });

  it('finds the first clip at t=0', () => {
    expect(activeClipAt(clips, 0)?.id).toBe('clip_1');
  });

  it('finds interior boundaries with binary search', () => {
    expect(activeClipAt(clips, 1.9)?.id).toBe('clip_1');
    expect(activeClipAt(clips, 2)?.id).toBe('clip_2');
    expect(activeClipAt(clips, 4.99)?.id).toBe('clip_2');
    expect(activeClipAt(clips, 5)?.id).toBe('clip_3');
  });

  it('includes the final end on the last clip', () => {
    expect(activeClipAt(clips, 9)?.id).toBe('clip_3');
  });

  it('clamps negative times to the first clip when coverage starts at 0', () => {
    expect(activeClipAt(clips, -1)?.id).toBe('clip_1');
  });
});
