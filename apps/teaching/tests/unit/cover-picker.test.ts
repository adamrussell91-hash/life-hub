import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cover, Media } from '@/schemas';
import { mountCoverPicker } from '@/teacher/cover-picker';

const findButton = (root: ParentNode, label: string): HTMLButtonElement | null =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === label
  ) ?? null;

describe('mountCoverPicker remove cover', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('removes an existing URL cover through onSave(null)', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);
    const handle = mountCoverPicker(host, {
      cover: { url: 'https://cdn.example.com/cover.jpg', alt_text: 'Cover art' },
      media: [],
      onSave
    });

    const img = host.querySelector<HTMLImageElement>('.cover-picker__image')!;
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/cover.jpg');

    const remove = findButton(host, 'Remove cover');
    expect(remove).not.toBeNull();
    expect(remove!.type).toBe('button');
    expect(remove!.disabled).toBe(false);

    remove!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(null);
    expect(handle.getCover()).toBeNull();
    expect(img.hasAttribute('src')).toBe(false);
    expect(img.hidden).toBe(true);
    expect(remove!.disabled).toBe(true);
  });

  it('disables Remove cover when there is no cover', () => {
    mountCoverPicker(host, {
      cover: null,
      media: [],
      onSave: vi.fn()
    });

    const remove = findButton(host, 'Remove cover');
    expect(remove).not.toBeNull();
    expect(remove!.disabled).toBe(true);
  });

  it('keeps the previous preview and shows the error when removal is rejected', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => {
      throw new Error('Network unavailable');
    });
    const handle = mountCoverPicker(host, {
      cover: { url: 'https://cdn.example.com/cover.jpg', alt_text: 'Cover art' },
      media: [],
      onSave
    });

    const remove = findButton(host, 'Remove cover')!;
    remove.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const img = host.querySelector<HTMLImageElement>('.cover-picker__image')!;
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/cover.jpg');
    expect(img.hidden).toBe(false);
    expect(handle.getCover()).toEqual({
      url: 'https://cdn.example.com/cover.jpg',
      alt_text: 'Cover art'
    });

    const error = host.querySelector('.cover-picker__error')!;
    expect(error.textContent).toBe('Network unavailable');
    expect((error as HTMLElement).hidden).toBe(false);
    expect(remove.disabled).toBe(false);
  });

  it('disables Set URL, Drive, upload, and Remove cover while onSave is unresolved', async () => {
    let resolveSave!: (value: void) => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );

    mountCoverPicker(host, {
      cover: { url: 'https://cdn.example.com/cover.jpg', alt_text: 'Cover art' },
      media: [],
      onSave
    });

    const apply = findButton(host, 'Set URL')!;
    const library = findButton(host, 'Choose from Google Drive')!;
    const upload = findButton(host, 'Upload image')!;
    const remove = findButton(host, 'Remove cover')!;

    expect(apply.disabled).toBe(false);
    expect(library.disabled).toBe(false);
    expect(upload.disabled).toBe(false);
    expect(remove.disabled).toBe(false);

    remove.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(null);
    expect(apply.disabled).toBe(true);
    expect(library.disabled).toBe(true);
    expect(upload.disabled).toBe(true);
    expect(remove.disabled).toBe(true);

    resolveSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(apply.disabled).toBe(false);
    expect(library.disabled).toBe(false);
    expect(remove.disabled).toBe(true);
  });

  it('enables Remove cover after a valid URL save from no cover', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);

    mountCoverPicker(host, {
      cover: null,
      media: [],
      onSave
    });

    const remove = findButton(host, 'Remove cover')!;
    expect(remove.disabled).toBe(true);

    const url = host.querySelector<HTMLInputElement>('.cover-picker__url')!;
    url.value = 'https://cdn.example.com/new-cover.jpg';
    findButton(host, 'Set URL')!.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.example.com/new-cover.jpg' })
    );
    expect(remove.disabled).toBe(false);
  });
});

