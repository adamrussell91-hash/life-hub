/**
 * Audio clips on the recording's timeline. Pause/resume while recording and
 * re-recording from a point both produce a clip list; the player chains them.
 * Pure: no DOM.
 */
import { partialStroke } from './fold';
import { EXPLAINER_MAX_SECONDS, type ExplainerClip, type ExplainerEvent, type ExplainerRecording, type ExplainerTranscript } from '@/schemas/block';

/** The clip playing at t and how far into it. Past the end: the last clip at its end. Empty list: index -1. */
export function clipAt(clips: readonly ExplainerClip[], t: number): { index: number; offset: number } {
  if (clips.length === 0) return { index: -1, offset: 0 };
  for (let i = 0; i < clips.length; i += 1) {
    const c = clips[i]!;
    if (t < c.start_s + c.duration_s) return { index: i, offset: Math.max(0, t - c.start_s) };
  }
  const last = clips.length - 1;
  return { index: last, offset: clips[last]!.duration_s };
}

/** A new take, on its own timeline from 0. */
export type ExplainerTake = {
  clips: ExplainerClip[];
  duration_s: number;
  events: ExplainerEvent[];
  transcript?: ExplainerTranscript;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

function shiftEvent(ev: ExplainerEvent, by: number): ExplainerEvent {
  return { ...ev, t: round(ev.t + by) };
}

/** Pointer samples and stroke points past t0 belong to the replaced part. */
function trimEvent(ev: ExplainerEvent, t0: number): ExplainerEvent | null {
  const keep = t0 - ev.t;
  if (ev.kind === 'pointer') return { ...ev, samples: ev.samples.filter((s) => s[0] <= keep) };
  if (ev.kind === 'stroke') {
    const element = partialStroke(ev.element, ev.offsets, keep);
    if (!element) return null;
    const n = ((element as { points?: unknown[] }).points ?? []).length;
    return { ...ev, element, offsets: ev.offsets.slice(0, n || ev.offsets.length) };
  }
  return ev;
}

const TIMING_RANK = { word: 0, segment: 1, estimated: 2 } as const;

/** Join per-clip transcripts onto the recording timeline. The roughest timing wins. */
export function mergeTranscripts(
  perClip: ReadonlyArray<{ start_s: number; transcript?: ExplainerTranscript | null }>
): ExplainerTranscript {
  const words: ExplainerTranscript['words'] = [];
  let timing: ExplainerTranscript['timing'] = 'word';
  let any = false;
  for (const part of perClip) {
    if (!part.transcript) continue;
    any = true;
    if (TIMING_RANK[part.transcript.timing] > TIMING_RANK[timing]) timing = part.transcript.timing;
    for (const w of part.transcript.words) words.push({ w: w.w, start: round(w.start + part.start_s), end: round(w.end + part.start_s) });
  }
  return { words, timing: any ? timing : 'estimated' };
}

/**
 * Re-record from t0: everything before t0 stays, the clip spanning t0 is
 * shortened, the take's clips and events follow from t0, and later events go.
 */
export function spliceRecording(rec: ExplainerRecording, t0: number, take: ExplainerTake): ExplainerRecording {
  const at = Math.max(0, Math.min(t0, rec.duration_s));
  const clips: ExplainerClip[] = [];
  for (const c of rec.clips) {
    if (c.start_s >= at) continue;
    const end = c.start_s + c.duration_s;
    clips.push(end <= at ? c : { ...c, duration_s: round(at - c.start_s) });
  }
  for (const c of take.clips) clips.push({ ...c, start_s: round(c.start_s + at) });
  const events = [
    ...rec.events.filter((ev) => ev.t <= at).map((ev) => trimEvent(ev, at)).filter((ev): ev is ExplainerEvent => ev !== null),
    ...take.events.map((ev) => shiftEvent(ev, at))
  ];
  const duration_s = Math.min(EXPLAINER_MAX_SECONDS, round(at + take.duration_s));
  const before = rec.transcript?.words.filter((w) => w.end <= at) ?? [];
  const after = take.transcript?.words.map((w) => ({ w: w.w, start: round(w.start + at), end: round(w.end + at) })) ?? [];
  const transcript =
    rec.transcript || take.transcript
      ? {
          words: [...before, ...after],
          timing: mergeTranscripts([
            { start_s: 0, transcript: rec.transcript },
            { start_s: at, transcript: take.transcript }
          ]).timing
        }
      : undefined;
  return {
    status: 'draft',
    clips,
    duration_s,
    events: events.filter((ev) => ev.t <= duration_s),
    ...(transcript ? { transcript } : {})
  };
}
