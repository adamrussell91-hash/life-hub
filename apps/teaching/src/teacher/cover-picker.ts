import type { Cover, Media } from '@/schemas';
import { CoverSchema, resolveCoverUrl, coverAltText } from '@/schemas';
import { isHttpUrl } from '@/blocks/url-safety';
import { applyCreatedMedia } from '@/app/curriculum-state';
import { openDrivePicker, type DrivePickResult } from '@/teacher/drive-picker';
import { uploadMediaFile } from '@/teacher/media-api';
import { resolveMediaLibraryUrl } from '@/teacher/media-library-picker';

export interface CoverPickerOptions {
  cover?: Cover | null;
  media: ReadonlyArray<Media>;
  titleFallback?: string;
  onSave: (cover: Cover | null) => void | Promise<void>;
  editable?: boolean;
  /** Defaults to the Google Drive Picker in images-only mode. */
  pickFromDrive?: () => Promise<DrivePickResult | null>;
  /** Defaults to `uploadMediaFile` (POST /api/media/upload). */
  uploadFile?: (file: File, opts?: { title?: string; provider_file_id?: string }) => Promise<Media>;
  /** Told about media this picker adds, so the library stays current. Defaults to `applyCreatedMedia`. */
  onMediaCreated?: (media: Media) => void;
  /**
   * Called with `true` before an external picker (Google Drive) opens and `false`
   * after it closes. A host modal dialog must step out of the top layer meanwhile,
   * or the Drive picker renders behind it and cannot be clicked.
   */
  onExternalPicker?: (open: boolean) => void;
}

export interface CoverPickerHandle {
  root: HTMLElement;
  dispose: () => void;
  getCover: () => Cover | null;
}

function libraryThumbUrl(media: Media): string {
  return media.thumbnail_url ?? media.preview_url ?? media.download_url ?? '';
}

/**
 * Cover hero with optional teacher edit. Google Drive and upload are the main
 * actions; the image library shows straight away so one click sets the cover;
 * paste-a-link and remove sit below.
 * Prefer `renderEntityBanner` for class-page read view; use this for dialogs
 * and other edit surfaces that need the full toolbar inline.
 */
