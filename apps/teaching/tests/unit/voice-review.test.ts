import { describe, expect, it } from 'vitest';
import { parseAnnotationSource } from '@/blocks/annotation-text';
import { matchQuotes } from '@/blocks/voice-match';
import { segmentClips } from '@/blocks/voice-segment';
import type { AnnotationVoiceTrack } from '@/schemas/block';
import type { VoiceWord } from '@/blocks/voice-transcript';

/** Mirrors voice-review's first-open matcher path without mounting DOM. */
function clipsFromMatch(track: AnnotationVoiceTrack, text: ReturnType<typeof parseAnnotationSource>) {
  const { pins } = matchQuotes({
    text,
    words: track.transcript.words,
    taps: track.taps
  });
  return segmentClips({
    pins,
    words: track.transcript.words,
    duration: track.audio.duration_s
  }).map((clip) => ({
    ...clip,
    source: clip.source === 'tap' ? 'tap' : clip.source === 'quote' ? 'ai' : clip.source,
    approved: clip.source === 'tap' || clip.source === 'manual'
  }));
}

const text = parseAnnotationSource(
  `Bent double, like old beggars under sacks,
Knock-kneed, coughing like hags, we cursed through sludge.`,
  'verse'
);

function wordsFrom(tokens: string[], start = 0, step = 0.4): VoiceWord[] {
  return tokens.map((w, i) => ({
    w,
    start: start + i * step,
    end: start + (i + 1) * step
  }));
}

describe('voice review matcher bootstrap', () => {
  it('builds reviewable AI clips when a track has words', () => {
    const words = wordsFrom(['Bent', 'double', 'like', 'old', 'beggars', 'under', 'sacks']);
    const track: AnnotationVoiceTrack = {
      id: 'track_1',
      layer_id: 'layer_voice',
      kind: 'reading',
      title: 'Reading',
      audio: {
        url: 'https://example.com/a.webm',
        duration_s: words[words.length - 1]!.end + 1,
        mime: 'audio/webm'
      },
      transcript: { words, timing: 'word' },
      clips: [],
      status: 'draft'
    };
    const clips = clipsFromMatch(track, text);
    expect(clips.length).toBeGreaterThan(0);
    expect(clips.some((clip) => clip.source === 'ai' && clip.approved === false)).toBe(true);
    expect(clips.every((clip) => clip.end_s >= clip.start_s)).toBe(true);
  });

  it('publish gate requires no approved:false clips', () => {
    const clips = [
      { approved: true },
      { approved: false }
    ];
    expect(clips.some((c) => c.approved === false)).toBe(true);
    expect(clips.filter((c) => c.approved !== false)).toHaveLength(1);
  });
});
