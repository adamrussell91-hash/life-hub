// apps/teaching/tests/unit/lecture-schema.test.ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { PublishedLessonSchema } from '@/schemas/published-lesson';
import { createHeadingEditor } from '@/blocks/editors';

const base = { type: 'block', visibility: 'student_teacher', variant: 'medium', created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z', schema_version: 1 } as const;
const narration = { url: '/api/media/m1/file', duration_s: 42, transcript: 'Today we look at tone.' };

describe('lecture schema fields', () => {
  it('keeps narration and reveal on a heading', () => {
    const parsed = BlockSchema.parse({ ...base, id: 'h1', block_type: 'heading', variant: 'section', content: { text: 'Tone', narration, reveal: 'all' } });
    expect(parsed.block_type === 'heading' && parsed.content).toEqual({ text: 'Tone', narration, reveal: 'all' });
  });

  it('keeps narration, takeaway and side_path on a section', () => {
    const parsed = BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'Imagery', blocks: [], narration, takeaway: { enabled: false, prompt: 'One line' }, side_path: true } });
    expect(parsed.block_type === 'section' && parsed.content).toMatchObject({ narration, takeaway: { enabled: false, prompt: 'One line' }, side_path: true });
  });

  it('keeps the gate switch on hinge, cloze and self-check', () => {
    const cloze = BlockSchema.parse({ ...base, id: 'c1', block_type: 'cloze', content: { text: 'A [[b]] c', gate: false } });
    expect(cloze.block_type === 'cloze' && cloze.content.gate).toBe(false);
    const check = BlockSchema.parse({ ...base, id: 'k1', block_type: 'self_check', content: { mode: 'reveal', prompt: 'Why?', gate: true } });
    expect(check.block_type === 'self_check' && check.content.gate).toBe(true);
  });

  it('parses a note cue and rejects an unknown kind', () => {
    const cue = BlockSchema.parse({ ...base, id: 'n1', block_type: 'note_cue', content: { kind: 'copy', prompt: 'Write: juxtaposition' } });
    expect(cue.block_type).toBe('note_cue');
    expect(() => BlockSchema.parse({ ...base, id: 'n2', block_type: 'note_cue', content: { kind: 'essay', prompt: 'x' } })).toThrow();
  });

  it('allows a note cue inside a section', () => {
    const cue = { ...base, id: 'n1', block_type: 'note_cue', content: { kind: 'draw', prompt: 'Sketch it' } };
    expect(() => BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'A', blocks: [cue] } })).not.toThrow();
  });

  it('lets a published lesson say it is a lecture', () => {
    const lesson = { lesson_id: 'l1', title: 'T', unit_id: 'u1', blocks: [], published_at: '2026-10-23T00:00:00.000Z', schema_version: 1, pedagogical_mode: 'lecture' };
    expect(PublishedLessonSchema.parse(lesson).pedagogical_mode).toBe('lecture');
  });

  it('the heading editor keeps narration when the text changes', () => {
    const block = BlockSchema.parse({ ...base, id: 'h1', block_type: 'heading', variant: 'section', content: { text: 'Tone', narration } }) as Extract<ReturnType<typeof BlockSchema.parse>, { block_type: 'heading' }>;
    let latest = block;
    const editor = createHeadingEditor(block, (next) => { latest = next; }, () => latest);
    const input = editor.querySelector<HTMLInputElement>('.block-editor__heading-text')!;
    input.value = 'Tone and mood';
    input.dispatchEvent(new Event('input'));
    expect(latest.content).toEqual({ text: 'Tone and mood', narration });
  });
});
