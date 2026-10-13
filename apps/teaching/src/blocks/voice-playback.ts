/**
 * Pure playback helpers for published voice clips. No DOM.
 */
import type { SegmentClip } from '@/blocks/voice-segment';

export type PlaybackClip = Pick<SegmentClip, 'id' | 'start_s' | 'end_s'>;

/**
 * Return the clip active at media time `t` via binary search.
 * Clips must be sorted by start_s and cover without overlap.
 * Returns null when t is outside all ranges (or clips empty).
 */
export function activeClipAt(clips: readonly PlaybackClip[], t: number): PlaybackClip | null {
  if (!clips.length || !Number.isFinite(t)) return null;
  const time = Math.max(0, t);

  let lo = 0;
  let hi = clips.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const clip = clips[mid]!;
    if (time < clip.start_s) {
      hi = mid - 1;
      continue;
    }
    if (time >= clip.end_s && mid < clips.length - 1) {
      lo = mid + 1;
      continue;
    }
    if (time >= clip.start_s && (time < clip.end_s || mid === clips.length - 1)) {
      return clip;
    }
    if (time >= clip.end_s) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
