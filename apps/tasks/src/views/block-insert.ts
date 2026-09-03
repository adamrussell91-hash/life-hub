import type { InsertMenuValue } from '@/blocks/create-block';
import {
  taskPaletteFamilies,
  type PaletteBlockCard,
  type PaletteFamily
} from '@/teacher/lesson-canvas/palette-catalog';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderCard(card: PaletteBlockCard): HTMLButtonElement {
  const button = el('button', 'lesson-palette__card') as HTMLButtonElement;
  button.type = 'button';
  button.dataset.blockType = card.type;

  const icon = document.createElement('img');
  icon.className = 'lesson-palette__card-icon';
  icon.src = card.iconSrc;
  icon.alt = '';
  icon.onerror = () => {
    const fallback = el('span', 'lesson-palette__card-icon', card.title.slice(0, 1));
    icon.replaceWith(fallback);
  };

  const title = el('span', 'lesson-palette__card-title', card.title);
  const desc = el('span', 'lesson-palette__card-desc', card.description);
  const body = el('span', 'lesson-palette__card-copy');
  body.append(title, desc);
  button.append(icon, body);
  return button;
}

export type BlockInsertHandle = {
  open(): void;
  close(): void;
  dispose(): void;
};

export function mountBlockInsert(
  host: HTMLElement,
  options: {
    families?: PaletteFamily[];
    onInsert: (type: InsertMenuValue) => void;
  }
): BlockInsertHandle {
  const families = options.families ?? taskPaletteFamilies();
  host.classList.add('page-editor__add');

  const plus = el('button', 'page-editor__add-btn', '+') as HTMLButtonElement;
  plus.type = 'button';
  plus.setAttribute('aria-label', 'Add a block');
  plus.setAttribute('aria-haspopup', 'dialog');
  plus.setAttribute('aria-expanded', 'false');

  let menu: HTMLElement | null = null;

  function close(): void {
    menu?.remove();
    menu = null;
    plus.setAttribute('aria-expanded', 'false');
  }

  function open(): void {
    if (menu) {
      close();
      return;
    }
    menu = el('div', 'page-editor__insert');
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Insert a block');

    for (const family of families) {
      const section = el('section', 'page-editor__insert-family');
      section.append(el('h3', 'page-editor__insert-label', family.id));
      for (const card of family.cards) {
        if (card.kind !== 'block') continue;
        const button = renderCard(card);
        button.addEventListener('click', () => {
          options.onInsert(card.type);
          close();
        });
        section.append(button);
      }
      menu.append(section);
    }

    host.append(menu);
    plus.setAttribute('aria-expanded', 'true');
  }

  function onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Node && !host.contains(target)) close();
  }

  function onDocumentKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  plus.addEventListener('click', (event) => {
    event.stopPropagation();
    open();
  });
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKey);
  host.append(plus);

  return {
    open,
    close,
    dispose() {
      close();
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKey);
      host.replaceChildren();
      host.classList.remove('page-editor__add');
    }
  };
}