const imageMedia = (id: string, overrides: Partial<Media> = {}): Media => ({
  id,
  type: 'media',
  title: `${id}.jpg`,
  slug: id,
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1,
  provider: 'direct',
  media_type: 'image',
  preview_url: `https://cdn.example.com/${id}.jpg`,
  ...overrides
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

describe('mountCoverPicker adding images', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('shows library images straight away, newest first, and one click sets the cover', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);
    mountCoverPicker(host, {
      cover: null,
      media: [
        imageMedia('old', { created_at: '2026-01-01T00:00:00.000Z' }),
        imageMedia('new', { created_at: '2026-05-01T00:00:00.000Z' }),
        imageMedia('doc', { media_type: 'pdf' })
      ],
      onSave,
      onMediaCreated: vi.fn()
    });

    const items = host.querySelectorAll<HTMLButtonElement>('.cover-picker__library-item');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toBe('new.jpg');

    items[0]!.click();
    await flush();

    expect(onSave).toHaveBeenCalledWith({
      media_id: 'new',
      url: 'https://cdn.example.com/new.jpg',
      alt_text: 'new.jpg'
    });
  });

  it('mirrors a Drive pick into the library and saves it as the cover', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);
    const file = new File(['x'], 'river.png', { type: 'image/png' });
    const pickFromDrive = vi.fn(async () => ({
      kind: 'mirror' as const,
      file,
      provider_file_id: 'drive_1',
      title: 'river.png'
    }));
    const created = imageMedia('media_river', { title: 'river.png' });
    const uploadFile = vi.fn(async () => created);
    const onMediaCreated = vi.fn();
    const onExternalPicker = vi.fn();

    const handle = mountCoverPicker(host, {
      cover: null,
      media: [],
      onSave,
      pickFromDrive,
      uploadFile,
      onMediaCreated,
      onExternalPicker
    });

    findButton(host, 'Choose from Google Drive')!.click();
    await flush();

    expect(onExternalPicker.mock.calls).toEqual([[true], [false]]);
    expect(uploadFile).toHaveBeenCalledWith(file, {
      title: 'river.png',
      provider_file_id: 'drive_1'
    });
    expect(onMediaCreated).toHaveBeenCalledWith(created);
    expect(onSave).toHaveBeenCalledWith({
      media_id: 'media_river',
      url: 'https://cdn.example.com/media_river.jpg',
      alt_text: 'river.png'
    });
    expect(handle.getCover()?.media_id).toBe('media_river');
    expect(host.querySelector('.cover-picker__library-item--current')?.textContent).toBe(
      'river.png'
    );
  });

  it('does nothing when the Drive picker is cancelled', async () => {
    const onSave = vi.fn();
    const uploadFile = vi.fn();
    const onExternalPicker = vi.fn();
    mountCoverPicker(host, {
      cover: null,
      media: [],
      onSave,
      pickFromDrive: async () => null,
      uploadFile,
      onMediaCreated: vi.fn(),
      onExternalPicker
    });

    findButton(host, 'Choose from Google Drive')!.click();
    await flush();

    expect(onExternalPicker.mock.calls).toEqual([[true], [false]]);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(findButton(host, 'Choose from Google Drive')!.disabled).toBe(false);
  });

  it('shows the Drive error (e.g. not configured) and re-enables the buttons', async () => {
    const onExternalPicker = vi.fn();
    mountCoverPicker(host, {
      cover: null,
      media: [],
      onSave: vi.fn(),
      pickFromDrive: async () => {
        throw new Error('Google Drive is not configured.');
      },
      onMediaCreated: vi.fn(),
      onExternalPicker
    });

    findButton(host, 'Choose from Google Drive')!.click();
    await flush();

    expect(onExternalPicker.mock.calls).toEqual([[true], [false]]);
    expect(host.querySelector('.cover-picker__error')!.textContent).toBe(
      'Google Drive is not configured.'
    );
    expect(findButton(host, 'Choose from Google Drive')!.disabled).toBe(false);
  });

  it('uploads a chosen image file and saves it as the cover', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);
    const created = imageMedia('media_up', { title: 'poster.jpg' });
    const uploadFile = vi.fn(async () => created);
    mountCoverPicker(host, {
      cover: null,
      media: [],
      onSave,
      uploadFile,
      onMediaCreated: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-cover-file]')!;
    expect(input.accept).toBe('image/*');
    const file = new File(['x'], 'poster.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();

    expect(uploadFile).toHaveBeenCalledWith(file, { title: 'poster.jpg' });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ media_id: 'media_up', url: 'https://cdn.example.com/media_up.jpg' })
    );
  });

  it('rejects a non-image upload without calling the API', async () => {
    const uploadFile = vi.fn();
    mountCoverPicker(host, {
      cover: null,
      media: [],
      onSave: vi.fn(),
      uploadFile,
      onMediaCreated: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-cover-file]')!;
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();

    expect(uploadFile).not.toHaveBeenCalled();
    expect(host.querySelector('.cover-picker__error')!.textContent).toContain('not an image');
  });
  it('provides a decorative Google Drive icon and aborts its default picker on disposal', async () => {
    const driveModule = await import('@/teacher/drive-picker');
    const pending = new Promise<null>(() => {});
    const pick = vi.spyOn(driveModule, 'openDrivePicker').mockReturnValue(pending);
    const handle = mountCoverPicker(host, { media: [], onSave: vi.fn() });
    const button = findButton(host, 'Choose from Google Drive')!;
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    button.click();
    const signal = pick.mock.calls[0]?.[0]?.signal;
    expect(signal?.aborted).toBe(false);
    handle.dispose();
    expect(signal?.aborted).toBe(true);
    pick.mockRestore();
  });

  it('does not upload or reopen the modal when disposed during a Drive pick', async () => {
    let finish!: (pick: import('@/teacher/drive-picker').DrivePickResult) => void;
    const pickFromDrive = () => new Promise<import('@/teacher/drive-picker').DrivePickResult>((resolve) => { finish = resolve; });
    const uploadFile = vi.fn();
    const onSave = vi.fn();
    const onExternalPicker = vi.fn();
    const handle = mountCoverPicker(host, { media: [], onSave, uploadFile, pickFromDrive, onExternalPicker });
    findButton(host, 'Choose from Google Drive')!.click();
    handle.dispose();
    finish({ kind: 'mirror', file: new File(['x'], 'cover.png', { type: 'image/png' }), title: 'cover.png', provider_file_id: 'drive_1' });
    await flush();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onExternalPicker.mock.calls).toEqual([[true]]);
  });

  it('does not save a cover when its upload completes after disposal', async () => {
    let finish!: (media: Media) => void;
    const uploadFile = () => new Promise<Media>((resolve) => { finish = resolve; });
    const onSave = vi.fn();
    const onMediaCreated = vi.fn();
    const handle = mountCoverPicker(host, { media: [], onSave, onMediaCreated, uploadFile, pickFromDrive: async () => ({ kind: 'mirror', file: new File(['x'], 'cover.png', { type: 'image/png' }), title: 'cover.png', provider_file_id: 'drive_1' }) });
    findButton(host, 'Choose from Google Drive')!.click();
    await flush();
    handle.dispose();
    finish(imageMedia('late'));
    await flush();
    expect(onSave).not.toHaveBeenCalled();
    expect(onMediaCreated).not.toHaveBeenCalled();
  });

});
