/**
 * The badge that says how a mentorship works: the school crest beside
 * "Accreditation mentor", the NSW HALT mark beside the level, or a plain chip.
 * The crest image is the organisation's own, read through the private crest
 * store, so no crest ever ships with the app.
 */

import { crestNode } from '@/components/org-ui';
import type { MentoringBadge } from '@/domain/mentoring-model';

/** What a crest needs from the organisations directory. */
export interface BadgeOrganisation {
  monogram: string;
  logo_key: string | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The two-tone NSW HALT mark, in the association's colours. */
export function haltMark(): HTMLElement {
  const mark = el('span', 'mentor-badge__halt');
  mark.setAttribute('aria-hidden', 'true');
  mark.append(el('span', 'mentor-badge__halt-name', 'HALT'), el('span', 'mentor-badge__halt-state', 'NSW'));
  return mark;
}

export function renderMentoringBadge(
  badge: MentoringBadge,
  organisations: ReadonlyMap<string, BadgeOrganisation> = new Map()
): HTMLElement {
  if (badge.style === 'chip') {
    const chip = el('span', `mentor-chip mentor-chip--${badge.tone}`, badge.label);
    chip.dataset.badge = 'chip';
    return chip;
  }
  const root = el('span', `mentor-badge mentor-badge--${badge.style}`);
  root.dataset.badge = badge.style;
  if (badge.style === 'halt') {
    root.setAttribute('aria-label', `NSW HALT: ${badge.label}`);
    root.append(haltMark(), el('span', 'mentor-badge__label', badge.label));
    return root;
  }
  const org = badge.organisationRef ? organisations.get(badge.organisationRef) : undefined;
  root.append(
    crestNode(org?.monogram ?? null, 'sm', { orgRef: badge.organisationRef, logoKey: org?.logo_key ?? null }),
    el('span', 'mentor-badge__label', badge.label)
  );
  return root;
}
