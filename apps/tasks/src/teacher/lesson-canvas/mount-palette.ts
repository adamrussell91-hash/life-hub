import type { InsertMenuValue } from '@/blocks/create-block';
import type { PaletteCard, PaletteFamily } from '@/teacher/lesson-canvas/palette-catalog';
import { readBuilderChromePrefs, writeBuilderChromePrefs } from '@/teacher/lesson-canvas/prefs';

function familyIcon(familyId: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const paths: Record<string, string> = {
    Basic:
      '<path d="M4 5h12M4 10h12M4 15h7"/>',
    Media:
      '<rect x="3" y="4" width="14" height="12" rx="1.3"/><circle cx="7.2" cy="8.3" r="1.4"/><path d="M4 14l4-3.6 3 2.2 3.5-4.1 2.5 3"/>',
    Teaching:
      '<rect x="3" y="4" width="14" height="10" rx="1.3"/><path d="M7.5 17h5M10 14v3"/>',
    Learning:
      '<path d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9Z"/><path d="M8 16.5h4"/>',
    Visualisation:
      '<path d="M4 16V9M9 16V4M14 16v-6"/>',
    Layout:
      '<rect x="3" y="3" width="14" height="14" rx="1.3"/><path d="M8.3 3v14"/>',
    Compositions:
      '<rect x="3.5" y="4" width="9" height="6" rx="1"/><rect x="7.5" y="10" width="9" height="6" rx="1"/>'
  };
  svg.innerHTML = paths[familyId] ?? '<circle cx="10" cy="10" r="3"/>';
  return svg;
}

export const PALETTE_DND_MIME = 'application/x-teaching-hub-block';

export type PaletteInsertPayload =
  | { kind: 'block'; type: InsertMenuValue }
  | { kind: 'composition'; id: string };

export type MountLessonPaletteOptions = {
  families: PaletteFamily[];
  onInsert: (payload: PaletteInsertPayload) => void;
  onCompositionChoice?: (id: string, mode: 'copy' | 'linked') => void;
  onDragStart?: () => void;
  onShelved?: (shelved: boolean) => void;
};

export type LessonPaletteHandle = {
  setShelved(shelved: boolean): void;
  updateFamilies(families: PaletteFamily[]): void;
  showCompositionConfirm(id: string): void;
  hideCompositionConfirm(): void;
  dispose(): void;
};

function payloadForCard(card: PaletteCard): PaletteInsertPayload {
  return card.kind === 'block'
    ? { kind: 'block', type: card.type }
    : { kind: 'composition', id: card.id };
}

function renderCard(card: PaletteCard): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'lesson-palette__card';
  if (card.kind === 'block') {
    el.dataset.blockType = card.type;
  } else {
    el.dataset.compositionId = card.id;
  }

  const icon = document.createElement(card.kind === 'block' ? 'img' : 'span');
  icon.className = 'lesson-palette__card-icon';
  if (card.kind === 'block' && icon instanceof HTMLImageElement) {
    icon.src = card.iconSrc;
    icon.alt = '';
    icon.onerror = () => {
      const fallback = document.createElement('span');
      fallback.className = 'lesson-palette__card-icon';
      fallback.textContent = card.title.slice(0, 1);
      icon.replaceWith(fallback);
    };
  } else {
    icon.textContent = card.title.slice(0, 1);
  }

  const title = document.createElement('span');
  title.className = 'lesson-palette__card-title';
  title.textContent = card.title;

  const body = document.createElement('span');
  body.className = 'lesson-palette__card-copy';
  body.append(title);

  if (card.kind === 'block') {
    const desc = document.createElement('span');
    desc.className = 'lesson-palette__card-desc';
    desc.textContent = card.description;
    body.append(desc);
  }

  el.append(icon, body);
  return el;
}

