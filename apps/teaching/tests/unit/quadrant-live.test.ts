import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import { BlockSchema } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { authoredPoint, describePoint, disagrees, placed, quadrantAt, type ClassQuestion } from '@/toolkit/quadrant-live';

type QQ = Extract<Block, { block_type: 'question_quadrant' }>;

function quadrantBlock(patch: Partial<QQ['content']> = {}): QQ {
  const block = createBlock('question_quadrant', 'qq_test') as QQ;
  return BlockSchema.parse({
    ...block,
    content: {
      ...block.content,
      questions: [
        { id: 'q1', text: 'What land did Uncle come from?', quadrant: 'comprehension' },
        { id: 'q2', text: 'Can anyone own land?', quadrant: 'inquiry' }
      ],
      ...patch
    }
  }) as QQ;
}

describe('quadrant geometry', () => {
  it('reads the quadrant from a point', () => {
    expect(quadrantAt({ x: 0.1, y: 0.1 })).toBe('comprehension');
    expect(quadrantAt({ x: 0.9, y: 0.1 })).toBe('speculation');
    expect(quadrantAt({ x: 0.1, y: 0.9 })).toBe('research');
    expect(quadrantAt({ x: 0.9, y: 0.9 })).toBe('inquiry');
  });

  it('describes how far into a quadrant a point sits', () => {
    expect(describePoint({ x: 0.55, y: 0.95 })).toBe('Inquiry: only just open, very intellectual');
    expect(describePoint({ x: 0.3, y: 0.3 })).toBe('Reading comprehension: closed, textual');
  });

  it('counts a disagreement only when the app picks another quadrant, after the teacher’s move', () => {
    const q: ClassQuestion = { id: 'a', text: 'Why?', symbol: '0-0', student: { x: 0.2, y: 0.2 }, ai: { x: 0.8, y: 0.2 } };
    expect(disagrees(q)).toBe(true);
    expect(disagrees({ ...q, ai: { x: 0.4, y: 0.1 } })).toBe(false);
    expect(disagrees({ ...q, teacher: { x: 0.7, y: 0.3 } })).toBe(false);
    expect(placed({ ...q, teacher: { x: 0.7, y: 0.3 } })).toEqual({ x: 0.7, y: 0.3 });
    expect(disagrees({ ...q, ai: undefined })).toBe(false);
  });

  it('keeps the teacher’s own questions inside their quadrant', () => {
    for (let n = 0; n < 12; n++) {
      expect(quadrantAt(authoredPoint('speculation', n))).toBe('speculation');
      expect(quadrantAt(authoredPoint('research', n))).toBe('research');
    }
  });
});

describe('question quadrant block', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to not collecting questions', () => {
    expect((createBlock('question_quadrant', 'x') as QQ).content.collect_questions).toBe(false);
  });

  it('defines the four axis ends for students', () => {
    const text = renderBlock(quadrantBlock(), 'student').textContent ?? '';
    for (const word of ['Closed', 'Open', 'Textual', 'Intellectual']) expect(text).toContain(`${word}`);
    expect(text).toContain('there is one right answer');
    expect(text).toContain('the world beyond the text');
  });

  it('shows where each of the teacher’s questions goes: on the map for the teacher, after the reveal for students', () => {
    const teacher = renderBlock(quadrantBlock(), 'teacher');
    const teacherMarkers = [...teacher.querySelectorAll<HTMLElement>('.tk-qdot--authored')];
    expect(teacherMarkers.map((m) => m.textContent)).toEqual(['1', '2']);
    expect(teacherMarkers.every((m) => !m.hidden)).toBe(true);

    const student = renderBlock(quadrantBlock(), 'student');
    const markers = [...student.querySelectorAll<HTMLElement>('.tk-qdot--authored')];
    expect(markers.every((m) => m.hidden)).toBe(true);
    const reveal = [...student.querySelectorAll<HTMLButtonElement>('.tk-reveal__btn')].find((b) => b.textContent?.includes('where it goes'))!;
    reveal.click();
    expect(markers[0]!.hidden).toBe(false);
    expect(markers[1]!.hidden).toBe(true);
  });

  it('only opens the live panels on a lesson with collecting on', () => {
    expect(renderBlock(quadrantBlock({ collect_questions: true }), 'student').querySelector('.tk-class')).toBeNull();
    expect(renderBlock(quadrantBlock(), 'student', { lessonId: 'l1' }).querySelector('.tk-class')).toBeNull();
    expect(renderBlock(quadrantBlock({ collect_questions: true }), 'print', { lessonId: 'l1' }).querySelector('.tk-class')).toBeNull();
  });
});
