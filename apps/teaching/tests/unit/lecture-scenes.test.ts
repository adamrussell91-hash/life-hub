// apps/teaching/tests/unit/lecture-scenes.test.ts
import { describe, it, expect } from 'vitest';
import type { Block } from '@/schemas/block';
import { lectureScenes, isGate, DEFAULT_TAKEAWAY } from '@/lecture/scenes';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}, variant = 'medium') =>
  ({ id, type: 'block', block_type, variant, visibility: 'student_teacher', content }) as unknown as Block;
const text = (id: string) => b(id, 'rich_text', { html: `<p>${id}</p>` });
const heading = (id: string, extra: Record<string, unknown> = {}) => b(id, 'heading', { text: `Heading ${id}`, ...extra }, 'section');
const section = (id: string, blocks: Block[], extra: Record<string, unknown> = {}) => b(id, 'section', { title: `Chapter ${id}`, blocks, ...extra });
const ids = (scene: { beats: Array<{ block: Block }> }) => scene.beats.map((x) => x.block.id);

describe('lectureScenes', () => {
  it('starts a scene at each heading and keeps the blocks after it', () => {
    const scenes = lectureScenes([heading('h1'), text('t1'), b('i1', 'image', { url: 'x' }), heading('h2'), text('t2')]);
    expect(scenes.map((s) => s.id)).toEqual(['h1', 'h2']);
    expect(ids(scenes[0]!)).toEqual(['t1', 'i1']);
    expect(scenes[0]!.label).toBe('Heading h1');
    expect(scenes[0]!.reveal).toBe('one');
  });

  it('puts blocks before the first heading in an opening scene', () => {
    const scenes = lectureScenes([text('t0'), heading('h1')]);
    expect(scenes[0]).toMatchObject({ id: 't0', label: 'Opening', heading: null });
  });

  it('keeps a column row as one beat', () => {
    const cols = b('c1', 'columns', { columns: [{ id: 'a', blocks: [text('x')] }, { id: 'b', blocks: [text('y')] }] });
    expect(ids(lectureScenes([heading('h1'), cols])[0]!)).toEqual(['c1']);
  });

  it('makes a section a chapter, with an intro scene when it has narration', () => {
    const narration = { url: 'u', duration_s: 10 };
    const scenes = lectureScenes([section('s1', [heading('h1'), text('t1')], { narration })]);
    expect(scenes.map((s) => s.id)).toEqual(['s1', 'h1']);
    expect(scenes[0]).toMatchObject({ intro: true, narration, chapter: { id: 's1', label: 'Chapter s1' } });
    expect(scenes[1]!.chapter?.id).toBe('s1');
  });

  it('skips the intro when a silent section starts with a heading', () => {
    expect(lectureScenes([section('s1', [heading('h1')])]).map((s) => s.id)).toEqual(['h1']);
  });

  it('ends a chapter with a takeaway cue unless switched off', () => {
    const on = lectureScenes([section('s1', [heading('h1'), text('t1')])]);
    const cue = on.at(-1)!.beats.at(-1)!.block;
    expect(cue).toMatchObject({ id: 's1__takeaway', block_type: 'note_cue', content: { kind: 'own_words', prompt: DEFAULT_TAKEAWAY('Chapter s1') } });
    const off = lectureScenes([section('s1', [heading('h1'), text('t1')], { takeaway: { enabled: false } })]);
    expect(ids(off.at(-1)!)).toEqual(['t1']);
  });

  it('uses the teacher’s takeaway wording', () => {
    const scenes = lectureScenes([section('s1', [text('t1')], { takeaway: { enabled: true, prompt: 'Your best line' } })]);
    expect(scenes[0]!.beats.at(-1)!.block).toMatchObject({ content: { prompt: 'Your best line' } });
  });

  it('marks gates and attaches the side path that follows a hinge or cloze', () => {
    const hinge = b('q1', 'hinge_question', { prompt: 'p', options: [] });
    const path = section('p1', [text('again')], { side_path: true });
    const scenes = lectureScenes([heading('h1'), hinge, path, text('after')]);
    expect(scenes).toHaveLength(1);
    expect(ids(scenes[0]!)).toEqual(['q1', 'after']);
    expect(scenes[0]!.beats[0]).toMatchObject({ gate: true, sidePath: { id: 'p1' } });
  });

  it('gives self-check no side path and respects gate: false', () => {
    const check = b('k1', 'self_check', { mode: 'reveal', prompt: 'p' });
    const off = b('k2', 'self_check', { mode: 'reveal', prompt: 'p', gate: false });
    const path = section('p1', [text('x')], { side_path: true });
    const [scene] = lectureScenes([heading('h1'), check, path, off]);
    expect(scene!.beats.map((x) => [x.block.id, x.gate, x.sidePath?.id ?? null])).toEqual([['k1', true, null], ['k2', false, null]]);
    expect(isGate(off)).toBe(false);
  });

  it('leaves out spacers, dividers and teacher notes', () => {
    const [scene] = lectureScenes([heading('h1'), b('sp', 'spacer'), b('d', 'divider'), b('tn', 'teacher_note', { html: '' }), text('t1')]);
    expect(ids(scene!)).toEqual(['t1']);
  });

  it('reads narration and reveal from the heading', () => {
    const [scene] = lectureScenes([heading('h1', { narration: { url: 'u', duration_s: 5 }, reveal: 'all' })]);
    expect(scene).toMatchObject({ narration: { url: 'u', duration_s: 5 }, reveal: 'all' });
  });

  it('attaches a side path that sits inside a chapter after its gate', () => {
    const hinge = b('q1', 'hinge_question', { prompt: 'p', options: [] });
    const path = section('p1', [text('again')], { side_path: true });
    const scenes = lectureScenes([section('s1', [heading('h1'), hinge, path, text('after')], { takeaway: { enabled: false } })]);
    expect(scenes.map((s) => s.id)).toEqual(['h1']);
    expect(ids(scenes[0]!)).toEqual(['q1', 'after']);
    expect(scenes[0]!.beats[0]).toMatchObject({ gate: true, sidePath: { id: 'p1' } });
  });

  it('makes no intro scene when only skipped blocks come before the first heading', () => {
    const scenes = lectureScenes([section('s1', [b('tn', 'teacher_note', { html: '' }), heading('h1'), text('t1')])]);
    expect(scenes.map((s) => s.id)).toEqual(['h1']);
  });

  it('numbers untitled chapters by chapter, not by scene', () => {
    const scenes = lectureScenes([heading('h1'), heading('h2'), section('s1', [heading('h3')], { title: '' })]);
    expect(scenes.at(-1)!.chapter?.label).toBe('Chapter 1');
  });
});
