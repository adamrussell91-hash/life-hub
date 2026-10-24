// The sprint Kit, phase tabs and progress map on the lesson editor page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SprintTeacherApi } from '@/sprint/api';

const fake = vi.hoisted(() => ({ api: null as unknown as SprintTeacherApi }));
vi.mock('@/sprint/api', async () => {
  const actual = await vi.importActual<typeof import('@/sprint/api')>('@/sprint/api');
  return { ...actual, sprintTeacherApi: () => fake.api };
});

import type { Lesson } from '@/schemas/lesson';
import { mountLessonPage } from '@/teacher/lesson-canvas/mount-page';
import { newSprintBlocks, newSprintSettings } from '@/sprint/defaults';

const ISO = '2026-01-01T00:00:00.000Z';
function sprintLesson(overrides: Partial<Lesson> = {}): Lesson {
  let n = 0;
  return {
    id: 'lesson_s1', type: 'lesson', title: 'Pompeii', slug: 'pompeii', status: 'active', created_at: ISO, updated_at: ISO, schema_version: 1,
    unit_id: 'unit_001', sequence: 1, pedagogical_mode: 'design_sprint', sprint: newSprintSettings('class_1'), blocks: newSprintBlocks(() => `sp${++n}`),
    ...overrides
  };
}
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  fake.api = { summary: vi.fn(async () => ({ groups: [], class_parts: {}, ended: {}, lock: null, extend: {}, running: null, spotlight: null })) } as unknown as SprintTeacherApi;
});
afterEach(() => host.remove());

describe('sprint on the lesson page', () => {
  it('shows the progress map once the lesson is first published', async () => {
    const handle = mountLessonPage(host, { lesson: sprintLesson(), media: [], onChange: vi.fn(), onPrint: vi.fn(), onSelect: vi.fn(), idFactory: () => 'new_1' });
    expect(host.querySelector('.kit')).not.toBeNull();
    expect(host.querySelector('.smap')).toBeNull();
    handle.markPublished?.('2026-10-24T00:00:00.000Z');
    await flush();
    expect(host.querySelector('.smap')).not.toBeNull();
    expect(fake.api.summary).toHaveBeenCalled();
    handle.dispose();
  });

  it('gives a sprint with no phase sections its sections, so a block added on Understand lands there', () => {
    const onChange = vi.fn();
    let n = 0;
    const brief = { id: 'h1', type: 'block', block_type: 'heading', variant: 'section', visibility: 'student_teacher', content: { text: 'The challenge' } };
    const handle = mountLessonPage(host, { lesson: sprintLesson({ blocks: [brief] as never }), media: [], onChange, onPrint: vi.fn(), onSelect: vi.fn(), idFactory: () => `new_${++n}` });
    const phases = (blocks: Lesson['blocks']) => blocks.map((b) => (b.block_type === 'section' ? b.content.sprint_phase : b.block_type));
    expect(phases(onChange.mock.calls.at(-1)![0].blocks)).toEqual(['heading', 'understand', 'sketch', 'decide', 'prototype', 'test']);
    host.querySelector<HTMLButtonElement>('.sprint-edit-tabs button[data-tab="understand"]')!.click();
    handle.insertType('brainstorm');
    const blocks: Lesson['blocks'] = onChange.mock.calls.at(-1)![0].blocks;
    const understand = blocks.find((b) => b.block_type === 'section' && b.content.sprint_phase === 'understand');
    expect(understand?.block_type === 'section' && understand.content.blocks.map((b) => b.block_type)).toEqual(['brainstorm']);
    expect(blocks.filter((b) => b.block_type === 'brainstorm')).toHaveLength(0);
    handle.dispose();
  });

  it('puts back a deleted phase section when a block is added on its tab', () => {
    const onChange = vi.fn();
    let n = 0;
    const lesson = sprintLesson();
    const blocks = lesson.blocks.filter((b) => !(b.block_type === 'section' && b.content.sprint_phase === 'sketch'));
    const handle = mountLessonPage(host, { lesson: { ...lesson, blocks }, media: [], onChange, onPrint: vi.fn(), onSelect: vi.fn(), idFactory: () => `new_${++n}` });
    host.querySelector<HTMLButtonElement>('.sprint-edit-tabs button[data-tab="sketch"]')!.click();
    handle.insertType('rich_text');
    const saved: Lesson['blocks'] = onChange.mock.calls.at(-1)![0].blocks;
    const sketch = saved.find((b) => b.block_type === 'section' && b.content.sprint_phase === 'sketch');
    expect(sketch?.block_type === 'section' && sketch.content.blocks.at(-1)?.block_type).toBe('rich_text');
    expect(saved.filter((b) => b.block_type === 'rich_text')).toHaveLength(0);
    handle.dispose();
  });
});
