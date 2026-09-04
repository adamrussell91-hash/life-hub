import { appendHubSwitcher, hubSwitcherHost } from '../../../../packages/hub-switcher.js';
import { withAppBase } from '@/app/base-path';
import { createSkipLink } from '@/app/failure';
import { registerHubUtilities } from '@/teacher/hub-utilities';
import { syncTeachingMobileChrome } from '@/teacher/mobile-chrome';

export interface TeacherShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  main: HTMLElement;
  contextBar: HTMLElement;
  canvas: HTMLElement;
  logoutButton: HTMLButtonElement | null;
}

export interface TeacherShellOptions {
  onLogout?: () => void | Promise<void>;
}

const SIGN_OUT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1" />
    <path d="M15 12H3" />
    <path d="m7 8-4 4 4 4" />
  </svg>
`.trim();

/**
 * Builds the teacher chrome (rail / main / context bar / canvas) and returns
 * references to the mount points callers render into. Replaces any existing
 * content in `root`.
 */
export function renderTeacherShell(
  root: HTMLElement,
  options: TeacherShellOptions = {}
): TeacherShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'teacher-layout';

  const rail = document.createElement('nav');
  rail.className = 'teacher-layout__rail hub-rail';
  rail.setAttribute('aria-label', 'Curriculum navigation');

  const brandRow = document.createElement('div');
  brandRow.className = 'teacher-layout__rail-brand-row';

  const brand = document.createElement('a');
  brand.className = 'teacher-layout__rail-brand hub-rail__brand';
  brand.href = withAppBase('/');
  brand.textContent = 'Teaching Hub';

  const railNav = document.createElement('div');
  railNav.className = 'teacher-layout__rail-nav';
  railNav.id = 'teacher-rail-nav';

  brandRow.append(brand);

  rail.append(brandRow, railNav);

  const main = document.createElement('div');
  main.className = 'teacher-layout__main';
  main.id = 'teacher-main';

  const contextBar = document.createElement('div');
  contextBar.className = 'teacher-layout__context-bar';
  contextBar.hidden = true;

  const canvas = document.createElement('div');
  canvas.className = 'teacher-layout__canvas';

  let logoutButton: HTMLButtonElement | null = null;
  if (options.onLogout) {
    const utilities = document.createElement('div');
    utilities.className = 'hub-utilities';

    logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'hub-icon-btn';
    logoutButton.setAttribute('aria-label', 'Sign out');
    logoutButton.title = 'Sign out';
    logoutButton.dataset.hubSignOut = '';
    logoutButton.innerHTML = SIGN_OUT_ICON;
    logoutButton.addEventListener('click', () => {
      if (!logoutButton) return;
      logoutButton.disabled = true;
      void Promise.resolve(options.onLogout?.()).finally(() => {
        if (logoutButton) logoutButton.disabled = false;
      });
    });

    utilities.append(logoutButton);
    registerHubUtilities(utilities);
  } else {
    registerHubUtilities(null);
  }

  main.append(contextBar, canvas);

  layout.append(rail, main);
  root.append(createSkipLink('teacher-main'), layout);
  // Phone chrome must mount even when curriculum load fails (rail stays empty).
  syncTeachingMobileChrome(root, 'home');

  return { root, rail, railNav, main, contextBar, canvas, logoutButton };
}

export interface ContextBarConfig {
  title: string;
  /** Placeholder text for the save-state indicator; wired up fully in Task 15. */
  saveState?: string;
  /** Optional breadcrumb above the title (class · unit). */
  crumb?: string;
  /** Editor chrome: stacked title + save status, actions on the right. */
  variant?: 'default' | 'editor';
}

/**
 * Renders the context bar title + a stable save-state slot. Task 15's
 * save/publish controls locate the slot via `[data-save-slot]`.
 */
export function renderContextBar(refs: TeacherShellRefs, config: ContextBarConfig): void {
  refs.contextBar.hidden = false;
  refs.contextBar.replaceChildren();
  refs.contextBar.classList.toggle(
    'teacher-layout__context-bar--editor',
    config.variant === 'editor'
  );

  const left = document.createElement('div');
  left.className = 'teacher-layout__context-bar-left';

  const crumb = document.createElement('p');
  crumb.className = 'teacher-layout__context-bar-crumb';
  crumb.hidden = !config.crumb;
  crumb.textContent = config.crumb ?? '';

  const title = document.createElement('h1');
  title.className = 'teacher-layout__context-bar-title';
  title.textContent = config.title;

  const saveSlot = document.createElement('span');
  saveSlot.className = 'teacher-layout__context-bar-save-slot';
  saveSlot.dataset.saveSlot = 'true';
  saveSlot.textContent = config.saveState ?? '';

  left.append(crumb, title, saveSlot);
  refs.contextBar.append(left);
}

/** Renders a lightweight status line into the rail nav mount point. */
export function renderRailStatus(railNav: HTMLElement, text: string): void {
  railNav.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__rail-status';
  status.textContent = text;
  railNav.append(status);
  appendHubSwitcher(hubSwitcherHost(railNav), 'teaching');
}

/** Renders a lightweight status line into the canvas mount point. */
export function renderCanvasStatus(canvas: HTMLElement, text: string): void {
  canvas.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = text;
  canvas.append(status);
}
