import { describe, it, expect } from 'vitest';
import { clipAt, mergeTranscripts, spliceRecording } from '@/blocks/explainer/clips';
import { sampleExplainer } from '@/dev/explainer-sample';
import type { ExplainerClip } from '@/schemas/block';

const clips: ExplainerClip[] = [
  { url: '/a.webm', mime: 'audio/webm', start_s: 0, duration_s: 22 },
  { url: '/b.webm', mime: 'audio/webm', start_s: 22, duration_s: 18 }
];

describe('explainer clips', () => {
  it('finds the clip and offset at a time', () => {
    expect(clipAt(clips, 0)).toEqual({ index: 0, offset: 0 });
    expect(clipAt(clips, 21.5)).toEqual({ index: 0, offset: 21.5 });
    expect(clipAt(clips, 22)).toEqual({ index: 1, offset: 0 });
    expect(clipAt(clips, 30)).toEqual({ index: 1, offset: 8 });
    expect(clipAt(clips, 99)).toEqual({ index: 1, offset: 18 });
    expect(clipAt([], 3)).toEqual({ index: -1, offset: 0 });
  });

  it('re-recording keeps clips and events before the point and replaces the rest', () => {
    const rec = sampleExplainer().content.recording!;
    const take = {
      clips: [{ url: '/new.webm', mime: 'audio/webm', start_s: 0, duration_s: 6 }],
      duration_s: 6,
      events: [{ id: 'new_mark', t: 1.5, kind: 'mark' as const, style: 'box' as const, anchor: rec.events[0]!.kind === 'mark' ? rec.events[0]!.anchor : (null as never) }],
      transcript: { timing: 'word' as const, words: [{ w: 'again', start: 0.5, end: 0.9 }] }
    };
    const out = spliceRecording(rec, 18, take);
    expect(out.status).toBe('draft');
    expect(out.duration_s).toBe(24);
    expect(out.clips).toEqual([
      { ...rec.clips[0]!, duration_s: 18 },
      { url: '/new.webm', mime: 'audio/webm', start_s: 18, duration_s: 6 }
    ]);
    expect(out.events.map((e) => e.id)).toEqual(['ev_hl', 'ev_ptr', 'ev_note', 'ev_ul', 'ev_p1', 'new_mark']);
    expect(out.events.at(-1)!.t).toBe(19.5);
    expect(out.transcript!.words.every((w) => w.end <= 18 || w.start >= 18)).toBe(true);
    expect(out.transcript!.words.at(-1)).toEqual({ w: 'again', start: 18.5, end: 18.9 });
  });

  it('a cut on a clip boundary drops the later clip whole', () => {
    const rec = { ...sampleExplainer().content.recording!, clips };
    const out = spliceRecording(rec, 22, { clips: [], duration_s: 0, events: [] });
    expect(out.clips).toEqual([clips[0]]);
    expect(out.duration_s).toBe(22);
  });

  it('pointer samples past the cut are trimmed', () => {
    const rec = sampleExplainer().content.recording!;
    const out = spliceRecording(rec, 6, { clips: [], duration_s: 1, events: [] });
    const ptr = out.events.find((e) => e.kind === 'pointer');
    expect(ptr && ptr.kind === 'pointer' ? ptr.samples.length : 0).toBe(2);
  });

  it('merges per-clip transcripts onto the timeline, keeping the roughest timing', () => {
    const merged = mergeTranscripts([
      { start_s: 0, transcript: { timing: 'word', words: [{ w: 'one', start: 0, end: 0.4 }] } },
      { start_s: 10, transcript: null },
      { start_s: 22, transcript: { timing: 'segment', words: [{ w: 'two', start: 1, end: 1.5 }] } }
    ]);
    expect(merged).toEqual({ timing: 'segment', words: [{ w: 'one', start: 0, end: 0.4 }, { w: 'two', start: 23, end: 23.5 }] });
    expect(mergeTranscripts([]).timing).toBe('estimated');
  });
});
