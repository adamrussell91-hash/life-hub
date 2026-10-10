import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCoverPicker } from '@/teacher/cover-picker';
import { renderEntityBanner } from '@/teacher/entity-banner';
import { openDrivePicker } from '@/teacher/drive-picker';
import { uploadMediaFile } from '@/teacher/media-api';

vi.mock('@/teacher/drive-picker', () => ({ openDrivePicker: vi.fn() }));
vi.mock('@/teacher/media-api', () => ({ uploadMediaFile: vi.fn() }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const button = (root: ParentNode, label: string) => {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
  expect(found, `${label} must be available`).toBeDefined();
  return found!;
};
const oldCover = { url: 'https://cdn.example.com/old.jpg' };
const picked = { kind: 'mirror' as const, file: new File(['image'], 'cover.png', { type: 'image/png' }), title: 'Cover art', provider_file_id: 'drive-image' };
const uploaded = { id: 'media_new', preview_url: 'https://api.example.com/new.png' };

describe('Drive cover selection', () => {
  let host: HTMLElement;
  beforeEach(() => {
    vi.resetAllMocks();
    host = document.createElement('div');
    document.body.append(host);
    vi.mocked(openDrivePicker).mockResolvedValue(picked);
    vi.mocked(uploadMediaFile).mockResolvedValue(uploaded as never);
  });
  afterEach(() => {
    host.remove();
    document.querySelectorAll('.entity-banner__dialog').forEach(el => el.remove());
  });

  it('uploads a picked image and saves its durable URL and media id as the cover', async () => {
    const onSave = vi.fn();
    const handle = mountCoverPicker(host, { cover: oldCover, media: [], onSave });
    const drive = button(host, 'Choose from Google Drive');
    expect(drive).toBeDefined();
    expect(drive.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    drive.click();
    await flush();
    expect(openDrivePicker).toHaveBeenCalledWith({ imagesOnly: true, signal: expect.any(AbortSignal) });
    expect(uploadMediaFile).toHaveBeenCalledWith(picked.file, { title: picked.title, provider_file_id: picked.provider_file_id });
    expect(onSave).toHaveBeenCalledWith({ media_id: uploaded.id, url: uploaded.preview_url, alt_text: 'Cover art' });
    expect(handle.getCover()?.url).toBe(uploaded.preview_url);
  });

  it('cancels without uploading or changing the cover', async () => {
    vi.mocked(openDrivePicker).mockResolvedValue(null);
    const onSave = vi.fn();
    const handle = mountCoverPicker(host, { cover: oldCover, media: [], onSave });
    button(host, 'Choose from Google Drive').click();
    await flush();
    expect(uploadMediaFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(handle.getCover()).toEqual(oldCover);
  });

  it.each(['picker', 'upload', 'save'])('preserves the old cover and reports a %s failure', async stage => {
    const onSave = vi.fn();
    if (stage === 'picker') vi.mocked(openDrivePicker).mockRejectedValue(new Error('Picker failed'));
    if (stage === 'upload') vi.mocked(uploadMediaFile).mockRejectedValue(new Error('Upload failed'));
    if (stage === 'save') onSave.mockRejectedValue(new Error('Save failed'));
    const handle = mountCoverPicker(host, { cover: oldCover, media: [], onSave });
    button(host, 'Choose from Google Drive').click();
    await flush();
    expect(handle.getCover()).toEqual(oldCover);
    expect(host.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(false);
    expect(button(host, 'Choose from Google Drive').disabled).toBe(false);
  });

  it('prevents duplicate selection and ignores a result after disposal', async () => {
    let resolve!: (value: typeof picked) => void;
    vi.mocked(openDrivePicker).mockImplementation(() => new Promise(r => { resolve = r; }));
    const onSave = vi.fn();
    const handle = mountCoverPicker(host, { cover: oldCover, media: [], onSave });
    const drive = button(host, 'Choose from Google Drive');
    drive.click();
    drive.click();
    expect(openDrivePicker).toHaveBeenCalledTimes(1);
    expect(button(host, 'Set URL').disabled).toBe(true);
    expect(button(host, 'Remove cover').disabled).toBe(true);
    handle.dispose();
    resolve(picked);
    await flush();
    expect(uploadMediaFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects a non-image rather than uploading it as a cover', async () => {
    vi.mocked(openDrivePicker).mockResolvedValue({ ...picked, file: new File(['pdf'], 'doc.pdf', { type: 'application/pdf' }) });
    const onSave = vi.fn();
    mountCoverPicker(host, { media: [], onSave });
    button(host, 'Choose from Google Drive').click();
    await flush();
    expect(uploadMediaFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('image');
  });

  it('releases the native modal while Google opens and restores it on cancellation', async () => {
    let resolve!: (value: null) => void;
    vi.mocked(openDrivePicker).mockImplementation(() => new Promise(r => { resolve = r; }));
    renderEntityBanner(host, { title: 'Dashboard', entityId: 'dashboard', media: [], editable: true, onSave: vi.fn() });
    button(host, 'Change cover').click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog')!;
    button(dialog, 'Choose from Google Drive').click();
    expect(dialog.open).toBe(false);
    await flush();
    expect(dialog.isConnected).toBe(true);
    resolve(null);
    await flush();
    expect(dialog.open).toBe(true);
    expect(dialog.hidden).toBe(false);
    expect(document.activeElement).toBe(button(dialog, 'Choose from Google Drive'));
  });
});
