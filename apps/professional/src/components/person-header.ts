/**
 * The profile header: avatar (with the main organisation's crest), name with
 * a warmth dot, one line per current role, a quiet "Met at" line, and only
 * two controls: a pencil (Edit) and the "…" menu.
 */

import { buildPersonMenu, type PersonMenuItem } from '@/components/person-menu';
import type { PersonRole } from '@/domain/person-roles';
import type { WarmthBand } from '@/domain/warmth-score';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const WARMTH_WORD: Record<WarmthBand, string> = { warm: 'Warming', cooling: 'Cooling', cold: 'Cold' };

const PENCIL =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';

export interface PersonHeaderOptions {
  displayName: string;
  warmthBand: WarmthBand;
  warmthTitle: string;
  avatar: HTMLElement;
  currentRoles: PersonRole[];
  crest: (orgRef: string, orgName: string) => HTMLElement;
  /** The identity editor's toggle; restyled here as the pencil. */
  editButton: HTMLButtonElement;
  /** Null hides the menu (the self identity, or an archived person). */
  menuItems: PersonMenuItem[] | null;
  /** Link proposal chips, when any are waiting. */
  chips?: HTMLElement | null;
  /** The archived banner, when archived. */
  banner?: HTMLElement | null;
}

export function renderPersonHeader(options: PersonHeaderOptions): {
  root: HTMLElement;
  setMetLine: (text: string | null) => void;
} {
  const root = el('div', 'people-pane__header person-header');
  root.append(options.avatar);
  const stack = el('div', 'people-pane__header-stack');

  const nameRow = el('div', 'people-pane__name-row');
  nameRow.append(el('h2', 'people-pane__name', options.displayName));
  const warmth = el('span', `person-header__warmth person-header__warmth--${options.warmthBand}`);
  warmth.title = options.warmthTitle;
  warmth.append(el('span', 'person-header__dot'), document.createTextNode(WARMTH_WORD[options.warmthBand]));
  nameRow.append(warmth);

  const controls = el('div', 'person-header__controls');
  const edit = options.editButton;
  edit.className = 'person-icon-btn people-pane__edit';
  edit.innerHTML = PENCIL;
  edit.title = 'Edit';
  controls.append(edit);
  if (options.menuItems?.length) controls.append(buildPersonMenu(options.menuItems));
  nameRow.append(controls);
  stack.append(nameRow);

  if (options.currentRoles.length) {
    const roles = el('ul', 'person-header__roles');
    for (const role of options.currentRoles) {
      const li = el('li', 'person-header__role');
      li.append(options.crest(role.orgRef, role.orgName));
      const text = el('span', 'person-header__role-text');
      if (role.title) text.append(el('span', 'person-header__role-title', role.title), document.createTextNode(', '));
      text.append(el('span', 'person-header__role-org', role.orgName));
      li.append(text);
      roles.append(li);
    }
    stack.append(roles);
  }

  const met = el('p', 'person-header__met');
  met.hidden = true;
  stack.append(met);
  // Always mounted (possibly empty) so late link proposals can swap in.
  if (options.chips) stack.append(options.chips);
  if (options.banner) stack.append(options.banner);
  root.append(stack);

  return {
    root,
    setMetLine: (text) => {
      met.hidden = !text;
      met.textContent = text ?? '';
    }
  };
}

/**
 * "Met at {where} · {date}" from the Add person observation ("Met at X. …"),
 * the earliest one that says it.
 */
export function metLineFrom(observations: Array<{ text: string; occurred_at: string }>, formatDate: (iso: string) => string): string | null {
  const met = observations
    .filter((o) => /^Met at\s+/i.test(o.text))
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))[0];
  if (!met) return null;
  const where = met.text.replace(/^Met at\s+/i, '').split(/\.(\s|$)/)[0]?.trim();
  if (!where) return null;
  const when = formatDate(met.occurred_at);
  return when ? `Met at ${where} · ${when}` : `Met at ${where}`;
}
