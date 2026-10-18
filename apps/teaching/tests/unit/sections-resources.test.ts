import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/teacher/media-api', () => ({
  createMedia: vi.fn().mockResolvedValue({}),
  patchMedia: vi.fn().mockImplementation(async (id: string, body: object) => ({ id, ...body })),
  saveMediaFolders: vi.fn().mockImplementation(async (folders: unknown) => folders),
  uploadMediaFile: vi.fn().mockResolvedValue({})
}));

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    apiPatch: vi.fn().mockResolvedValue({})
  };
});

import {
  openUrlForMedia,
  renderResourcesIndex,
  resetResourcesViewForTests
} from '@/teacher/sections/resources';
import { patchMedia, saveMediaFolders } from '@/teacher/media-api';
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
    resetResourcesViewForTests();
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

  it('archives media then calls refresh', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderResourcesIndex(canvas, curriculum, { refresh });

    const archiveBtn = canvas.querySelector<HTMLButtonElement>(
      '[data-resources-archive="media_ono_extract"]'
    );
    expect(archiveBtn).toBeTruthy();
    archiveBtn!.click();

    // Kit confirm card — click Archive in the dialog.
    await vi.waitFor(() => {
      const confirm = document.querySelector<HTMLButtonElement>('.confirm-card button.btn--primary, .confirm-card [data-confirm]');
      expect(confirm).toBeTruthy();
      confirm!.click();
    });

    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
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

describe('resource library folders, views and Used in', () => {
  let canvas: HTMLElement;

  const filed: Media = { ...mediaWithPreview, folder_id: 'fld_poems' };
  const library: CurriculumResponse = {
    ...curriculum,
    units: [
      {
        id: 'unit_poetry',
        type: 'unit',
        title: 'Poetry',
        slug: 'poetry',
        status: 'active',
        lesson_ids: ['lesson_one'],
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      } as CurriculumResponse['units'][number]
    ],
    lessons: [
      {
        id: 'lesson_one',
        title: 'Reading the extract',
        slug: 'reading',
        unit_id: 'unit_poetry',
        sequence: 1,
        status: 'active',
        published: false,
        planning_status: 'planned',
        updated_at: ISO
      }
    ],
    classes: [
      { id: 'class_a', title: '11ENA6', status: 'active', active_unit_ids: ['unit_poetry'] } as CurriculumResponse['classes'][number]
    ],
    media: [mediaWithoutUrl, filed],
    media_folders: [
      { id: 'fld_texts', name: 'Texts', parent_id: null },
      { id: 'fld_poems', name: 'Poems', parent_id: 'fld_texts' }
    ],
    media_usage: { media_ono_extract: { lesson_ids: ['lesson_one'], unit_ids: [], class_ids: [] } }
  };

  const view = (key: string): HTMLButtonElement =>
    canvas.querySelector<HTMLButtonElement>(`.resources-nav [data-resources-view="${key}"]`)!;
  const titles = (): string[] =>
    [...canvas.querySelectorAll('.resources-main .lesson-list__title')].map((node) => node.textContent ?? '');

  beforeEach(() => {
    resetResourcesViewForTests();
    vi.mocked(patchMedia).mockClear();
    vi.mocked(saveMediaFolders).mockClear();
    canvas = document.createElement('div');
    document.body.append(canvas);
  });

  afterEach(() => {
    canvas.remove();
    document.querySelectorAll('.confirm-card, dialog').forEach((node) => node.remove());
  });

  it('renders the nested folder tree with counts that include subfolders', () => {
    renderResourcesIndex(canvas, library);
    const texts = view('folder:fld_texts');
    expect(texts.querySelector('.resources-nav__count')?.textContent).toBe('1');
    expect(texts.closest('li')?.querySelector('[data-resources-view="folder:fld_poems"]')).toBeTruthy();
  });

  it('views split resources into Unfiled and Not used anywhere', () => {
    renderResourcesIndex(canvas, library);
    view('unfiled').click();
    expect(titles()).toEqual(['Zebra Notes']);
    view('unused').click();
    expect(titles()).toEqual(['Zebra Notes']);
    expect(canvas.querySelector('.resources-used-in--none')?.textContent).toBe('Not used anywhere');
  });

  it('a folder shows its breadcrumb, subfolders and only its own resources', () => {
    renderResourcesIndex(canvas, library);
    view('folder:fld_texts').click();
    expect(canvas.querySelector('.resources-main__title')?.textContent).toBe('Texts');
    expect(titles()).toEqual([]);
    canvas.querySelector<HTMLButtonElement>('.resources-subfolders__tile')!.click();
    expect(canvas.querySelector('.resources-crumbs')?.textContent).toContain('Texts');
    expect(titles()).toEqual(['AoTFW Extract']);
  });

  it('lists Used in links to each lesson, and groups by unit with its classes', () => {
    renderResourcesIndex(canvas, library);
    const link = canvas.querySelector<HTMLAnchorElement>('[data-used-in="lesson:lesson_one"]');
    expect(link?.getAttribute('href')).toBe('/lessons/lesson_one');
    expect(link?.textContent).toContain('Reading the extract');

    view('by-unit').click();
    const group = canvas.querySelector('.resources-group');
    expect(group?.querySelector('a')?.getAttribute('href')).toBe('/units/unit_poetry');
    expect(group?.textContent).toContain('Taught in 11ENA6');
    expect(titles()).toEqual(['AoTFW Extract']);
  });

  it('moves a resource to a folder from its options menu', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderResourcesIndex(canvas, library, { refresh });
    canvas.querySelector<HTMLButtonElement>('[data-resources-move="media_no_url"]')!.click();
    const select = await vi.waitFor(() => {
      const found = document.querySelector<HTMLSelectElement>('dialog select, .confirm-card select');
      expect(found).toBeTruthy();
      return found!;
    });
    select.value = 'fld_texts';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.closest('dialog, .confirm-card')!.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(patchMedia).toHaveBeenCalledWith('media_no_url', { folder_id: 'fld_texts' });
  });

  it('deleting a folder moves its resources and subfolders up a level', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderResourcesIndex(canvas, library, { refresh });
    view('folder:fld_poems').click();
    const deleteItem = [...canvas.querySelectorAll<HTMLButtonElement>('.resources-main__header .page-options__item')].find(
      (item) => item.textContent === 'Delete folder'
    )!;
    deleteItem.click();
    await vi.waitFor(() => {
      const confirm = document.querySelector<HTMLButtonElement>('.confirm-card button.btn--primary, dialog button.btn--primary');
      expect(confirm).toBeTruthy();
      confirm!.click();
    });
    await vi.waitFor(() => expect(saveMediaFolders).toHaveBeenCalled());
    expect(patchMedia).toHaveBeenCalledWith('media_ono_extract', { folder_id: 'fld_texts' });
    expect(saveMediaFolders).toHaveBeenCalledWith([{ id: 'fld_texts', name: 'Texts', parent_id: null }]);
  });
});
