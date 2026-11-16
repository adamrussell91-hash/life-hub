import { el } from '@/blocks/peer-feedback-ui';
import { paceOf, type HingeContent } from './shared';

/**
 * A gated hinge outside a lecture: everything after it on the student's page
 * stays hidden until that student finishes the question. It hides the page,
 * not the data, so it paces students rather than keeping a secret.
 */

/** Fired (bubbling) by an independent hinge once the student has finished it. */
export const HINGE_DONE = 'hinge:done';
/** Fired on the gated container whenever a gate hides or shows part of the page. */
export const GATE_CHANGE = 'lesson:gate-change';
export type HingeDoneDetail = { blockId: string };

/** On a plain lesson the gate is opt-in: independent pace and ticked. */
export function gatesRest(content: Pick<HingeContent, 'pace' | 'gate'>): boolean {
  return paceOf(content as HingeContent) === 'independent' && content.gate === true;
}

export function emitHingeDone(from: HTMLElement, blockId: string): void {
  from.dispatchEvent(new CustomEvent<HingeDoneDetail>(HINGE_DONE, { bubbles: true, detail: { blockId } }));
}

/** Ids of every gated hinge, at any depth (sections, columns, tabs). */
export function gatedHingeIds(blocks: unknown): string[] {
  const ids: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const b = node as { id?: unknown; block_type?: unknown; content?: unknown };
    if (b.block_type === 'hinge_question' && typeof b.id === 'string' && b.content && gatesRest(b.content as HingeContent)) ids.push(b.id);
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  };
  walk(blocks);
  return ids;
}

/** True while some gate is hiding this element or one of its ancestors. */
export function isGatedAway(node: Element | null): boolean {
  return !!node?.closest('[data-gated-by]');
}

/**
 * Hides what follows each gated hinge inside `container` (later blocks in its
 * section or column, then the rest of the page), and shows it again when the
 * hinge reports the student has finished. Gates stack: a block stays hidden
 * while any gate above it is still closed.
 */
export function applyHingeGates(container: HTMLElement, blocks: unknown): void {
  const ids = gatedHingeIds(blocks);
  if (!ids.length) return;
  const changed = () => container.dispatchEvent(new CustomEvent(GATE_CHANGE, { bubbles: true }));
  const notes = new Map<string, HTMLElement>();

  const hideAfter = (wrapper: HTMLElement, id: string) => {
    let node: HTMLElement | null = wrapper;
    while (node && node !== container) {
      for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
        if (!(sib instanceof HTMLElement) || sib.classList.contains('hq-gate-note')) continue;
        const by = new Set((sib.dataset.gatedBy ?? '').split(' ').filter(Boolean));
        // Something hidden for its own reasons stays hidden when the gate opens.
        if (!by.size && sib.hidden) sib.dataset.gateKeptHidden = '';
        by.add(id);
        sib.dataset.gatedBy = [...by].join(' ');
        sib.hidden = true;
      }
      node = node.parentElement;
    }
  };

  const open = (id: string) => {
    notes.get(id)?.remove();
    notes.delete(id);
    let any = false;
    for (const node of container.querySelectorAll<HTMLElement>('[data-gated-by]')) {
      const by = node.dataset.gatedBy!.split(' ').filter((x) => x && x !== id);
      if (by.length === node.dataset.gatedBy!.split(' ').filter(Boolean).length) continue;
      any = true;
      if (by.length) node.dataset.gatedBy = by.join(' ');
      else {
        delete node.dataset.gatedBy;
        if ('gateKeptHidden' in node.dataset) delete node.dataset.gateKeptHidden;
        else node.hidden = false;
      }
    }
    if (any) changed();
  };

  for (const id of ids) {
    const wrapper = container.querySelector<HTMLElement>(`.block[data-block-id="${CSS.escape(id)}"]`);
    if (!wrapper) continue;
    hideAfter(wrapper, id);
    const note = el('p', 'hq-gate-note block-secondary', 'Finish the question above and the rest of the lesson opens.');
    wrapper.after(note);
    notes.set(id, note);
  }
  container.addEventListener(HINGE_DONE, (event) => {
    const id = (event as CustomEvent<HingeDoneDetail>).detail?.blockId;
    if (id && notes.has(id)) open(id);
  });
  changed();
}
