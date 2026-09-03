import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/teacher/lifecycle-api', () => ({
  listTrash: vi.fn().mockResolvedValue([])
}));

vi.mock('@/teacher/export-api', () => ({
  downloadPortableExport: vi.fn().mockResolvedValue(undefined),
  pushGithubBackup: vi.fn().mockResolvedValue({
    path: 'content_backup/teaching-hub-archive.json',
    commit_url: 'https://github.com/example/commit/1'
  })
}));

import { downloadPortableExport, pushGithubBackup } from '@/teacher/export-api';
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
});