export function mountCoverPicker(
  host: HTMLElement,
  options: CoverPickerOptions
): CoverPickerHandle {
  const editable = options.editable !== false;
  const pickFromDrive = options.pickFromDrive ?? (() => openDrivePicker({ imagesOnly: true }));
  const uploadFile = options.uploadFile ?? uploadMediaFile;
  const onMediaCreated = options.onMediaCreated ?? ((media: Media) => void applyCreatedMedia(media));
  let current: Cover | null = options.cover ?? null;
  let mediaList: Media[] = [...options.media];
  let busy = false;
  let disposed = false;

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

  const status = document.createElement('p');
  status.className = 'cover-picker__status';
  status.hidden = true;
  status.setAttribute('role', 'status');

  const error = document.createElement('p');
  error.className = 'cover-picker__error';
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const actions = document.createElement('div');
  actions.className = 'cover-picker__actions';

  const driveBtn = document.createElement('button');
  driveBtn.type = 'button';
  driveBtn.className = 'btn btn--primary cover-picker__drive';
  driveBtn.textContent = 'Choose from Google Drive';

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'btn btn--secondary cover-picker__upload';
  uploadBtn.textContent = 'Upload image';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;
  fileInput.dataset.coverFile = '';

  actions.append(driveBtn, uploadBtn, fileInput);

  const libraryHeading = document.createElement('p');
  libraryHeading.className = 'cover-picker__label';
  libraryHeading.textContent = 'Your images';

  const library = document.createElement('div');
  library.className = 'cover-picker__library';
  library.dataset.coverLibrary = '';

  const linkHeading = document.createElement('p');
  linkHeading.className = 'cover-picker__label';
  linkHeading.textContent = 'Or paste an image link';

  const linkRow = document.createElement('div');
  linkRow.className = 'cover-picker__link-row';

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'cover-picker__url';
  urlInput.placeholder = 'https://…';
  urlInput.dataset.coverUrl = '';
  urlInput.setAttribute('aria-label', 'Image link');

  const altInput = document.createElement('input');
  altInput.type = 'text';
  altInput.className = 'cover-picker__alt';
  altInput.placeholder = 'Alt text';
  altInput.dataset.coverAlt = '';
  altInput.setAttribute('aria-label', 'Alt text');

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'btn btn--secondary cover-picker__apply';
  applyBtn.textContent = 'Set URL';

  linkRow.append(urlInput, altInput, applyBtn);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn--ghost cover-picker__remove';
  removeBtn.textContent = 'Remove cover';

  toolbar.append(
    actions,
    status,
    error,
    libraryHeading,
    library,
    linkHeading,
    linkRow,
    removeBtn
  );
  root.append(hero, toolbar);
  host.replaceChildren(root);

  const imageMedia = () =>
    mediaList.filter((entry) => entry.media_type === 'image' && entry.status === 'active');

  const syncButtons = (): void => {
    applyBtn.disabled = busy;
    driveBtn.disabled = busy;
    uploadBtn.disabled = busy;
    removeBtn.disabled = busy || current === null;
    for (const item of library.querySelectorAll<HTMLButtonElement>('button')) {
      item.disabled = busy;
    }
  };

  const renderPreview = (): void => {
    const url = resolveCoverUrl(current ?? undefined, mediaList);
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

  const setStatus = (message: string | null): void => {
    status.hidden = !message;
    status.textContent = message ?? '';
  };

  const save = async (next: Cover | null): Promise<void> => {
    await options.onSave(next);
    current = next;
    if (!disposed) renderPreview();
  };

  const persist = async (next: Cover | null): Promise<void> => {
    if (busy) return;
    busy = true;
    setError(null);
    syncButtons();
    try {
      await save(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save cover.');
    } finally {
      busy = false;
      if (!disposed) syncButtons();
    }
  };

  const coverFromMedia = (media: Media): Cover => {
    const url = resolveMediaLibraryUrl(media) ?? libraryThumbUrl(media);
    return {
      media_id: media.id,
      url: url && isHttpUrl(url) ? url : undefined,
      alt_text: altInput.value.trim() || media.title
    };
  };

  /** Shared busy/status/error wrapper for the Drive and upload flows. */
  const runAdd = async (working: string, task: () => Promise<Media | null>): Promise<void> => {
    if (busy) return;
    busy = true;
    setError(null);
    setStatus(working);
    syncButtons();
    try {
      const media = await task();
      if (!media) return;
      mediaList = [media, ...mediaList.filter((entry) => entry.id !== media.id)];
      onMediaCreated(media);
      if (!disposed) renderLibrary();
      setStatus('Saving cover…');
      await save(coverFromMedia(media));
      if (!disposed) renderLibrary();
    } catch (err) {
      if (!disposed) setError(err instanceof Error ? err.message : 'Unable to add that image.');
    } finally {
      busy = false;
      if (!disposed) {
        setStatus(null);
        syncButtons();
      }
    }
  };

  const renderLibrary = (): void => {
    library.replaceChildren();
    // Newest first: what you just added is what you are most likely to want.
    const items = [...imageMedia()].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'cover-picker__library-empty';
      empty.textContent = 'No images yet. Images you add from Drive or upload appear here.';
      library.append(empty);
      return;
    }
    for (const media of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cover-picker__library-item';
      button.title = media.title;
      if (current?.media_id === media.id) {
        button.classList.add('cover-picker__library-item--current');
        button.setAttribute('aria-current', 'true');
      }
      const thumbUrl = libraryThumbUrl(media);
      if (thumbUrl) {
        const thumb = document.createElement('img');
        thumb.src = thumbUrl;
        thumb.alt = '';
        thumb.loading = 'lazy';
        button.append(thumb);
      }
      const label = document.createElement('span');
      label.textContent = media.title;
      button.append(label);
      button.addEventListener('click', () => {
        void persist(coverFromMedia(media)).then(() => {
          if (!disposed) renderLibrary();
        });
      });
      library.append(button);
    }
  };

  driveBtn.addEventListener('click', () => {
    void runAdd('Opening Google Drive…', async () => {
      options.onExternalPicker?.(true);
      let pick: DrivePickResult | null;
      try {
        pick = await pickFromDrive();
      } finally {
        options.onExternalPicker?.(false);
      }
      if (!pick) return null;
      if (pick.kind !== 'mirror') {
        throw new Error('That file is not an image. Choose a JPG, PNG, GIF or WebP.');
      }
      setStatus(`Adding ${pick.title}…`);
      return uploadFile(pick.file, {
        title: pick.title,
        provider_file_id: pick.provider_file_id
      });
    });
  });

  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      setError('That file is not an image. Choose a JPG, PNG, GIF or WebP.');
      return;
    }
    void runAdd(`Uploading ${file.name}…`, () => uploadFile(file, { title: file.name }));
  });

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

  renderPreview();
  if (editable) renderLibrary();
  syncButtons();

  return {
    root,
    dispose: () => {
      disposed = true;
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
