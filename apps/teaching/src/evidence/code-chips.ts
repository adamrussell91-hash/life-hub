import type { FeedbackCode } from '@/blocks/feedback-codes';
import { el } from '@/quiz/dom';
import './views/insight.css';

export type CodeChipsOptions = { codes: readonly FeedbackCode[]; selected: readonly string[]; onChange: (ids: string[]) => void };

/**
 * One tap per reason marks were lost, from the teacher's own feedback codes.
 * Composition codes show first; Viva and Speaking sit behind More codes.
 */
export function codeChips(o: CodeChipsOptions): HTMLElement {
  const root = el('div', 'ev-chips');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Why marks were lost');
  let picked = [...o.selected];
  let more = false;
  const paint = (): void => {
    const shown = o.codes.filter((c) => !c.hidden && (more || c.group === 'composition' || picked.includes(c.id)));
    const chips = shown.map((c) => {
      const b = el('button', 'ev-chip', c.code);
      b.type = 'button';
      b.title = c.descriptor;
      b.setAttribute('aria-pressed', String(picked.includes(c.id)));
      b.dataset.code = c.id;
      b.addEventListener('click', () => {
        picked = picked.includes(c.id) ? picked.filter((id) => id !== c.id) : [...picked, c.id];
        o.onChange(picked);
        paint();
        // The repaint swaps the buttons, so keep keyboard focus on this chip.
        [...root.querySelectorAll<HTMLButtonElement>('.ev-chip')].find((x) => x.dataset.code === c.id)?.focus();
      });
      return b;
    });
    root.replaceChildren(...chips);
    if (!more && o.codes.some((c) => !c.hidden && c.group !== 'composition' && !picked.includes(c.id))) {
      const b = el('button', 'ev-chips__more', 'More codes');
      b.type = 'button';
      b.addEventListener('click', () => {
        more = true;
        paint();
      });
      root.append(b);
    }
  };
  paint();
  return root;
}
