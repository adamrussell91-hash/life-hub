import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cover } from '@/schemas';
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

  it('disables Set URL, library, and Remove cover while onSave is unresolved', async () => {
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
    const library = findButton(host, 'Choose from library')!;
    const remove = findButton(host, 'Remove cover')!;

    expect(apply.disabled).toBe(false);
    expect(library.disabled).toBe(false);
    expect(remove.disabled).toBe(false);

    remove.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(null);
    expect(apply.disabled).toBe(true);
    expect(library.disabled).toBe(true);
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
