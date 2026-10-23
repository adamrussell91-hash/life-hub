// apps/teaching/tests/unit/lecture-schema.test.ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { PublishedLessonSchema, toPublishedLesson } from '@/schemas/published-lesson';
import { createHeadingEditor, createClozeEditor, createSelfCheckEditor } from '@/blocks/editors';

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
  it('the cloze editor keeps the gate switch when text changes', () => {
    const block = BlockSchema.parse({ ...base, id: 'c1', block_type: 'cloze', content: { text: 'A [[b]] c', gate: false } }) as any;
    let latest = block;
    const editor = createClozeEditor(block, (next: any) => { latest = next; }, () => latest);
    const input = editor.querySelector<HTMLTextAreaElement>('.block-editor__cloze-text')!;
    input.value = 'A [[b]] d';
    input.dispatchEvent(new Event('input'));
    expect(latest.content.gate).toBe(false);
  });

  it('the self-check editor keeps the gate switch when the prompt changes', () => {
    const block = BlockSchema.parse({ ...base, id: 'k1', block_type: 'self_check', content: { mode: 'reveal', prompt: 'Why?', gate: false } }) as any;
    let latest = block;
    const editor = createSelfCheckEditor(block, (next: any) => { latest = next; }, () => latest);
    const input = editor.querySelector<HTMLTextAreaElement>('.block-editor__self-check-prompt')!;
    input.value = 'Why so?';
    input.dispatchEvent(new Event('input'));
    expect(latest.content.gate).toBe(false);
  });

  it('toPublishedLesson keeps the lecture type and leaves ordinary lessons untyped', () => {
    const lesson = { id: 'l1', type: 'lesson' as const, title: 'T', slug: 't', unit_id: 'u1', sequence: 1, blocks: [], status: 'active' as const, created_at: base.created_at, updated_at: base.updated_at, schema_version: 1 as const };
    expect(toPublishedLesson({ ...lesson, pedagogical_mode: 'lecture' } as any, base.created_at).pedagogical_mode).toBe('lecture');
    expect(toPublishedLesson({ ...lesson, pedagogical_mode: 'lesson' } as any, base.created_at).pedagogical_mode).toBeUndefined();
  });
});

describe('side path sections inside a chapter', () => {
  const text = (id: string) => ({ ...base, id, block_type: 'rich_text', content: { html: `<p>${id}</p>` } });
  const sec = (id: string, blocks: unknown[], extra: Record<string, unknown> = {}) => ({ ...base, id, block_type: 'section', content: { title: id, blocks, ...extra } });

  it('allows a side-path section after a gate inside a chapter', () => {
    const cloze = { ...base, id: 'c1', block_type: 'cloze', content: { text: 'A [[b]] c' } };
    const r = BlockSchema.safeParse(sec('s1', [cloze, sec('p1', [text('again')], { side_path: true }), text('t')]));
    expect(r.success).toBe(true);
  });

  it('rejects a normal section inside a section', () => {
    expect(BlockSchema.safeParse(sec('s1', [sec('p1', [text('x')])])).success).toBe(false);
  });

  it('rejects a side path inside a side path', () => {
    const inner = sec('p2', [text('x')], { side_path: true });
    expect(BlockSchema.safeParse(sec('s1', [sec('p1', [inner], { side_path: true })])).success).toBe(false);
  });
});

describe('lecture lesson publish check', () => {
  it('asks for an orphaned If wrong path to sit under a hinge or cloze, in lectures only', async () => {
    const { PublishableLessonSchema: LessonSchema } = await import('@/schemas/lesson');
    const ISO = '2026-10-23T00:00:00.000Z';
    const lesson = (pedagogical_mode: string) => ({
      id: 'lesson_001', type: 'lesson', title: 'T', slug: 't', status: 'active', created_at: ISO, updated_at: ISO,
      schema_version: 1, unit_id: 'unit_001', sequence: 1, pedagogical_mode,
      blocks: [
        { ...base, id: 'h1', block_type: 'heading', variant: 'section', content: { text: 'Tone' } },
        { ...base, id: 'p1', block_type: 'section', content: { title: 'Again', blocks: [], side_path: true } }
      ]
    });
    const messages = (mode: string) => {
      const result = LessonSchema.safeParse(lesson(mode));
      return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };
    expect(messages('lecture').some((m) => m.includes('Place this If wrong path straight under a hinge question or cloze.'))).toBe(true);
    expect(messages('workshop').some((m) => m.includes('If wrong path'))).toBe(false);
  });
});
