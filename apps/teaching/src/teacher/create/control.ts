import type { CurriculumResponse } from '@/teacher/nav';
import { openCreateModal } from '@/teacher/create/modal';
import type { CreateContext, CreateKind, EntityCreatedHandler } from '@/teacher/create/types';

export type { CreateContext, CreateKind } from '@/teacher/create/types';

const MENU_ITEMS: ReadonlyArray<{ kind: CreateKind; label: string }> = [
  { kind: 'class', label: 'Class' },
  { kind: 'subject', label: 'Subject' },
  { kind: 'unit', label: 'Unit' },
  { kind: 'lesson', label: 'Lesson' },
  { kind: 'scope_sequence', label: 'Scope & Sequence' }
];

const CONTEXT_DIRECT: Partial<
  Record<CreateContext, { kind: CreateKind; label: string }>
> = {
  classes: { kind: 'class', label: 'Create class' },
  'scope-sequences': { kind: 'scope_sequence', label: 'New scope' },
  units: { kind: 'unit', label: 'New unit' },
  lessons: { kind: 'lesson', label: 'New lesson' }
};

export function mountCreateControl(
  host: HTMLElement,
  options: {
    context: CreateContext;
    curriculum: CurriculumResponse;
    onCreated: EntityCreatedHandler;
  }
): { dispose: () => void } {
  host.replaceChildren();
  host.classList.add('create-control');

  const openKind = (kind: CreateKind): void => {
    closeMenu();
    openCreateModal({
      kind,
      curriculum: options.curriculum,
      onCreated: options.onCreated
    });
  };

  let menu: HTMLElement | null = null;
  let onDocClick: ((event: MouseEvent) => void) | null = null;

  const closeMenu = (): void => {
    menu?.remove();
    menu = null;
    if (onDocClick) {
      document.removeEventListener('click', onDocClick);
      onDocClick = null;
    }
  };

  const openMenu = (): void => {
    if (menu) {
      closeMenu();
      return;
    }

    menu = document.createElement('div');
    menu.className = 'create-control__menu glass-panel';
    menu.dataset.createMenu = '';
    menu.setAttribute('role', 'menu');

    for (const item of MENU_ITEMS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'create-control__menu-item';
      button.dataset.createKind = item.kind;
      button.setAttribute('role', 'menuitem');
      button.textContent = item.label;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openKind(item.kind);
      });
      menu.append(button);
    }

    host.append(menu);

    onDocClick = (event: MouseEvent): void => {
      if (!host.contains(event.target as Node)) {
        closeMenu();
      }
    };
    // Defer so the opening click does not immediately close the menu.
    window.setTimeout(() => {
      if (onDocClick) document.addEventListener('click', onDocClick);
    }, 0);
  };

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'icon-plus-btn';
  trigger.dataset.createTrigger = '';
  trigger.textContent = '+';

  const direct = CONTEXT_DIRECT[options.context];
  if (direct) {
    trigger.setAttribute('aria-label', direct.label);
    trigger.addEventListener('click', () => openKind(direct.kind));
  } else {
    trigger.setAttribute('aria-label', 'Create');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      openMenu();
    });
  }

  host.append(trigger);

  return {
    dispose: () => {
      closeMenu();
      host.replaceChildren();
      host.classList.remove('create-control');
    }
  };
}
