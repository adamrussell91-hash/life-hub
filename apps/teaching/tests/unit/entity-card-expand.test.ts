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
import { patchClass } from '@/teacher/schedule-api';
import { patchUnit } from '@/teacher/unit-api';
import { openEntityCardExpand, wireEntityCardExpand } from '@/teacher/entity-card-expand';

describe('entity-card-expand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('morphs from the trigger card into the expanded overlay', () => {
    const card = document.createElement('div');
    card.className = 'home-class-tile';
    const title = document.createElement('p');
    title.className = 'home-class-tile__title';
    title.textContent = 'Artist of the Floating World';
    card.append(title);
    document.body.append(card);

    openEntityCardExpand(
      {
        kind: 'unit',
        id: 'unit_aotfw',
        title: 'Artist of the Floating World',
        media: [],
        fullPagePath: '/units/unit_aotfw',
        editableTitle: true
      },
      {},
      { trigger: card }
    );

    expect(document.querySelector('.hub-morph-dialog')).toBeTruthy();
    expect(document.querySelector('.entity-card-expand')?.classList.contains('hub-morph-dialog__frame')).toBe(true);
    expect(card.classList.contains('hub-morph-dialog__origin')).toBe(true);
    expect(title.getAttribute('data-hub-morph')).toBe('title');
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

  it('live saves a unit title and keeps the edited value', async () => {
    vi.mocked(patchUnit).mockResolvedValue({
      type: 'unit',
      id: 'unit_aotfw',
      title: 'Critical Study of Literature',
      slug: 'artist_of_the_floating_world',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1,
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      lesson_ids: []
    });

    openEntityCardExpand({
      kind: 'unit',
      id: 'unit_aotfw',
      title: 'Artist of the Floating World',
      media: [],
      fullPagePath: '/units/unit_aotfw'
    });

    const input = document.querySelector<HTMLInputElement>('.entity-card-expand__title-input')!;
    input.value = 'Critical Study of Literature';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));

    await vi.waitFor(() => {
      expect(patchUnit).toHaveBeenCalledWith('unit_aotfw', {
        title: 'Critical Study of Literature'
      });
    });
    expect(input.value).toBe('Critical Study of Literature');
    expect(document.querySelector('.entity-banner__title')?.textContent).toBe(
      'Critical Study of Literature'
    );
  });

  it('rolls a failed unit rename back to the last saved title', async () => {
    vi.mocked(patchUnit).mockRejectedValueOnce(new Error('Save failed'));

    openEntityCardExpand({
      kind: 'unit',
      id: 'unit_aotfw',
      title: 'Artist of the Floating World',
      media: [],
      fullPagePath: '/units/unit_aotfw'
    });

    const input = document.querySelector<HTMLInputElement>('.entity-card-expand__title-input')!;
    input.value = 'Broken rename';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));

    await vi.waitFor(() => {
      expect(input.value).toBe('Artist of the Floating World');
    });
    expect(document.querySelector('.entity-card-expand__error')?.textContent).toBe('Save failed');
  });

  it('uses the same live title path for classes', async () => {
    vi.mocked(patchClass).mockResolvedValue({ title: 'English Advanced 12ENA6' } as never);

    openEntityCardExpand({
      kind: 'class',
      id: 'class_2026_12engadv1',
      title: 'Year 12 English Advanced',
      media: [],
      fullPagePath: '/classes/class_2026_12engadv1'
    });

    const input = document.querySelector<HTMLInputElement>('.entity-card-expand__title-input')!;
    input.value = 'English Advanced 12ENA6';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));

    await vi.waitFor(() => {
      expect(patchClass).toHaveBeenCalledWith('class_2026_12engadv1', {
        title: 'English Advanced 12ENA6'
      });
    });
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
