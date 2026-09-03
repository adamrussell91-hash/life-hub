import type { PageCover } from '@/schemas/project';

export type EntityBannerHandle = {
  dispose: () => void;
  update: (next: Record<string, unknown>) => void;
};

export function readCover(cover: unknown): PageCover | null {
  if (!cover || typeof cover !== 'object') return null;
  const url = 'url' in cover ? cover.url : null;
  return typeof url === 'string' && url.trim() ? { url: url.trim() } : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Lesson-page cover: marine fallback, optional image, URL or file. */
export function renderEntityBanner(
  host: HTMLElement,
  options: {
    title: string;
    eyebrow?: string;
    cover?: unknown;
    media?: unknown;
    entityId?: string;
    editable?: boolean;
    size?: string;
    fallback?: string;
    editButtonClass?: string;
    onSave?: (cover: unknown) => void;
  }
): EntityBannerHandle {
  let cover = readCover(options.cover);
  let title = options.title;

  const banner = document.createElement('div');
  banner.className = `entity-banner entity-banner--${options.size ?? 'hero'}`;
  banner.dataset.fallback = options.fallback ?? 'marine';

  const media = document.createElement('div');
  media.className = 'entity-banner__media';

  const scrim = document.createElement('div');
  scrim.className = 'entity-banner__scrim';
  scrim.setAttribute('aria-hidden', 'true');

  const paint = () => {
    media.replaceChildren();
    banner.classList.toggle('has-cover', Boolean(cover?.url));
    if (!cover?.url) return;
    const img = document.createElement('img');
    img.className = 'entity-banner__image';
    img.src = cover.url;
    img.alt = title;
    media.append(img);
  };

  const save = (next: PageCover | null) => {
    cover = next;
    paint();
    options.onSave?.(next);
  };

  banner.append(media, scrim);

  if (options.editable !== false) {
    const edit = document.createElement('div');
    edit.className = 'entity-banner__tools';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = options.editButtonClass ?? 'entity-banner__edit btn btn--ghost';
    toggle.textContent = 'Cover';

    const panel = document.createElement('div');
    panel.className = 'entity-banner__panel';
    panel.hidden = true;

    const url = document.createElement('input');
    url.type = 'url';
    url.className = 'hub-search__input';
    url.placeholder = 'Paste an image URL';
    url.setAttribute('aria-label', 'Cover image URL');
    url.value = cover?.url?.startsWith('data:') ? '' : (cover?.url ?? '');

    const urlWrap = document.createElement('label');
    urlWrap.className = 'hub-search entity-banner__url';
    urlWrap.append(url);

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.className = 'visually-hidden';
    file.setAttribute('aria-label', 'Upload cover image');

    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'btn btn--secondary';
    upload.textContent = 'Upload';
    upload.addEventListener('click', () => file.click());

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn--ghost';
    clear.textContent = 'Remove';
    clear.addEventListener('click', () => {
      url.value = '';
      save(null);
    });

    url.addEventListener('change', () => {
      const next = url.value.trim();
      save(next ? { url: next } : null);
      setOpen(false);
    });
    file.addEventListener('change', () => {
      const picked = file.files?.[0];
      file.value = '';
      if (!picked) return;
      void readFileAsDataUrl(picked).then(
        (dataUrl) => save({ url: dataUrl }),
        () => undefined
      );
    });

    const setOpen = (open: boolean) => {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      setOpen(panel.hidden);
    });

    const actions = document.createElement('div');
    actions.className = 'entity-banner__actions';
    actions.append(upload, clear);
    panel.append(urlWrap, actions);
    edit.append(toggle, panel);
    banner.append(edit);
  }

  paint();
  host.replaceChildren(banner);

  return {
    dispose() {
      host.replaceChildren();
    },
    update(next) {
      if (typeof next.title === 'string') title = next.title;
      if ('cover' in next) cover = readCover(next.cover);
      paint();
    }
  };
}
