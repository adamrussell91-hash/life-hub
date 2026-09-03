import { describe, expect, it, vi } from 'vitest';
import { readCover, renderEntityBanner } from '@/teacher/entity-banner';

describe('entity banner', () => {
  it('reads a cover url and ignores empty values', () => {
    expect(readCover({ url: 'https://example.com/cover.jpg' })).toEqual({
      url: 'https://example.com/cover.jpg'
    });
    expect(readCover({ url: '  ' })).toBeNull();
    expect(readCover(null)).toBeNull();
  });

  it('paints a hero cover and saves a pasted url', () => {
    const host = document.createElement('div');
    const onSave = vi.fn();
    renderEntityBanner(host, {
      title: 'Tournament of Minds',
      cover: null,
      editable: true,
      size: 'hero',
      onSave
    });

    expect(host.querySelector('.entity-banner--hero')).not.toBeNull();
    expect(host.querySelector('.entity-banner.has-cover')).toBeNull();
    expect(host.querySelector<HTMLElement>('.entity-banner__panel')?.hidden).toBe(true);

    const url = host.querySelector<HTMLInputElement>('[aria-label="Cover image URL"]')!;
    url.value = 'https://example.com/tom.jpg';
    url.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onSave).toHaveBeenCalledWith({ url: 'https://example.com/tom.jpg' });
    expect(host.querySelector('.entity-banner.has-cover img')?.getAttribute('src')).toBe(
      'https://example.com/tom.jpg'
    );
    expect(host.querySelector<HTMLElement>('.entity-banner__panel')?.hidden).toBe(true);
  });
});
