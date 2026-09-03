import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cover, Media } from '@/schemas';
import {
  bannerHueFromEntityId,
  gradientForEntityId,
  renderEntityBanner
} from '@/teacher/entity-banner';

const findButton = (root: ParentNode, label: string): HTMLButtonElement | null =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === label
  ) ?? null;

/** Drains the persist → onSave → repaint promise chain. */
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('renderEntityBanner', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    document.querySelectorAll('.entity-banner__dialog').forEach((el) => el.remove());
  });

  it('uses a deterministic gradient for the same entity id', () => {
    const a = gradientForEntityId('class_2026_12engadv1');
    const b = gradientForEntityId('class_2026_12engadv1');
    expect(a).toBe(b);

    const hue = bannerHueFromEntityId('class_2026_12engadv1');
    expect(a).toContain(`hsl(${hue} 32% 26%)`);
    expect(a).toContain(`hsl(${(hue + 38) % 360} 38% 17%)`);

    renderEntityBanner(host, {
      entityId: 'class_2026_12engadv1',
      title: '12ENGADV1',
      media: []
    });
    const fallback = host.querySelector('.entity-banner__fallback');
    expect(fallback?.getAttribute('style')).toContain(a);
  });

  it('renders title and eyebrow on the scrim without URL inputs', () => {
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: '12ENA6',
      eyebrow: 'Year 12 · English Advanced',
      media: [],
      editable: true
    });

    expect(host.querySelector('.entity-banner__title')?.textContent).toBe('12ENA6');
    expect(host.querySelector('.entity-banner__eyebrow')?.textContent).toBe(
      'Year 12 · English Advanced'
    );
    expect(host.querySelector('.entity-banner__scrim')).not.toBeNull();
    expect(host.querySelector('.cover-picker__url')).toBeNull();
    expect(host.querySelector('.cover-picker__alt')).toBeNull();
    expect(host.querySelector('input[type="url"]')).toBeNull();
  });

  it('shows Change cover when editable and opens the picker dialog', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);

    renderEntityBanner(host, {
      entityId: 'class_a',
      title: '12ENA6',
      media: [],
      editable: true,
      onSave
    });

    const edit = host.querySelector<HTMLButtonElement>('.entity-banner__edit');
    expect(edit?.textContent).toBe('Change cover');
    edit?.click();

    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector('.cover-picker__url')).not.toBeNull();
    expect(dialog?.querySelector('.cover-picker__alt')).not.toBeNull();

    const url = dialog!.querySelector<HTMLInputElement>('.cover-picker__url')!;
    url.value = 'https://cdn.example.com/banner.jpg';
    dialog!.querySelector<HTMLButtonElement>('.cover-picker button.btn--secondary')!.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.example.com/banner.jpg' })
    );
    expect(document.querySelector('.entity-banner__dialog')).toBeNull();
    expect(host.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain(
      'cdn.example.com/banner.jpg'
    );
  });

  it('omits Change cover when not editable', () => {
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: '12ENA6',
      media: [],
      editable: false
    });
    expect(host.querySelector('.entity-banner__edit')).toBeNull();
  });

  it('uses cover image and coverAltText when a cover URL resolves', () => {
    const media: Media[] = [];
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      cover: { url: 'https://cdn.example.com/cover.jpg', alt_text: 'Banner art' },
      media
    });

    const img = host.querySelector<HTMLImageElement>('.entity-banner__image');
    expect(img?.src).toContain('cdn.example.com/cover.jpg');
    expect(img?.alt).toBe('Banner art');
  });

  it('updates title and cover without replacing the banner root', () => {
    const handle = renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Original title',
      cover: { url: 'https://cdn.example.com/original.jpg' },
      media: []
    });
    const root = host.querySelector('.entity-banner');

    handle.update({
      title: 'Updated title',
      cover: { url: 'https://cdn.example.com/updated.jpg' }
    });

    expect(host.querySelector('.entity-banner')).toBe(root);
    expect(root?.querySelector('.entity-banner__title')?.textContent).toBe('Updated title');
    expect(root?.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain(
      'cdn.example.com/updated.jpg'
    );
  });

  it('patches title, eyebrow, and image alt in place on a title-only update', () => {
    const handle = renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Original title',
      eyebrow: 'Year 12 · English Advanced',
      cover: { url: 'https://cdn.example.com/cover.jpg' },
      media: [],
      editable: true,
      onSave: vi.fn()
    });

    const root = host.querySelector('.entity-banner');
    const image = host.querySelector<HTMLImageElement>('.entity-banner__image');
    const titleEl = host.querySelector('.entity-banner__title');
    const eyebrowEl = host.querySelector('.entity-banner__eyebrow');
    const edit = host.querySelector('.entity-banner__edit');
    expect(image).not.toBeNull();
    expect(edit).not.toBeNull();

    handle.update({ title: 'Renamed', eyebrow: 'Year 11 · English Standard' });

    // Every keystroke in a title field lands here, so nothing may be rebuilt.
    expect(host.querySelector('.entity-banner')).toBe(root);
    expect(host.querySelector('.entity-banner__image')).toBe(image);
    expect(host.querySelector('.entity-banner__title')).toBe(titleEl);
    expect(host.querySelector('.entity-banner__eyebrow')).toBe(eyebrowEl);
    expect(host.querySelector('.entity-banner__edit')).toBe(edit);

    expect(titleEl?.textContent).toBe('Renamed');
    expect(eyebrowEl?.textContent).toBe('Year 11 · English Standard');
    expect(image?.alt).toBe('Renamed');
    expect(image?.src).toContain('cdn.example.com/cover.jpg');
  });

  it('repaints when an eyebrow first appears or disappears', () => {
    const handle = renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      media: []
    });
    expect(host.querySelector('.entity-banner__eyebrow')).toBeNull();

    handle.update({ eyebrow: 'Year 12 · English Advanced' });
    expect(host.querySelector('.entity-banner__eyebrow')?.textContent).toBe(
      'Year 12 · English Advanced'
    );

    handle.update({ eyebrow: '' });
    expect(host.querySelector('.entity-banner__eyebrow')).toBeNull();
  });

  it('resolves a media_id cover once the library arrives through update', () => {
    const media: Media[] = [
      {
        id: 'media_img',
        type: 'media',
        title: 'Banner',
        slug: 'banner',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1,
        provider: 'external',
        media_type: 'image',
        preview_url: 'https://cdn.example.com/preview.jpg'
      }
    ];
    const handle = renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      cover: { media_id: 'media_img' },
      media: [],
      editable: true,
      onSave: vi.fn()
    });
    expect(host.querySelector('.entity-banner__image')).toBeNull();

    handle.update({ media });

    expect(host.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain(
      'cdn.example.com/preview.jpg'
    );

    // The dialog opened afterwards offers the newly arrived library entry.
    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog')!;
    findButton(dialog, 'Choose from library')!.click();
    expect(dialog.querySelector('.cover-picker__library-item')).not.toBeNull();
    expect(dialog.querySelector('.cover-picker__library-empty')).toBeNull();
  });

  it('returns focus to the repainted Change cover button after a successful URL save', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      media: [],
      editable: true,
      onSave
    });

    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog')!;
    dialog.querySelector<HTMLInputElement>('.cover-picker__url')!.value =
      'https://cdn.example.com/banner.jpg';
    findButton(dialog, 'Set URL')!.click();
    await flushMicrotasks();

    expect(document.querySelector('.entity-banner__dialog')).toBeNull();
    const edit = host.querySelector<HTMLButtonElement>('.entity-banner__edit');
    expect(edit).not.toBeNull();
    expect(document.activeElement).toBe(edit);
  });

  it('returns focus to the repainted Change cover button after a successful remove', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => undefined);
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      cover: { url: 'https://cdn.example.com/original.jpg' },
      media: [],
      editable: true,
      onSave
    });

    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog')!;
    findButton(dialog, 'Remove cover')!.click();
    await flushMicrotasks();

    expect(onSave).toHaveBeenCalledWith(null);
    expect(document.querySelector('.entity-banner__dialog')).toBeNull();
    const edit = host.querySelector<HTMLButtonElement>('.entity-banner__edit');
    expect(document.activeElement).toBe(edit);
  });

  it('leaves focus inside the dialog when the save is rejected', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => {
      throw new Error('Could not remove cover');
    });
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      cover: { url: 'https://cdn.example.com/original.jpg' },
      media: [],
      editable: true,
      onSave
    });

    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog')!;
    findButton(dialog, 'Remove cover')!.click();
    await flushMicrotasks();

    expect(document.querySelector('.entity-banner__dialog')).toBe(dialog);
    expect(document.activeElement).not.toBe(
      host.querySelector<HTMLButtonElement>('.entity-banner__edit')
    );
  });

  it('removes the dialog and host contents when disposed while the dialog is open', () => {
    const handle = renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      media: [],
      editable: true,
      onSave: vi.fn()
    });

    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    expect(document.querySelector('.entity-banner__dialog')).not.toBeNull();

    handle.dispose();

    expect(document.querySelector('.entity-banner__dialog')).toBeNull();
    expect(host.childNodes.length).toBe(0);
  });

  it('keeps the dialog and old banner image when removing the cover is rejected', async () => {
    const onSave = vi.fn(async (_cover: Cover | null) => {
      throw new Error('Could not remove cover');
    });
    renderEntityBanner(host, {
      entityId: 'class_a',
      title: 'Class title',
      cover: { url: 'https://cdn.example.com/original.jpg' },
      media: [],
      editable: true,
      onSave
    });

    host.querySelector<HTMLButtonElement>('.entity-banner__edit')!.click();
    const dialog = document.querySelector<HTMLDialogElement>('.entity-banner__dialog')!;
    const remove = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Remove cover'
    )!;
    remove.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(null);
    expect(document.querySelector('.entity-banner__dialog')).toBe(dialog);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.cover-picker__error')?.textContent).toBe(
      'Could not remove cover'
    );
    expect(host.querySelector<HTMLImageElement>('.entity-banner__image')?.src).toContain(
      'cdn.example.com/original.jpg'
    );
  });
});
