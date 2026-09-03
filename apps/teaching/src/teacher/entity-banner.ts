import type { Cover, Media } from '@/schemas';
import { coverAltText, resolveCoverUrl } from '@/schemas';
import { mountCoverPicker } from '@/teacher/cover-picker';

export interface EntityBannerOptions {
  cover?: Cover | null;
  media: ReadonlyArray<Media>;
  title: string;
  eyebrow?: string;
  entityId: string;
  editable?: boolean;
  onSave?: (cover: Cover | null) => void | Promise<void>;
  /** Compact cinematic cover used on the lesson editor. */
  size?: 'banner' | 'hero';
  /** No-cover fill: per-entity hue, or the locked marine/depth wash. */
  fallback?: 'hue' | 'marine';
  editButtonClass?: string;
}

export const MARINE_COVER_GRADIENT =
  'radial-gradient(520px 320px at 88% -10%, rgba(55,111,183,0.35), transparent 60%), linear-gradient(155deg, var(--marine), var(--depth) 70%)';

export interface EntityBannerUpdate {
  cover?: Cover | null;
  title?: string;
  eyebrow?: string;
  /** Late-arriving library; a `media_id` cover can only resolve once it lands. */
  media?: ReadonlyArray<Media>;
}

export interface EntityBannerHandle {
  dispose: () => void;
  update: (next: EntityBannerUpdate) => void;
}

