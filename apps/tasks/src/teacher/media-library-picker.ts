import { isHttpUrl } from '@/blocks/url-safety';
import type { Media } from '@/schemas/media';

export type MediaLibraryPickerOptions = {
  media: ReadonlyArray<Media>;
  mediaTypes?: ReadonlyArray<Media['media_type']>;
  onPick: (media: Media) => void;
  emptyMessage?: string;
};

export function resolveMediaLibraryUrl(media: Media): string | undefined {
  for (const candidate of [media.preview_url, media.thumbnail_url, media.download_url]) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (isHttpUrl(trimmed) || trimmed.startsWith('blob:')) return trimmed;
  }
  return undefined;
}

export function mountMediaLibraryPicker(
  host: HTMLElement,
  options: MediaLibraryPickerOptions
): void {
  host.replaceChildren();
  host.classList.add('media-library-picker');

  const types = options.mediaTypes;
  const items = options.media.filter((entry) => {
    if (entry.status !== 'active') return false;
    if (types && types.length > 0 && !types.includes(entry.media_type)) return false;
    return Boolean(resolveMediaLibraryUrl(entry));
  });

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'media-library-picker__empty';
    empty.textContent = options.emptyMessage ?? 'No media on this page yet. Paste a URL or upload a file.';
    host.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'media-library-picker__list';
  for (const media of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-library-picker__item';
    button.textContent = media.title;
    button.addEventListener('click', () => options.onPick(media));
    list.append(button);
  }
  host.append(list);
}
