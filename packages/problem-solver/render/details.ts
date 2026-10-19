// packages/problem-solver/render/details.ts
// Shared by every diagram renderer: the details card that opens under (or beside)
// a shape, one-open-at-a-time disclosure, motion helpers and node ordering.
import type { PsNode } from '../types';
import { skillChip } from '../glyphs';

export type Accent = 'red' | 'yellow' | 'blue';

export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Whether element animation should run at all (never in happy-dom or under reduced motion). */
export function canAnimate(el: Element): boolean {
  return !reducedMotion() && typeof (el as HTMLElement).animate === 'function';
}

/** Cancel every animation still running on an element or anything inside it. */
export function cancelAnimations(root: Element): void {
  const running = typeof root.getAnimations === 'function' ? root.getAnimations({ subtree: true }) : [];
  for (const animation of running) animation.cancel();
}

let uid = 0;
export function nextId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

function objectionNote(doc: Document, node: PsNode): HTMLParagraphElement {
  const note = doc.createElement('p');
  note.className = 'ps-details__note';
  const lead = doc.createElement('strong');
  lead.textContent = 'Coach objected: ';
  const body = doc.createElement('span');
  body.textContent = node.objection ?? '';
  note.append(lead, body);
  return note;
}

export function detailsCard(doc: Document, node: PsNode, accent: Accent, id: string): HTMLDivElement {
  const wrap = doc.createElement('div');
  wrap.className = 'ps-details';
  wrap.id = id;
  const inner = doc.createElement('div');
  inner.className = 'ps-details__inner';
  const card = doc.createElement('div');
  card.className = `ps-details__card ps-details__card--${accent}`;
  const text = doc.createElement('p');
  text.className = 'ps-details__text';
  text.textContent = node.text;
  card.append(text);
  if (node.skills?.length) {
    const skills = doc.createElement('div');
    skills.className = 'ps-details__skills';
    skills.append(...node.skills.map((skill) => skillChip(skill, {}, doc)));
    card.append(skills);
  }
  if (node.state === 'contested') card.append(objectionNote(doc, node));
  inner.append(card);
  wrap.append(inner);
  return wrap;
}

/** The small outlined "Contested" tag shown beside a title. */
export function contestedTag(doc: Document, node: PsNode): HTMLSpanElement {
  const chip = doc.createElement('span');
  chip.className = 'ps-objection';
  chip.textContent = 'Contested';
  chip.title = node.objection ?? '';
  return chip;
}

/** The ", contested" a shape's label carries just before its closing ". Show details" (or list). */
const CONTESTED_LABEL = /(, contested)?(\. Show [^.]+)$/;

/** Add or drop ", contested" in an aria-label of the usual "...: title, contested. Show details" form. */
export function contestedLabel(label: string, contested: boolean): string {
  return label.replace(CONTESTED_LABEL, (_all, _was, tail: string) => `${contested ? ', contested' : ''}${tail}`);
}

function childWithClass(host: Element, className: string): HTMLElement | null {
  return (Array.from(host.children).find((child) => child.classList.contains(className)) as HTMLElement | undefined) ?? null;
}

/**
 * Keep a drawn node's contested marks in step with its state after it was created:
 * the `is-contested` class on `item`, the Contested tag as a child of `tagHost`, the
 * ", contested" in `button`'s aria-label and the coach's note in the details card the
 * button controls. Elements are kept (the tag is only added or removed), so a node
 * that goes accepted -> contested -> accepted ends where it started.
 */
export function syncContested(item: Element, node: PsNode, tagHost: Element | null, button: Element | null = null): void {
  const contested = node.state === 'contested';
  item.classList.toggle('is-contested', contested);
  const doc = item.ownerDocument;
  if (tagHost) {
    const tag = childWithClass(tagHost, 'ps-objection');
    if (contested && !tag) tagHost.append(contestedTag(doc, node));
    else if (contested && tag) tag.title = node.objection ?? '';
    else tag?.remove();
  }
  if (!button) return;
  const label = button.getAttribute('aria-label');
  if (label) {
    const next = contestedLabel(label, contested);
    if (next !== label) button.setAttribute('aria-label', next);
  }
  const id = button.getAttribute('aria-controls');
  // The card may sit in a panel beside the shape, so search from the top of the tree
  // (walked by hand: the view may not be in the document yet).
  let scope: Node = button;
  while (scope.parentNode) scope = scope.parentNode;
  const wrap = id ? (scope as ParentNode).querySelector?.(`[id="${id}"]`) : null;
  const card = wrap?.querySelector('.ps-details__card');
  if (card) syncObjectionNote(card, node);
}

/** Add, refresh or drop the coach's objection note in a `.ps-details__card` to match the node. */
export function syncObjectionNote(card: Element, node: PsNode): void {
  const contested = node.state === 'contested';
  const note = childWithClass(card, 'ps-details__note');
  if (contested && !note) card.append(objectionNote(card.ownerDocument, node));
  else if (contested && note) {
    const body = note.querySelector('span');
    if (body && body.textContent !== (node.objection ?? '')) body.textContent = node.objection ?? '';
  } else note?.remove();
}

export type DisclosureGroup = {
  register(item: HTMLElement, button: HTMLButtonElement): void;
  /** Close whichever item is open. */
  close(): void;
};

/**
 * One open item at a time. Clicking the button toggles its item and closes the others.
 * Escape inside an open item (on its button or in its card) closes it and returns focus to
 * the button. That handler sits on the item and button, so it runs before any renderer
 * handler on an ancestor (the lotus zoom-out on its root); it stops propagation only when
 * it closed something, so the next Escape reaches the renderer. A handler deeper still
 * (the force-field score form) handles its own Escape first and stops it there.
 */
export function createDisclosureGroup(): DisclosureGroup {
  const items = new Map<HTMLElement, HTMLButtonElement>();
  function setOpen(item: HTMLElement, open: boolean): void {
    item.classList.toggle('is-open', open);
    items.get(item)?.setAttribute('aria-expanded', String(open));
  }
  return {
    register(item, button) {
      items.set(item, button);
      button.addEventListener('click', () => {
        const open = !item.classList.contains('is-open');
        for (const other of items.keys()) if (other !== item) setOpen(other, false);
        setOpen(item, open);
      });
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape' || !item.classList.contains('is-open')) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(item, false);
        button.focus({ preventScroll: true });
      };
      item.addEventListener('keydown', onKey);
      if (!item.contains(button)) button.addEventListener('keydown', onKey);
    },
    close() {
      for (const item of items.keys()) if (item.classList.contains('is-open')) setOpen(item, false);
    }
  };
}