export function mountLessonPalette(
  host: HTMLElement,
  options: MountLessonPaletteOptions
): LessonPaletteHandle {
  host.classList.add('lesson-palette');

  const rail = document.createElement('div');
  rail.className = 'lesson-palette__rail';

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'lesson-palette__tab';
  tab.textContent = 'Blocks';

  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.className = 'lesson-palette__collapse';
  collapse.textContent = 'Hide';
  collapse.title = 'Hide blocks ([)';
  collapse.setAttribute('aria-label', 'Hide blocks');

  let openId: string | null = null;
  let flyout: HTMLElement | null = null;

  function persistShelf(shelved: boolean): void {
    const prefs = readBuilderChromePrefs();
    writeBuilderChromePrefs({ ...prefs, rail: shelved ? 'shelved' : 'open' });
  }

  function hideCompositionConfirm(): void {
    flyout?.querySelector('.lesson-palette__flyout-footer')?.remove();
  }

  function showCompositionConfirm(id: string): void {
    if (!flyout) return;
    hideCompositionConfirm();

    const footer = document.createElement('div');
    footer.className = 'confirm-card lesson-palette__flyout-footer';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'page-header__eyebrow';
    eyebrow.textContent = 'Insert this composition';

    const title = document.createElement('h2');
    title.className = 'page-header__title';
    title.style.fontSize = 'var(--text-lg)';
    title.textContent = 'Keep in sync, or copy?';

    const supporting = document.createElement('p');
    supporting.className = 'page-header__supporting';
    supporting.textContent = 'Linked stays tied to the source. Copy is a snapshot.';

    const actions = document.createElement('div');
    actions.className = 'confirm-card__actions';

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'btn btn--ghost lesson-editor__insert-composition-copy';
    copyButton.textContent = 'Copy';
    copyButton.addEventListener('click', (event) => {
      event.stopPropagation();
      hideCompositionConfirm();
      options.onCompositionChoice?.(id, 'copy');
    });

    const linkedButton = document.createElement('button');
    linkedButton.type = 'button';
    linkedButton.className = 'btn btn--primary lesson-editor__insert-composition-linked';
    linkedButton.textContent = 'Linked';
    linkedButton.addEventListener('click', (event) => {
      event.stopPropagation();
      hideCompositionConfirm();
      options.onCompositionChoice?.(id, 'linked');
    });

    actions.append(copyButton, linkedButton);
    footer.append(eyebrow, title, supporting, actions);
    flyout.append(footer);
  }

  function closeFlyout(): void {
    flyout?.remove();
    flyout = null;
    openId = null;
    syncOpenFamily();
  }

  function syncOpenFamily(): void {
    rail.querySelectorAll<HTMLButtonElement>('.lesson-palette__family').forEach((btn) => {
      btn.classList.toggle('lesson-palette__family--open', btn.dataset.family === openId);
    });
  }

  function bindCard(el: HTMLButtonElement, card: PaletteCard): void {
    const payload = payloadForCard(card);
    el.draggable = true;
    el.addEventListener('click', () => {
      options.onInsert(payload);
    });
    el.addEventListener('dragstart', (event) => {
      const dt = event.dataTransfer;
      if (dt) {
        dt.setData(PALETTE_DND_MIME, JSON.stringify(payload));
        dt.effectAllowed = 'copy';
      }
      host.dataset.dragging = 'true';
      flyout?.classList.add('lesson-palette__flyout--receded');
      options.onDragStart?.();
    });
    el.addEventListener('dragend', () => {
      delete host.dataset.dragging;
      flyout?.classList.remove('lesson-palette__flyout--receded');
    });
  }

  function openFlyout(family: PaletteFamily): void {
    closeFlyout();
    openId = family.id;
    flyout = document.createElement('div');
    flyout.className = 'lesson-palette__flyout';
    flyout.setAttribute('role', 'listbox');
    flyout.setAttribute('aria-label', family.id);

    for (const card of family.cards) {
      const el = renderCard(card);
      bindCard(el, card);
      flyout.append(el);
    }

    host.append(flyout);
    syncOpenFamily();
  }

  function setShelved(shelved: boolean): void {
    host.classList.toggle('lesson-palette--shelved', shelved);
    if (shelved) closeFlyout();
    persistShelf(shelved);
    options.onShelved?.(shelved);
  }

  function renderRail(families: PaletteFamily[]): void {
    rail.replaceChildren();
    for (const family of families) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lesson-palette__family';
      btn.dataset.family = family.id;

      const glyph = document.createElement('span');
      glyph.className = 'lesson-palette__family-icon';
      glyph.append(familyIcon(family.id));

      const label = document.createElement('span');
      label.className = 'lesson-palette__family-label';
      label.textContent = family.id;

      btn.append(glyph, label);

      if (family.disabled) {
        btn.disabled = true;
        btn.style.pointerEvents = 'none';
      } else {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (openId === family.id) closeFlyout();
          else openFlyout(family);
        });
      }

      rail.append(btn);
    }
  }

  renderRail(options.families);

  tab.addEventListener('click', (event) => {
    event.stopPropagation();
    setShelved(false);
  });

  collapse.addEventListener('click', (event) => {
    event.stopPropagation();
    setShelved(true);
  });

  function onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Node && !host.contains(target)) closeFlyout();
  }

  function onDocumentKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeFlyout();
  }

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKey);

  host.append(rail, collapse, tab);

  return {
    setShelved,
    updateFamilies(families: PaletteFamily[]) {
      closeFlyout();
      renderRail(families);
    },
    showCompositionConfirm,
    hideCompositionConfirm,
    dispose() {
      closeFlyout();
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKey);
      host.replaceChildren();
      host.classList.remove('lesson-palette', 'lesson-palette--shelved');
      delete host.dataset.dragging;
    }
  };
}
