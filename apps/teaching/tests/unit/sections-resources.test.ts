import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { openUrlForMedia, renderResourcesIndex } from '@/teacher/sections/resources';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Media } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const baseMedia: Omit<Media, 'id' | 'title' | 'slug' | 'preview_url' | 'download_url'> = {
  type: 'media',
  provider: 'external',
  media_type: 'pdf',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const mediaWithPreview: Media = {
  ...baseMedia,
  id: 'media_ono_extract',
  title: 'AoTFW Extract',
  slug: 'aotfw_extract',
  preview_url: 'https://example.com/ono-extract.pdf'
};

const mediaWithoutUrl: Media = {
  ...baseMedia,
  id: 'media_no_url',
  title: 'Zebra Notes',
  slug: 'zebra_notes',
  media_type: 'other'
};

const mediaArchived: Media = {
  ...baseMedia,
  id: 'media_archived',
  title: 'Archived Item',
  slug: 'archived_item',
  status: 'archived',
  preview_url: 'https://example.com/archived.pdf'
};

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [],
  lessons: [],
  classes: [],
  scheduled_lessons: [],
  scope_sequences: [],
  media: [mediaWithoutUrl, mediaWithPreview, mediaArchived],
  schedule_anchor_date: '2026-08-12'
};

describe('resources section', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    canvas = document.createElement('div');
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers preview_url over download_url', () => {
    const media: Media = {
      ...baseMedia,
      id: 'media_both',
      title: 'Both URLs',
      slug: 'both_urls',
      preview_url: 'https://example.com/preview.pdf',
      download_url: 'https://example.com/download.pdf'
    };
    expect(openUrlForMedia(media)).toBe('https://example.com/preview.pdf');
  });

  it('falls back to download_url when preview_url is absent', () => {
    const media: Media = {
      ...baseMedia,
      id: 'media_download',
      title: 'Download Only',
      slug: 'download_only',
      download_url: 'https://example.com/download.pdf'
    };
    expect(openUrlForMedia(media)).toBe('https://example.com/download.pdf');
  });

  it('returns undefined when no URL is present', () => {
    expect(openUrlForMedia(mediaWithoutUrl)).toBeUndefined();
  });

  it('returns undefined for non-http URLs', () => {
    const media: Media = {
      ...baseMedia,
      id: 'media_bad',
      title: 'Bad Link',
      slug: 'bad_link',
      preview_url: 'javascript:alert(1)'
    };
    expect(openUrlForMedia(media)).toBeUndefined();
  });

  it('lists active media titles sorted and Open when URL present', () => {
    renderResourcesIndex(canvas, curriculum);

    expect(canvas.querySelector('.page-header__title')?.textContent).toBe('Resource Library');

    const titles = [...canvas.querySelectorAll('.lesson-list__title')].map(
      (node) => node.textContent
    );
    expect(titles).toEqual(['AoTFW Extract', 'Zebra Notes']);

    const openLinks = canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open');
    expect(openLinks).toHaveLength(1);
    expect(openLinks[0]?.getAttribute('href')).toBe('https://example.com/ono-extract.pdf');
    expect(openLinks[0]?.target).toBe('_blank');
    expect(openLinks[0]?.rel).toBe('noopener noreferrer');
    expect(openLinks[0]?.textContent).toBe('Open');

    const meta = canvas.querySelector('.lesson-list__meta');
    expect(meta?.textContent).toBe('pdf · external');
  });

  it('shows Upload, Add URL, and Add from Drive controls', () => {
    renderResourcesIndex(canvas, curriculum);

    expect(canvas.querySelector('[data-resources-upload]')?.textContent).toBe('Upload');
    expect(canvas.querySelector('input[type="file"]')).toBeTruthy();
    expect(canvas.querySelector('[data-resources-add-url]')?.textContent).toBe('Add URL');
    expect(canvas.querySelector('[data-drive-pick]')?.textContent).toBe('Add from Drive');
  });

  it('shows Archive and Trash in a kebab for each active item', () => {
    renderResourcesIndex(canvas, curriculum);

    const archiveButtons = [...canvas.querySelectorAll('[data-resources-archive]')];
    expect(archiveButtons).toHaveLength(2);
    expect(archiveButtons.every((btn) => btn.textContent === 'Archive')).toBe(true);

    const trashButtons = [...canvas.querySelectorAll('[data-resources-trash]')];
    expect(trashButtons).toHaveLength(2);
    expect(trashButtons.every((btn) => btn.textContent === 'Move to trash')).toBe(true);
    expect(canvas.querySelectorAll('.page-options__trigger')).toHaveLength(2);
  });

  it('shows empty copy with toolbar when no active media', () => {
    renderResourcesIndex(canvas, { ...curriculum, media: [] });
    expect(canvas.textContent).toContain('No resources yet.');
    expect(canvas.querySelector('[data-resources-upload]')).toBeTruthy();
    expect(canvas.querySelector('[data-resources-add-url]')).toBeTruthy();
    expect(canvas.querySelector('[data-drive-pick]')).toBeTruthy();
  });

  it('archives media then calls refresh', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderResourcesIndex(canvas, curriculum, { refresh });

    const archiveBtn = canvas.querySelector<HTMLButtonElement>(
      '[data-resources-archive="media_ono_extract"]'
    );
    expect(archiveBtn).toBeTruthy();
    archiveBtn!.click();

    expect(refresh).toHaveBeenCalled();
  });

  it('shows Drive stub message when onDrivePick is not provided', () => {
    renderResourcesIndex(canvas, curriculum);
    canvas.querySelector<HTMLButtonElement>('[data-drive-pick]')!.click();
    expect(canvas.querySelector('[role="alert"]')?.textContent).toContain(
      'Google Drive is not configured'
    );
  });

  it('awaits onDrivePick then refreshes', async () => {
    const onDrivePick = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderResourcesIndex(canvas, curriculum, { onDrivePick, refresh });

    canvas.querySelector<HTMLButtonElement>('[data-drive-pick]')!.click();

    await vi.waitFor(() => {
      expect(onDrivePick).toHaveBeenCalled();
      expect(refresh).toHaveBeenCalled();
    });
  });

  it('shows Drive errors on status without refreshing', async () => {
    const onDrivePick = vi.fn().mockRejectedValue(new Error('Google Drive is not configured'));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderResourcesIndex(canvas, curriculum, { onDrivePick, refresh });

    canvas.querySelector<HTMLButtonElement>('[data-drive-pick]')!.click();

    await vi.waitFor(() => {
      expect(canvas.querySelector('[role="alert"]')?.textContent).toContain(
        'Google Drive is not configured'
      );
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
