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
import { enterBlockEdit } from './helpers/block-edit';

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
  const onSelect = vi.fn();
  const handle = mountLessonPage(host, { lesson, media: [], onChange, onPrint: vi.fn(), onSelect, idFactory: () => 'new_1' });
  return { handle, onChange, onSelect };
}
/** A palette drop on a page gap. */
function dropOnGap(type: string): void {
  const gap = [...host.querySelectorAll<HTMLElement>('.lesson-page__blocks > .lesson-page__gap')].at(-1)!;
  const store = new Map<string, string>([['application/x-teaching-hub-block', JSON.stringify({ kind: 'block', type })]]);
  const dt = { effectAllowed: 'copy', dropEffect: 'none', getData: (t: string) => store.get(t) ?? '', setData: () => {}, get types() { return [...store.keys()]; } };
  for (const name of ['dragover', 'drop']) {
    const event = new Event(name, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dt });
    gap.dispatchEvent(event);
  }
}
const lastLesson = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)![0] as Lesson;
const sectionIds = (lesson: Lesson, id: string) => {
  const found = lesson.blocks.find((b) => b.id === id);
  return found?.block_type === 'section' ? found.content.blocks.map((b) => b.id) : [];
};

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

  it('a palette block dropped on a group tab goes into that group’s tab section and stays in view', async () => {
    const { handle, onChange } = mount();
    await flush();
    tab(host, 'Re-tells').click();
    dropOnGap('heading');
    const saved = lastLesson(onChange);
    expect(saved.blocks.map((b) => b.id)).toEqual(['common_1', 'tab_a', 'exit_a', 'tab_b']);
    expect(sectionIds(saved, 'tab_a')).toEqual(['nested_a', 'new_1']);
    expect(rowShown(host)).toEqual(['tab_a', 'exit_a']);
    expect(tab(host, 'Re-tells').getAttribute('aria-pressed')).toBe('true');
    handle.dispose();
  });

  it('Insert with nothing selected on a group tab adds to that group’s tab section', async () => {
    const { handle, onChange } = mount();
    await flush();
    tab(host, 'Mix-up').click();
    handle.insertType('heading');
    expect(sectionIds(lastLesson(onChange), 'tab_b')).toEqual(['new_1']);
    expect(rowShown(host)).toEqual(['tab_b']);
    handle.dispose();
  });

  it('on Common and All, new blocks still go on the page', async () => {
    const { handle, onChange } = mount();
    await flush();
    dropOnGap('heading');
    expect(lastLesson(onChange).blocks.map((b) => b.id)).toEqual(['common_1', 'tab_a', 'exit_a', 'tab_b', 'new_1']);
    expect(rowShown(host)).toContain('new_1');
    handle.dispose();
  });

  it('a group with no tab section switches to All so the new block is seen', async () => {
    const lesson = tutorialLesson({ blocks: [createBlock('heading', 'common_1'), section('exit_a', { tutorial_group: 'ga', tutorial_exit: true })] });
    const { handle, onChange } = mount(lesson);
    await flush();
    tab(host, 'Re-tells').click();
    handle.insertType('heading');
    expect(lastLesson(onChange).blocks.map((b) => b.id)).toEqual(['common_1', 'exit_a', 'new_1']);
    expect(tab(host, 'All').getAttribute('aria-pressed')).toBe('true');
    expect(rowShown(host)).toContain('new_1');
    handle.dispose();
  });

  it('a publish issue inside a group’s section opens that group’s tab', async () => {
    const { handle } = mount();
    await flush();
    expect(rowShown(host)).toEqual(['common_1']);
    handle.revealPublishBlock('nested_a');
    expect(tab(host, 'Re-tells').getAttribute('aria-pressed')).toBe('true');
    expect(rowShown(host)).toEqual(['tab_a', 'exit_a']);
    expect(host.querySelector('[data-block-id="tab_a"]')!.classList.contains('lesson-page__block--selected')).toBe(true);
    handle.revealPublishBlock('common_1');
    expect(tab(host, 'Common').getAttribute('aria-pressed')).toBe('true');
    handle.dispose();
  });

  it('closes the open block when a tab without it is chosen, and keeps it open on All', async () => {
    const { handle, onSelect } = mount();
    await flush();
    enterBlockEdit(host, '.lesson-page__block[data-block-id="common_1"]');
    expect(host.querySelector('[data-block-id="common_1"]')!.classList.contains('lesson-page__block--selected')).toBe(true);
    tab(host, 'All').click();
    expect(host.querySelector('[data-block-id="common_1"]')!.classList.contains('lesson-page__block--selected')).toBe(true);
    tab(host, 'Re-tells').click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(host.querySelector('.lesson-page__block--selected')).toBeNull();
    handle.dispose();
  });
});
