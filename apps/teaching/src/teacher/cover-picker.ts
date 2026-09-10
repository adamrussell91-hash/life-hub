import type { Cover, Media } from '@/schemas';
import { CoverSchema, resolveCoverUrl, coverAltText } from '@/schemas';
import { isHttpUrl } from '@/blocks/url-safety';

export interface CoverPickerOptions {
  cover?: Cover | null;
  media: ReadonlyArray<Media>;
  titleFallback?: string;
  onSave: (cover: Cover | null) => void | Promise<void>;
  editable?: boolean;
}

export interface CoverPickerHandle {
  root: HTMLElement;
  dispose: () => void;
  getCover: () => Cover | null;
}

/**
 * Cover hero with optional teacher edit: URL + image library pick + remove.
 * Prefer `renderEntityBanner` for class-page read view; use this for dialogs
 * and other edit surfaces that need the full toolbar inline.
 */
export function mountCoverPicker(
  host: HTMLElement,
  options: CoverPickerOptions
): CoverPickerHandle {
  const editable = options.editable !== false;
  let current: Cover | null = options.cover ?? null;
  let busy = false;

  const root = document.createElement('div');
  root.className = 'cover-picker';

  const hero = document.createElement('div');
  hero.className = 'cover-picker__hero';
  hero.dataset.coverHero = '';

  const img = document.createElement('img');
  img.className = 'cover-picker__image';
  img.hidden = true;

  const placeholder = document.createElement('div');
  placeholder.className = 'cover-picker__placeholder';
  placeholder.textContent = 'No cover image';

  hero.append(img, placeholder);

  const toolbar = document.createElement('div');
  toolbar.className = 'cover-picker__toolbar';
  toolbar.hidden = !editable;

  const error = document.createElement('p');
  error.className = 'cover-picker__error';
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'cover-picker__url';
  urlInput.placeholder = 'https://…';
  urlInput.dataset.coverUrl = '';

  const altInput = document.createElement('input');
  altInput.type = 'text';
  altInput.className = 'cover-picker__alt';
  altInput.placeholder = 'Alt text';
  altInput.dataset.coverAlt = '';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'btn btn--secondary';
  applyBtn.textContent = 'Set URL';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn--ghost';
  removeBtn.textContent = 'Remove cover';

  const libraryBtn = document.createElement('button');
  libraryBtn.type = 'button';
  libraryBtn.className = 'btn btn--ghost';
  libraryBtn.textContent = 'Choose from library';

  const library = document.createElement('div');
  library.className = 'cover-picker__library';
  library.hidden = true;
  library.dataset.coverLibrary = '';

  toolbar.append(urlInput, altInput, applyBtn, libraryBtn, removeBtn, library, error);
  root.append(hero, toolbar);
  host.replaceChildren(root);

  const imageMedia = () =>
    options.media.filter((entry) => entry.media_type === 'image' && entry.status === 'active');

  const syncButtons = (): void => {
    applyBtn.disabled = busy;
    libraryBtn.disabled = busy;
    removeBtn.disabled = busy || current === null;
  };

  const renderPreview = (): void => {
    const url = resolveCoverUrl(current ?? undefined, options.media);
    if (url) {
      img.src = url;
      img.alt = coverAltText(current, options.titleFallback ?? 'Cover');
      img.hidden = false;
      placeholder.hidden = true;
      hero.classList.add('cover-picker__hero--has-image');
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      placeholder.hidden = false;
      hero.classList.remove('cover-picker__hero--has-image');
    }
    urlInput.value = current?.url ?? '';
    altInput.value = current?.alt_text ?? '';
  };

  const setError = (message: string | null): void => {
    if (!message) {
      error.hidden = true;
      error.textContent = '';
      return;
    }
    error.hidden = false;
    error.textContent = message;
  };

  const persist = async (next: Cover | null): Promise<void> => {
    if (busy) return;
    busy = true;
    setError(null);
    syncButtons();
    try {
      await options.onSave(next);
      current = next;
      renderPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save cover.');
    } finally {
      busy = false;
      syncButtons();
    }
  };

  const renderLibrary = (): void => {
    library.replaceChildren();
    const items = imageMedia();
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'cover-picker__library-empty';
      empty.textContent = 'No image resources in the library yet.';
      library.append(empty);
      return;
    }
    for (const media of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cover-picker__library-item';
      const thumbUrl =
        media.thumbnail_url ?? media.preview_url ?? media.download_url ?? '';
      if (thumbUrl) {
        const thumb = document.createElement('img');
        thumb.src = thumbUrl;
        thumb.alt = media.title;
        button.append(thumb);
      }
      const label = document.createElement('span');
      label.textContent = media.title;
      button.append(label);
      button.addEventListener('click', () => {
        void persist({
          media_id: media.id,
          url: thumbUrl && isHttpUrl(thumbUrl) ? thumbUrl : undefined,
          alt_text: altInput.value.trim() || media.title
        });
        library.hidden = true;
      });
      library.append(button);
    }
  };

  applyBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    const alt_text = altInput.value.trim() || undefined;
    if (!url) {
      setError('Enter an image URL.');
      return;
    }
    if (!isHttpUrl(url)) {
      setError('URL must start with http:// or https://');
      return;
    }
    const candidate = CoverSchema.safeParse({ url, alt_text });
    if (!candidate.success) {
      setError('Cover is invalid.');
      return;
    }
    void persist(candidate.data);
  });

  removeBtn.addEventListener('click', () => {
    if (current === null) return;
    void persist(null);
  });

  libraryBtn.addEventListener('click', () => {
    library.hidden = !library.hidden;
    if (!library.hidden) renderLibrary();
  });

  renderPreview();
  syncButtons();

  return {
    root,
    dispose: () => {
      host.replaceChildren();
    },
    getCover: () => current
  };
}

/**
 * Read-only cover banner for student views / unit gallery cards.
 * Class page read view should use `renderEntityBanner` instead.
 */
export function renderCoverBanner(
  cover: Cover | null | undefined,
  media: ReadonlyArray<Media>,
  altFallback = ''
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cover-picker__hero cover-picker__hero--static';
  const url = resolveCoverUrl(cover ?? undefined, media);
  if (url) {
    wrap.classList.add('cover-picker__hero--has-image');
    const img = document.createElement('img');
    img.className = 'cover-picker__image';
    img.src = url;
    img.alt = coverAltText(cover, altFallback);
    wrap.append(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'cover-picker__placeholder';
    wrap.append(placeholder);
  }
  return wrap;
}
