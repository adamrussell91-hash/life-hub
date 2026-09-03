import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/teacher/lessons-library/api', () => ({
  getLesson: vi.fn()
}));
vi.mock('@/teacher/schedule-api', () => ({
  patchClass: vi.fn().mockResolvedValue({})
}));
vi.mock('@/teacher/unit-api', () => ({
  patchUnit: vi.fn().mockResolvedValue({})
}));
vi.mock('@/api/client', () => ({
  apiPatch: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({})
}));

import { navigate } from '@/app/router';
import { getLesson } from '@/teacher/lessons-library/api';
import { openEntityCardExpand, wireEntityCardExpand } from '@/teacher/entity-card-expand';

describe('entity-card-expand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('opens an expanded panel with a full-page action', async () => {
    openEntityCardExpand({
      kind: 'unit',
      id: 'unit_aotfw',
      title: 'Artist of the Floating World',
      eyebrow: 'English Advanced',
      media: [],
      fullPagePath: '/units/unit_aotfw',
      metaText: 'Year 12 · English Advanced',
      editableTitle: true
    });

    const dialog = document.querySelector('.entity-card-expand');
    expect(dialog).toBeTruthy();
    expect((document.querySelector('.entity-card-expand__title-input') as HTMLInputElement)?.value).toBe(
      'Artist of the Floating World'
    );
    expect(document.querySelector('.entity-card-expand__meta')?.textContent).toContain('Year 12');

    document.querySelector<HTMLButtonElement>('.entity-card-expand__full-page')?.click();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/units/unit_aotfw');
    });
    expect(document.querySelector('.entity-card-expand')).toBeNull();
  });

  it('wires card clicks but ignores nested controls', async () => {
    const card = document.createElement('div');
    card.className = 'lesson-list__item--openable';
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = 'Duplicate';
    card.append(action);
    document.body.append(card);

    wireEntityCardExpand(card, {
      kind: 'lesson',
      id: 'lesson_001',
      title: 'Introduction',
      media: [],
      fullPagePath: '/lessons/lesson_001',
      editableTitle: true
    });

    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.entity-card-expand')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('.entity-card-expand__close')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.entity-card-expand')).toBeNull();
    });

    action.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.entity-card-expand')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('hydrates lesson cover on open', async () => {
    vi.mocked(getLesson).mockResolvedValue({
      type: 'lesson',
      id: 'lesson_001',
      title: 'Introduction',
      slug: 'introduction',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      blocks: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1,
      cover: { url: 'https://cdn.example.com/cover.jpg' }
    });

    openEntityCardExpand({
      kind: 'lesson',
      id: 'lesson_001',
      title: 'Introduction',
      media: [],
      fullPagePath: '/lessons/lesson_001',
      editableTitle: true
    });

    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLImageElement>('.entity-card-expand__banner img')?.src
      ).toContain('cover.jpg');
    });
    expect(getLesson).toHaveBeenCalledWith('lesson_001');
  });
});
