// The tutorial board and part tabs on the lesson editor page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TutorialSummary, TutorialTeacherApi } from '@/tutorial/api';

const summary = (): TutorialSummary => ({ seen: 0, total: 1, groups: [] });
const fake = vi.hoisted(() => ({ api: null as unknown as TutorialTeacherApi }));
vi.mock('@/tutorial/api', async () => {
  const actual = await vi.importActual<typeof import('@/tutorial/api')>('@/tutorial/api');
  return { ...actual, tutorialTeacherApi: () => fake.api };
});

import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import { mountLessonPage } from '@/teacher/lesson-canvas/mount-page';

const ISO = '2026-01-01T00:00:00.000Z';
const group = (id: string, name: string) => ({ id, name, why: '', goal: '', gap_type: 'knowledge' as const, students: [], evidence: [] });
function section(id: string, extra: Record<string, unknown>, blocks: Block[] = []): Block {
  const base = createBlock('section', id);
  return { ...base, content: { ...(base.content as object), title: id, blocks, ...extra } } as Block;
}
function tutorialLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson_t1',
    type: 'lesson',
    title: 'Cyclical structure',
    slug: 'cyclical_structure',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    unit_id: 'unit_001',
    sequence: 1,
    pedagogical_mode: 'tutorial',
    tutorial: { class_id: 'class_1', groups: [group('ga', 'Re-tells'), group('gb', 'Mix-up')] },
    blocks: [
      createBlock('heading', 'common_1'),
      section('tab_a', { tutorial_group: 'ga' }, [createBlock('heading', 'nested_a')]),
      section('exit_a', { tutorial_group: 'ga', tutorial_exit: true }),
      section('tab_b', { tutorial_group: 'gb' })
    ],
    ...overrides
  };
}
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const rowShown = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('.lesson-page__blocks > .lesson-page__block')].filter((r) => !r.hidden).map((r) => r.dataset.blockId);
const tab = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.tut-tabs button')].find((b) => b.textContent === label)!;

// Class examples and pulse dots ask the server for their counts; there's none here.
vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  fake.api = {
    summary: vi.fn(async () => summary()), board: vi.fn(), sit: vi.fn(), show: vi.fn(), hide: vi.fn(),
    done: vi.fn(), unlock: vi.fn(), move: vi.fn(), reply: vi.fn()
  } as unknown as TutorialTeacherApi;
});
afterEach(() => {
  vi.useRealTimers();
  host.remove();
});

function mount(lesson = tutorialLesson()) {
  const onChange = vi.fn();
  const handle = mountLessonPage(host, { lesson, media: [], onChange, onPrint: vi.fn(), idFactory: () => 'new_1' });
  return { handle, onChange };
}

describe('tutorial on the lesson page', () => {
  it('mounts the board and asks for the groups at once', async () => {
    const { handle } = mount();
    await flush();
    expect(host.querySelector('.lesson-page__tutorial .tut-board')).not.toBeNull();
    expect(fake.api.summary).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it('shows Common first, then a group’s tab and exit check, and All shows everything', async () => {
    const { handle } = mount();
    await flush();
    expect(rowShown(host)).toEqual(['common_1']);
    tab(host, 'Re-tells').click();
    expect(rowShown(host)).toEqual(['tab_a', 'exit_a']);
    tab(host, 'All').click();
    expect(rowShown(host)).toEqual(['common_1', 'tab_a', 'exit_a', 'tab_b']);
    handle.dispose();
  });

  it('leaves blocks inside a group’s section alone', async () => {
    const { handle } = mount();
    await flush();
    tab(host, 'Re-tells').click();
    const nested = host.querySelectorAll<HTMLElement>('[data-block-id="nested_a"], [data-key="nested_a"]');
    expect(nested.length).toBeGreaterThan(0);
    for (const el of nested) expect(el.hidden).toBe(false);
    handle.dispose();
  });

  it('repaints the tab names when the lesson’s groups change', async () => {
    const { handle } = mount();
    await flush();
    handle.update(tutorialLesson({ tutorial: { class_id: 'class_1', groups: [group('ga', 'Retells the plot'), group('gb', 'Mix-up')] } }));
    expect([...host.querySelectorAll('.tut-tabs button')].map((b) => b.textContent)).toEqual(['Common', 'Retells the plot', 'Mix-up', 'All']);
    handle.dispose();
  });

  it('drops the board and tabs when the lesson stops being a tutorial, and the polling stops', async () => {
    vi.useFakeTimers();
    const { handle } = mount();
    await vi.advanceTimersByTimeAsync(0);
    const select = host.querySelector<HTMLSelectElement>('.lesson-page__mode-select')!;
    select.value = 'lesson';
    select.dispatchEvent(new Event('change'));
    expect(host.querySelector('.tut-board')).toBeNull();
    expect(host.querySelector('.tut-tabs')).toBeNull();
    expect(rowShown(host)).toEqual(['common_1', 'tab_a', 'exit_a', 'tab_b']);
    const calls = vi.mocked(fake.api.summary).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(vi.mocked(fake.api.summary).mock.calls.length).toBe(calls);
    handle.dispose();
  });

  it('stops polling when the page is torn down', async () => {
    vi.useFakeTimers();
    const { handle } = mount();
    await vi.advanceTimersByTimeAsync(0);
    handle.dispose();
    const calls = vi.mocked(fake.api.summary).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(vi.mocked(fake.api.summary).mock.calls.length).toBe(calls);
  });

  it('has no board or tabs on a lesson that isn’t a tutorial', () => {
    const { handle } = mount(tutorialLesson({ pedagogical_mode: 'lesson' }));
    expect(host.querySelector('.tut-board')).toBeNull();
    expect(host.querySelector<HTMLElement>('.lesson-page__tutorial')!.hidden).toBe(true);
    expect(fake.api.summary).not.toHaveBeenCalled();
    handle.dispose();
  });
});
