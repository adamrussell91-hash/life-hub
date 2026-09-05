import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const uploadMediaQueue = vi.fn();

vi.mock('@/teacher/media-uppy', () => ({
  uploadMediaQueue: (...args: unknown[]) => uploadMediaQueue(...args)
}));

vi.mock('@/teacher/media-api', () => ({
  createMedia: vi.fn().mockResolvedValue({}),
  patchMedia: vi.fn().mockResolvedValue({}),
  uploadMediaFile: vi.fn().mockResolvedValue({})
}));

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    apiPatch: vi.fn().mockResolvedValue({})
  };
});

import { renderResourcesIndex } from '@/teacher/sections/resources';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Media } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const baseMedia = {
  type: 'media' as const,
  provider: 'external' as const,
  media_type: 'pdf' as const,
  status: 'active' as const,
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const curriculum = {
  years: [],
  subjects: [],
  units: [],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [
    {
      ...baseMedia,
      id: 'media_one',
      title: 'One',
      slug: 'one',
      preview_url: 'https://example.com/one.pdf'
    }
  ],
  schedule_anchor_date: '2026-08-12'
} as unknown as CurriculumResponse;

describe('resources multi-file upload wiring', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    canvas = document.createElement('div');
    uploadMediaQueue.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('marks the file input as multiple', () => {
    renderResourcesIndex(canvas, curriculum);
    expect(canvas.querySelector<HTMLInputElement>('input[type="file"]')?.multiple).toBe(true);
  });

  it('queues every selected file through uploadMediaQueue', async () => {
    uploadMediaQueue.mockResolvedValue({
      successful: [
        { ...baseMedia, id: 'media_a', title: 'a.pdf', slug: 'a' } as Media,
        { ...baseMedia, id: 'media_b', title: 'b.pdf', slug: 'b' } as Media
      ],
      failed: []
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderResourcesIndex(canvas, curriculum, { refresh });

    const input = canvas.querySelector<HTMLInputElement>('input[type="file"]')!;
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' })
    ];
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      expect(uploadMediaQueue).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalled();
    });
    const queued = uploadMediaQueue.mock.calls[0]?.[0] as File[];
    expect(queued.map((file) => file.name)).toEqual(['a.pdf', 'b.pdf']);
  });
});
