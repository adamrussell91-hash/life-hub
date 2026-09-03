import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    apiPatch: vi.fn().mockResolvedValue({}),
    apiGet: vi.fn()
  };
});

import { apiPatch } from '@/api/client';
import { peekCurriculum, resetCurriculumStateForTests } from '@/app/curriculum-state';
import { confirmAndArchive, confirmAndTrash } from '@/teacher/lifecycle-api';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Class } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const classRow: Class = {
  id: 'class_1',
  type: 'class',
  title: '11 Psych A',
  slug: '11-psych-a',
  code: '11PSYCHA',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_psych',
  active_unit_ids: [],
  homepage: { announcements: [], resources: [], custom: [] },
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

function snapshot(): CurriculumResponse {
  return {
    years: [],
    subjects: [],
    units: [],
    lessons: [],
    classes: [classRow],
    scheduled_lessons: [],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-08-12'
  };
}

describe('optimistic trash and archive', () => {
  afterEach(() => {
    resetCurriculumStateForTests();
    vi.mocked(apiPatch).mockClear();
  });

  it('trashes locally before the PATCH settles', () => {
    resetCurriculumStateForTests(snapshot());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let patchGate: (value: unknown) => void = () => undefined;
    vi.mocked(apiPatch).mockImplementation(
      () =>
        new Promise((resolve) => {
          patchGate = resolve;
        })
    );

    const applied = vi.fn();
    const ok = confirmAndTrash('class', 'class_1', '11 Psych A', applied);

    expect(ok).toBe(true);
    expect(applied).toHaveBeenCalledTimes(1);
    expect(peekCurriculum()?.classes[0]?.status).toBe('trashed');
    expect(apiPatch).toHaveBeenCalledWith('/api/classes/class_1', { status: 'trashed' });
    patchGate({});
  });

  it('does not wait on a dependencies GET before confirming trash', () => {
    resetCurriculumStateForTests(snapshot());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const ok = confirmAndTrash('class', 'class_1', '11 Psych A');
    expect(ok).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('archives locally before the PATCH settles', () => {
    resetCurriculumStateForTests(snapshot());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(apiPatch).mockReturnValue(new Promise(() => undefined));

    confirmAndArchive('class', 'class_1', '11 Psych A');
    expect(peekCurriculum()?.classes[0]?.status).toBe('archived');
  });
});
