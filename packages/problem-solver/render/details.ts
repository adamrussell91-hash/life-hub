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

let uid = 0;
export function nextId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
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
  if (node.state === 'contested') {
    const note = doc.createElement('p');
    note.className = 'ps-details__note';
    const lead = doc.createElement('strong');
    lead.textContent = 'Coach objected: ';
    const body = doc.createElement('span');
    body.textContent = node.objection ?? '';
    note.append(lead, body);
    card.append(note);
  }
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

/** One open item at a time. Clicking the button toggles its item and closes the others. */
export function createDisclosureGroup(): { register(item: HTMLElement, button: HTMLButtonElement): void } {
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
    }
  };
}
