import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/teacher/lifecycle-api', () => ({
  listTrash: vi.fn().mockResolvedValue([]),
  restoreFromTrash: vi.fn().mockResolvedValue({}),
  permanentDelete: vi.fn().mockResolvedValue({ deleted: true }),
  dependenciesFromError: () => [],
  formatDependencyList: () => ''
}));

vi.mock('@/teacher/confirm-dialog', () => ({
  askConfirmCard: vi.fn().mockResolvedValue(true)
}));

vi.mock('@/teacher/export-api', () => ({
  downloadPortableExport: vi.fn().mockResolvedValue(undefined),
  pushGithubBackup: vi.fn().mockResolvedValue({
    path: 'content_backup/teaching-hub-archive.json',
    commit_url: 'https://github.com/example/commit/1'
  })
}));

import { downloadPortableExport, pushGithubBackup } from '@/teacher/export-api';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { listTrash, restoreFromTrash } from '@/teacher/lifecycle-api';
import { renderTrashSection } from '@/teacher/sections/trash';

describe('trash section backup', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
    canvas = document.createElement('div');
    document.body.append(canvas);
  });

  afterEach(() => {
    canvas.remove();
    vi.unstubAllGlobals();
  });

  it('downloads a full archive from Backup Now', async () => {
    renderTrashSection(canvas);
    const backup = canvas.querySelector<HTMLButtonElement>('[data-export="archive"]');
    expect(backup?.textContent).toMatch(/Backup Now/);
    backup!.click();
    await vi.waitFor(() => {
      expect(downloadPortableExport).toHaveBeenCalledWith('archive');
    });
  });

  it('pushes a GitHub snapshot from Backup to GitHub', async () => {
    renderTrashSection(canvas);
    const github = canvas.querySelector<HTMLButtonElement>('[data-backup="github"]');
    expect(github?.textContent).toMatch(/Backup to GitHub/);
    github!.click();
    await vi.waitFor(() => {
      expect(pushGithubBackup).toHaveBeenCalled();
    });
  });

  it('asks a confirm card before restoring', async () => {
    vi.mocked(listTrash).mockResolvedValue([
      {
        type: 'lesson_template',
        id: 'lt_1',
        title: 'Memory, Identity and Ono',
        trashed_at: '2026-08-27T00:00:00.000Z'
      }
    ]);
    vi.mocked(askConfirmCard).mockResolvedValue(false);
    renderTrashSection(canvas);
    await vi.waitFor(() => {
      expect(canvas.querySelector('.trash-page__table')).not.toBeNull();
    });
    const restore = [...canvas.querySelectorAll('button')].find((btn) => btn.textContent === 'Restore');
    expect(restore).toBeTruthy();
    restore!.click();
    await vi.waitFor(() => {
      expect(askConfirmCard).toHaveBeenCalled();
    });
    expect(restoreFromTrash).not.toHaveBeenCalled();

    vi.mocked(askConfirmCard).mockResolvedValue(true);
    restore!.click();
    await vi.waitFor(() => {
      expect(restoreFromTrash).toHaveBeenCalledWith('lesson_template', 'lt_1');
    });
  });
});
