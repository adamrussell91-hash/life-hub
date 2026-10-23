// Focus / Display view of a tutorial: the Common demo only, and no teacher board.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() };
});

import { apiGet } from '@/api/client';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { displayBlocks, mountLessonDisplayView } from '@/teacher/lesson-display';

function section(id: string, extra: Record<string, unknown>): Block {
  const base = createBlock('section', id);
  return { ...base, content: { ...(base.content as object), title: id, blocks: [createBlock('heading', `${id}_inner`)], ...extra } } as Block;
}
const blocks = (): Block[] => [
  createBlock('heading', 'common_1'),
  section('tab_a', { tutorial_group: 'ga' }),
  section('exit_a', { tutorial_group: 'ga', tutorial_exit: true }),
  createBlock('rich_text', 'common_2')
];

afterEach(() => {
  document.body.replaceChildren();
});

describe('Focus view of a tutorial', () => {
  it('keeps Common only', () => {
    expect(displayBlocks({ blocks: blocks(), pedagogical_mode: 'tutorial' }).map((b) => b.id)).toEqual(['common_1', 'common_2']);
  });

  it('leaves other lessons as they are', () => {
    expect(displayBlocks({ blocks: blocks() }).map((b) => b.id)).toEqual(['common_1', 'tab_a', 'exit_a', 'common_2']);
  });

  it('draws no group tab, exit check or board on the display', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const lesson = { lesson_id: 'lesson_t1', title: 'Cyclical structure', pedagogical_mode: 'tutorial', blocks: blocks() } as unknown as PublishedLesson;
    vi.mocked(apiGet).mockResolvedValue(lesson);
    const root = document.createElement('div');
    document.body.append(root);
    const view = mountLessonDisplayView({ root, lessonId: 'lesson_t1' });
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelector('[data-block-id="tab_a"], [data-block-id="exit_a"]')).toBeNull();
    expect(root.textContent).not.toContain('tab_a');
    expect(root.querySelector('.tut-board, .tut-tabs')).toBeNull();
    expect(root.querySelector('.lesson-display__step:not(.lesson-display__step--hero)')).not.toBeNull();
    view.dispose();
    vi.unstubAllGlobals();
  });
});