/** Deterministic hue (0–359) from an entity id for no-cover banners. */
export function bannerHueFromEntityId(id: string): number {
  return [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
}

export function gradientForEntityId(id: string): string {
  const hue = bannerHueFromEntityId(id);
  return `linear-gradient(135deg, hsl(${hue} 32% 26%) 0%, hsl(${(hue + 38) % 360} 38% 17%) 100%)`;
}

const SCRIM_GRADIENT =
  'linear-gradient(to top, rgba(10,21,54,.82) 0%, rgba(10,21,54,.35) 45%, transparent 100%)';

/**
 * Read-first entity cover banner (class page hero). Edit controls live in a
 * dialog via `mountCoverPicker` — not inline in the reading view.
 */
export function renderEntityBanner(
  host: HTMLElement,
  options: EntityBannerOptions
): EntityBannerHandle {
  let current: Cover | null = options.cover ?? null;
  let titleText = options.title;
  let eyebrowText = options.eyebrow;
  let media = options.media;
  let dialog: HTMLDialogElement | null = null;
  let pickerDispose: (() => void) | null = null;
  let dialogClosed = true;

  const root = document.createElement('div');
  root.className = options.size === 'hero' ? 'entity-banner entity-banner--hero' : 'entity-banner';
  if (options.size !== 'hero') {
    root.style.aspectRatio = '16 / 5';
  }
  root.style.borderRadius = options.size === 'hero' ? 'var(--radius-lg)' : 'var(--radius-xl)';
  root.style.overflow = 'hidden';
  root.style.position = 'relative';

  const resolvedUrl = (): string | undefined => resolveCoverUrl(current ?? undefined, media);

  const paint = (): void => {
    root.replaceChildren();

    const url = resolvedUrl();
    if (url) {
      const img = document.createElement('img');
      img.className = 'entity-banner__image';
      img.src = url;
      img.alt = coverAltText(current, titleText);
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.display = 'block';
      root.append(img);
    } else {
      // setAttribute keeps hsl() gradients that happy-dom's style setter drops
      const fallback = document.createElement('div');
      fallback.className = 'entity-banner__fallback';
      fallback.setAttribute(
        'style',
        `position:absolute;inset:0;background:${
          options.fallback === 'marine' ? MARINE_COVER_GRADIENT : gradientForEntityId(options.entityId)
        }`
      );
      root.append(fallback);
    }

    const scrim = document.createElement('div');
    scrim.className = 'entity-banner__scrim';
    scrim.setAttribute(
      'style',
      [
        `background:${SCRIM_GRADIENT}`,
        'position:absolute',
        'inset:0',
        'display:flex',
        'flex-direction:column',
        'justify-content:flex-end',
        'padding:var(--space-4) var(--space-5)',
        'pointer-events:none'
      ].join(';')
    );

    if (eyebrowText) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'entity-banner__eyebrow';
      eyebrow.textContent = eyebrowText;
      scrim.append(eyebrow);
    }

    const title = document.createElement(options.size === 'hero' ? 'p' : 'h1');
    title.className = 'entity-banner__title';
    title.textContent = titleText;
    if (options.size === 'hero') title.setAttribute('aria-hidden', 'true');
    scrim.append(title);

    root.append(scrim);

    if (options.editable) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className =
        options.editButtonClass ?? 'entity-banner__edit btn btn--secondary';
      editBtn.textContent = 'Change cover';
      editBtn.addEventListener('click', () => {
        openCoverDialog();
      });
      root.append(editBtn);
    }
  };

  /**
   * Text-only refresh. Title edits arrive one keystroke at a time, and a
   * repaint there would rebuild the image and the focused edit button.
   */
  const patchText = (): void => {
    const title = root.querySelector('.entity-banner__title');
    if (title) title.textContent = titleText;

    const eyebrow = root.querySelector('.entity-banner__eyebrow');
    if (eyebrow && eyebrowText) eyebrow.textContent = eyebrowText;

    const img = root.querySelector<HTMLImageElement>('.entity-banner__image');
    if (img) img.alt = coverAltText(current, titleText);
  };

  /**
   * Repainting detaches the button the dialog would restore focus to, so the
   * save path has to move focus onto the freshly rendered trigger itself.
   */
  const focusEditButton = (): void => {
    root.querySelector<HTMLButtonElement>('.entity-banner__edit')?.focus();
  };

  const closeCoverDialog = (): void => {
    if (dialogClosed) return;
    dialogClosed = true;
    pickerDispose?.();
    pickerDispose = null;
    if (dialog) {
      const el = dialog;
      dialog = null;
      if (el.open) el.close();
      el.remove();
    }
  };

  const openCoverDialog = (): void => {
    closeCoverDialog();
    dialogClosed = false;

    const next = document.createElement('dialog');
    next.className = 'entity-banner__dialog';
    next.setAttribute('aria-label', 'Change cover');

    const heading = document.createElement('h2');
    heading.className = 'entity-banner__dialog-title';
    heading.textContent = 'Change cover';

    const pickerHost = document.createElement('div');
    pickerHost.className = 'entity-banner__dialog-picker';

    const footer = document.createElement('div');
    footer.className = 'entity-banner__dialog-footer';

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn btn--ghost';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => {
      closeCoverDialog();
    });
    footer.append(doneBtn);

    next.append(heading, pickerHost, footer);
    document.body.append(next);
    dialog = next;

    const picker = mountCoverPicker(pickerHost, {
      cover: current,
      media,
      titleFallback: titleText,
      editable: true,
      onSave: async (cover) => {
        await options.onSave?.(cover);
        current = cover;
        closeCoverDialog();
        paint();
        focusEditButton();
      }
    });
    pickerDispose = picker.dispose;

    next.addEventListener('close', () => {
      closeCoverDialog();
    });

    next.showModal();
  };

  paint();
  host.replaceChildren(root);

  return {
    update: (next) => {
      const previousUrl = resolvedUrl();
      const hadEyebrow = Boolean(eyebrowText);

      if ('cover' in next) current = next.cover ?? null;
      if (next.media) media = next.media;
      if (next.title !== undefined) titleText = next.title;
      if (next.eyebrow !== undefined) eyebrowText = next.eyebrow;

      // Only a different image, or an eyebrow arriving/leaving, changes the
      // element structure; everything else is text the current nodes can hold.
      if (previousUrl !== resolvedUrl() || hadEyebrow !== Boolean(eyebrowText)) {
        paint();
        return;
      }
      patchText();
    },
    dispose: () => {
      closeCoverDialog();
      host.replaceChildren();
    }
  };
}
