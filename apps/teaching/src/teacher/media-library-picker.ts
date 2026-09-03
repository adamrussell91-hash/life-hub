import { isHttpUrl } from '@/blocks/url-safety';
import type { Media } from '@/schemas';

export type MediaLibraryPickerOptions = {
  media: ReadonlyArray<Media>;
  mediaTypes?: ReadonlyArray<Media['media_type']>;
  onPick: (media: Media) => void;
  emptyMessage?: string;
};

/** Prefer preview, then thumbnail, then download — only http(s). */
export function resolveMediaLibraryUrl(media: Media): string | undefined {
  for (const candidate of [media.preview_url, media.thumbnail_url, media.download_url]) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (isHttpUrl(trimmed)) return trimmed;
  }
  return undefined;
}

/**
 * Renders a compact list of active library media into `host`.
 * Call again to refresh; replaces host children.
 */
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
    empty.textContent =
      options.emptyMessage ??
      (types?.length === 1 && types[0] === 'image'
        ? 'No images in library'
        : 'No media in library');
    host.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'media-library-picker__list';

  for (const media of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-library-picker__item';
    button.setAttribute('aria-label', `Use ${media.title}`);

    const thumbUrl = resolveMediaLibraryUrl(media);
    if (thumbUrl && media.media_type === 'image') {
      const thumb = document.createElement('img');
      thumb.className = 'media-library-picker__thumb';
      thumb.src = thumbUrl;
      thumb.alt = '';
      button.append(thumb);
    }

    const label = document.createElement('span');
    label.className = 'media-library-picker__label';
    label.textContent = media.title;
    button.append(label);

    button.addEventListener('click', () => {
      options.onPick(media);
    });

    list.append(button);
  }

  host.append(list);
}
