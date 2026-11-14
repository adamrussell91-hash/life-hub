import { describe, expect, it, vi } from 'vitest';
import { SAFE_PHOTO_WIDTH, shrinkSafePhoto } from '@/lib/safe-photo';
import { renderSafePhotoSheet } from '@/components/safe-photo-sheet';
import type { Item } from '@/types';

function cameraPhoto(bytes = 6_500_000, name = 'IMG_0412.HEIC', type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('shrinkSafePhoto', () => {
  it('re-encodes a full-size camera photo to a small JPEG before upload', async () => {
    const close = vi.fn();
    const decode = vi.fn(async () => ({ width: 3024, height: 4032, source: { close } as unknown as ImageBitmap }));
    const encode = vi.fn(async () => new Blob([new Uint8Array(420_000)], { type: 'image/jpeg' }));

    const out = await shrinkSafePhoto(cameraPhoto(), { decode, encode });

    expect(encode).toHaveBeenCalledWith(expect.objectContaining({ width: 3024 }), SAFE_PHOTO_WIDTH);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0412.jpg');
    expect(out.size).toBe(420_000);
    expect(close).toHaveBeenCalled();
  });

  it('keeps the original when the browser cannot decode it', async () => {
    const file = cameraPhoto(900_000, 'odd.webp', 'image/webp');
    const out = await shrinkSafePhoto(file, {
      decode: async () => {
        throw new Error('decode failed');
      },
      encode: vi.fn()
    });
    expect(out).toBe(file);
  });
});

describe('safe photo sheet', () => {
  const item = { id: 'itm_test0001', title: 'Harbour walk' } as Item;

  function pickFile(host: HTMLElement, file: File): void {
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
  }

  it('says it is uploading while the save runs, so it never looks frozen', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    let finish!: () => void;
    renderSafePhotoSheet(host, {
      item,
      onClose: () => {},
      onConfirm: () => new Promise<void>((resolve) => (finish = resolve))
    });
    pickFile(host, cameraPhoto(1000));
    const button = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();

    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Uploading');
    expect(button.getAttribute('aria-busy')).toBe('true');
    finish();
  });

  it('restores the button and shows the error when the save fails', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    renderSafePhotoSheet(host, {
      item,
      onClose: () => {},
      onConfirm: async () => {
        throw new Error('Could not save. Try again.');
      }
    });
    pickFile(host, cameraPhoto(1000));
    const button = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Save photo');
    expect(button.hasAttribute('aria-busy')).toBe(false);
    const alert = host.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toBe('Could not save. Try again.');
  });
});
