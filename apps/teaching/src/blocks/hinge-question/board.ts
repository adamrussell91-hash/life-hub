import { button, el } from '@/blocks/peer-feedback-ui';
import { LETTERS, formatSeconds, percent, secondsLeft } from './shared';

/**
 * The projector view: the question, the answer letters and how many have
 * answered. After reveal, the bars and the right answer. Never the
 * misconception notes or the teacher's next step.
 */

export type BoardView = {
  prompt: string;
  options: Array<{ id: string; text: string }>;
  open: boolean;
  closes_at: string | null;
  revealed: boolean;
  correct_id: string;
  answered: number;
  picks: Record<string, number>;
};

export function openBoard(first: BoardView, onClose: () => void): { update: (view: BoardView) => void; close: () => void } {
  const overlay = el('div', 'pf-board hq-board');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Hinge question on the board');
  const prompt = el('p', 'hq-board__prompt');
  const list = el('ol', 'hq-board__options');
  const foot = el('p', 'hq-board__foot');
  foot.setAttribute('aria-live', 'polite');
  const closeBtn = button('Close', 'secondary', () => close());
  overlay.append(prompt, list, foot, closeBtn);

  let view = first;
  let painted = '';
  const timer = window.setInterval(() => paintFoot(), 1000);

  function paintFoot(): void {
    const left = view.open ? secondsLeft(view.closes_at) : null;
    const count = `${view.answered} answered`;
    foot.textContent = view.revealed ? count : view.open ? (left === null ? count : `${count} · ${formatSeconds(left)}`) : `${count} · Answers closed`;
  }

  function paint(): void {
    const sig = JSON.stringify([view.prompt, view.options, view.revealed, view.correct_id, view.revealed ? view.picks : null]);
    if (sig !== painted) {
      painted = sig;
      prompt.textContent = view.prompt;
      overlay.classList.toggle('hq-board--revealed', view.revealed);
      list.replaceChildren(
        ...view.options.map((o, i) => {
          const right = view.revealed && o.id === view.correct_id;
          const li = el('li', 'hq-board__option');
          li.dataset.right = String(right);
          li.append(el('span', 'hq-letter hq-letter--lg', LETTERS[i] ?? '?'), el('span', 'hq-board__text', o.text));
          if (view.revealed) {
            const pct = percent(view.picks[o.id] ?? 0, view.answered);
            const bar = el('span', 'hq-bar');
            bar.style.setProperty('--hq-pct', `${pct}%`);
            li.append(bar, el('span', 'hq-board__pct', `${pct}%`));
            if (right) li.append(el('span', 'hq-board__tick', 'Right answer'));
          }
          return li;
        })
      );
    }
    paintFoot();
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  function close(): void {
    window.clearInterval(timer);
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    onClose();
  }
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  paint();
  closeBtn.focus();

  return {
    update: (next) => {
      view = next;
      paint();
    },
    close
  };
}
