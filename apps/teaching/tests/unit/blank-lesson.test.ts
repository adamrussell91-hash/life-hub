import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/teacher/create/api', () => ({
  postLesson: vi.fn()
}));

vi.mock('@/teacher/create/modal', () => ({
  openCreateModal: vi.fn()
}));

import type { Lesson } from '@/schemas';
import { postLesson } from '@/teacher/create/api';
import { openBlankLesson } from '@/teacher/create/blank-lesson';
import { openCreateModal } from '@/teacher/create/modal';
import type { CurriculumResponse } from '@/teacher/nav';

const curriculum = {
  years: [],
  subjects: [],
  units: [{ id: 'unit_a', title: 'Unit A' }],
  classes: [],
  lessons: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [],
  schedule_anchor_date: '2026-08-12'
} as unknown as CurriculumResponse;

describe('openBlankLesson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('opens the lesson modal when no unit is provided', () => {
    const onCreated = vi.fn();
    openBlankLesson({ curriculum, onCreated });

    expect(openCreateModal).toHaveBeenCalledWith({
      kind: 'lesson',
      curriculum,
      onCreated
    });
    expect(postLesson).not.toHaveBeenCalled();
  });

  it('creates an untitled lesson and calls onCreated when unit is known', async () => {
    const created = {
      id: 'lesson_new',
      title: 'Untitled lesson',
      unit_id: 'unit_a',
      slug: 'untitled-lesson',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: '2026-08-25T00:00:00.000Z'
    };
    vi.mocked(postLesson).mockResolvedValue(created as unknown as Lesson);
    const onCreated = vi.fn().mockResolvedValue(undefined);

    openBlankLesson({ curriculum, onCreated, unitId: 'unit_a' });

    await vi.waitFor(() => {
      expect(postLesson).toHaveBeenCalledWith({
        title: 'Untitled lesson',
        unit_id: 'unit_a',
        pedagogical_mode: 'lesson'
      });
      expect(onCreated).toHaveBeenCalledWith('lesson', 'lesson_new', created);
    });
    expect(openCreateModal).not.toHaveBeenCalled();
  });

  it('falls back to the lesson modal when auto-create fails', async () => {
    vi.mocked(postLesson).mockRejectedValue(new Error('network'));
    const onCreated = vi.fn();

    openBlankLesson({ curriculum, onCreated, unitId: 'unit_a' });

    await vi.waitFor(() => {
      expect(openCreateModal).toHaveBeenCalledWith({
        kind: 'lesson',
        curriculum,
        onCreated
      });
    });
  });
});
