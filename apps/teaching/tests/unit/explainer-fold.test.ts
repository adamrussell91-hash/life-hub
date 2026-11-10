import { describe, it, expect } from 'vitest';
import { nextPauseAfter, pauseTicks, pointerAt, POINTER_LINGER_S, sortEvents, stateAt, type ExplainerState } from '@/blocks/explainer/fold';
import { sampleExplainer } from '@/dev/explainer-sample';
import type { ExplainerEvent } from '@/schemas/block';

const ids = (s: ExplainerState) => ({ marks: s.marks.map((m) => m.id), notes: s.notes.map((n) => n.id), pointer: s.pointer, pauses: s.pauseIds });

/** Fold one event at a time, the way a player stepping through would. */
function playThrough(events: ExplainerEvent[], t: number): ExplainerState {
  let state = stateAt({ recording: { status: 'published', clips: [], duration_s: 40, events: [] } }, t);
  for (let i = 1; i <= events.length; i += 1) {
    state = stateAt({ recording: { status: 'published', clips: [], duration_s: 40, events: events.slice(0, i) } }, t);
  }
  return state;
}

describe('explainer state fold', () => {
  const content = sampleExplainer().content;
  const events = content.recording!.events;

  it('playing through to t equals jumping to t, at every tenth of a second', () => {
    for (let t = 0; t <= 40; t += 0.1) {
      expect(ids(playThrough(events, t))).toEqual(ids(stateAt(content, t)));
    }
  });

  it('nothing shows before the first event and everything stays at the end', () => {
    expect(ids(stateAt(content, 0))).toEqual({ marks: [], notes: [], pointer: null, pauses: [] });
    const end = stateAt(content, 40);
    expect(end.marks.map((m) => m.id)).toEqual(['ev_hl', 'ev_strike', 'ev_box', 'ev_br']);
    expect(end.notes.map((n) => n.id)).toEqual(['ev_note']);
    expect(end.pauseIds).toEqual(['ev_p1', 'ev_p2']);
    expect(end.pointer).toBeNull();
  });

  it('erase removes its target from that moment on', () => {
    expect(stateAt(content, 23.9).marks.map((m) => m.id)).toContain('ev_ul');
    expect(stateAt(content, 24).marks.map((m) => m.id)).not.toContain('ev_ul');
  });

  it('the pointer follows its samples and fades after the last', () => {
    const ptr = events.find((e) => e.kind === 'pointer')!;
    if (ptr.kind !== 'pointer') throw new Error('pointer');
    expect(pointerAt(ptr, 4.9)).toBeNull();
    expect(pointerAt(ptr, 5)).toEqual({ pane: 'text', word: ptr.samples[0]![1] });
    expect(pointerAt(ptr, 5.7)).toEqual({ pane: 'text', word: ptr.samples[1]![1] });
    expect(pointerAt(ptr, 5 + 2.2 + POINTER_LINGER_S - 0.01)).not.toBeNull();
    expect(pointerAt(ptr, 5 + 2.2 + POINTER_LINGER_S + 0.01)).toBeNull();
  });

  it('finds the next pause point and lists the ticks', () => {
    expect(nextPauseAfter(events, -0.001)?.id).toBe('ev_p1');
    expect(nextPauseAfter(events, 15)?.id).toBe('ev_p2');
    expect(nextPauseAfter(events, 35)).toBeNull();
    expect(pauseTicks(events)).toEqual([
      { id: 'ev_p1', t: 15, prompt: 'Which two techniques would you keep?' },
      { id: 'ev_p2', t: 35, prompt: 'Now say your own answer in one minute.' }
    ]);
  });

  it('sorts by time and keeps the order of equal times', () => {
    const sorted = sortEvents([
      { id: 'b', t: 2 },
      { id: 'a', t: 1 },
      { id: 'c', t: 2 }
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
