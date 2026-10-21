/**
 * Pure playback helpers for published voice clips. No DOM.
 */
import type { SegmentClip } from '@/blocks/voice-segment';
import type { AnnotationAnchor, AnnotationVoiceTrack } from '@/schemas/block';

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

/**
 * A voice note recorded onto one selection: the whole take is one approved clip
 * pinned there, published straight away. No cutting or review step.
 */
export function pinnedVoiceTrack(
  track: AnnotationVoiceTrack,
  anchor: AnnotationAnchor
): AnnotationVoiceTrack {
  const words = track.transcript.words;
  return {
    ...track,
    clips: [
      {
        id: 'clip_1',
        start_s: 0,
        end_s: track.audio.duration_s,
        word_range: [0, words.length],
        anchor: { ...anchor, quote: { ...anchor.quote } },
        source: 'manual',
        confidence: 1,
        approved: true,
        transcript_text: words.map((word) => word.w).join(' ')
      }
    ],
    status: 'published'
  };
}
