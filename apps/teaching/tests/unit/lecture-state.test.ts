// apps/teaching/tests/unit/lecture-state.test.ts
import { describe, it, expect } from 'vitest';
import type { Block } from '@/schemas/block';
import { lectureScenes } from '@/lecture/scenes';
import { act, answer, goTo, mainAction, restoreState, startState } from '@/lecture/state';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}) =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as unknown as Block;
const heading = (id: string, extra: Record<string, unknown> = {}) => b(id, 'heading', { text: id, ...extra });
const text = (id: string) => b(id, 'rich_text', { html: id });

const scenes = lectureScenes([
  heading('h1'), text('t1'), text('t2'),
  heading('h2'), b('q1', 'hinge_question', { prompt: 'p', options: [] }), b('p1', 'section', { title: 'again', blocks: [text('x')], side_path: true }), b('n1', 'note_cue', { kind: 'copy', prompt: 'w' }),
  heading('h3', { reveal: 'all' }), text('t3')
]);

describe('lecture state', () => {
  it('shows the first beat and offers Reveal with a count', () => {
    const s = startState(scenes);
    expect(s).toMatchObject({ scene: 0, shown: 1, reached: ['h1'] });
    expect(mainAction(s, scenes)).toEqual({ kind: 'reveal', label: 'Reveal · 2 of 2' });
  });

  it('moves to Next scene once everything is showing', () => {
    const s = act(startState(scenes), scenes, mainAction(startState(scenes), scenes));
    expect(s.shown).toBe(2);
    expect(mainAction(s, scenes)).toEqual({ kind: 'next', label: 'Next scene →' });
  });

  it('waits at a gate, then detours on a wrong answer, then returns', () => {
    let s = goTo(startState(scenes), scenes, 1);
    expect(mainAction(s, scenes)).toEqual({ kind: 'wait', label: 'Answer to continue' });
    s = answer(s, 'q1', 'wrong');
    expect(s.missed).toEqual(['q1']);
    expect(mainAction(s, scenes)).toEqual({ kind: 'detour', label: 'Let’s look again →', gateId: 'q1' });
    s = act(s, scenes, mainAction(s, scenes));
    expect(s.detour).toBe('q1');
    expect(mainAction(s, scenes)).toEqual({ kind: 'return', label: 'Back to the lecture →' });
    s = act(s, scenes, mainAction(s, scenes));
    expect(s.detour).toBeNull();
    expect(mainAction(s, scenes)).toEqual({ kind: 'reveal', label: 'Reveal · 2 of 2' });
  });

  it('carries on straight away after a right answer', () => {
    const s = answer(goTo(startState(scenes), scenes, 1), 'q1', 'right');
    expect(s.missed).toEqual([]);
    expect(mainAction(s, scenes).kind).toBe('reveal');
  });

  it('stops on a note cue until it is ticked', () => {
    let s = answer(goTo(startState(scenes), scenes, 1), 'q1', 'right');
    s = act(s, scenes, mainAction(s, scenes));
    expect(mainAction(s, scenes)).toEqual({ kind: 'tick', label: 'Done · I wrote it', noteId: 'n1' });
    s = act(s, scenes, mainAction(s, scenes));
    expect(s.ticked).toEqual(['n1']);
    expect(mainAction(s, scenes).kind).toBe('next');
  });

  it('shows everything at once in a Show all scene and ends on the recap', () => {
    const s = goTo(startState(scenes), scenes, 2);
    expect(s.shown).toBe(1);
    expect(mainAction(s, scenes)).toEqual({ kind: 'finish', label: 'See your recap →' });
    // Reaching the recap is not finishing; only the recap's Finish button sets it.
    expect(act(s, scenes, mainAction(s, scenes)).finished).toBe(false);
  });

  it('goes straight on to the next scene after a side path when the gate was the last beat', () => {
    const last = lectureScenes([
      heading('g1'), text('a'), b('q2', 'cloze', { text: 'x' }), b('p2', 'section', { title: 'again', blocks: [text('y')], side_path: true }),
      heading('g2'), text('c')
    ]);
    let s = startState(last);
    s = act(s, last, mainAction(s, last));
    s = answer(s, 'q2', 'wrong');
    s = act(s, last, mainAction(s, last));
    expect(s.detour).toBe('q2');
    s = act(s, last, mainAction(s, last));
    expect(s.detour).toBeNull();
    expect(s.scene).toBe(1);
    expect(s.reached).toEqual(['g1', 'g2']);
  });

  it('counts a replay when going back to a scene already reached', () => {
    let s = goTo(startState(scenes), scenes, 1);
    s = goTo(s, scenes, 0);
    expect(s.replays).toEqual({ h1: 1 });
    expect(s.shown).toBe(1);
  });

  it('restores a saved state and clamps it to the current scenes', () => {
    const saved = JSON.parse(JSON.stringify({ ...goTo(startState(scenes), scenes, 2), scene: 9 }));
    const s = restoreState(saved, scenes);
    expect(s.scene).toBe(2);
    expect(restoreState({ nonsense: true }, scenes)).toEqual(startState(scenes));
  });

  it('keeps a scene as far as it got when going back and forward past a gate', () => {
    const gated = lectureScenes([heading('h1'), text('t1'), heading('h2'), b('q1', 'hinge_question', { prompt: 'p', options: [] }), text('t2')]);
    let s = goTo(startState(gated), gated, 1);
    s = goTo(s, gated, 0);
    s = goTo(s, gated, 1);
    expect(s.shown).toBe(1);
    expect(mainAction(s, gated).kind).toBe('wait');
  });

  it('counts a replay only when going back, not forward', () => {
    const s = goTo(goTo(startState(scenes), scenes, 1), scenes, 0);
    expect(s.replays).toEqual({ h1: 1 });
    expect(goTo(s, scenes, 1).replays).toEqual({ h1: 1 });
  });

  it('survives a non-finite shown', () => {
    const s = restoreState({ ...startState(scenes), shown: null, shownBy: { h1: 'x' } }, scenes);
    expect(s.shown).toBe(1);
    expect(s.shownBy).toEqual({ h1: 1 });
  });

  it('restores a detour only when the gate has a side path', () => {
    let s = answer(goTo(startState(scenes), scenes, 1), 'q1', 'wrong');
    s = act(s, scenes, mainAction(s, scenes));
    const saved = JSON.parse(JSON.stringify(s));
    expect(restoreState(saved, scenes).detour).toBe('q1');
    expect(restoreState({ ...saved, detour: 'nope' }, scenes).detour).toBeNull();
  });
});
