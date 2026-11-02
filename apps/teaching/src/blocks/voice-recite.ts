import { button, el } from '@/blocks/peer-feedback-ui';
import { reciteParts, reciteRounds } from '@/blocks/voice-oracy';

/**
 * Recite practice: read, cover, check, through every part and then the parts
 * together. Nothing is recorded or scored; the student judges how it went.
 */

export type ReciteProgress = { round: number; step: 0 | 1 | 2; ready?: boolean };

const STEPS = ['Read', 'Cover', 'Check'];
const HINTS = ['Read this aloud twice.', 'Say it aloud from memory. Nothing is being recorded.', 'How did it go? Try it again, or move on.'];

/** A saved position still fits after the teacher edits the text. */
export function clampRecite(progress: ReciteProgress | undefined, roundCount: number): ReciteProgress {
  const round = Math.min(Math.max(0, progress?.round ?? 0), Math.max(0, roundCount - 1));
  const step = progress?.round === round && (progress.step === 1 || progress.step === 2) ? progress.step : 0;
  return { round, step, ...(progress?.ready ? { ready: true } : {}) };
}

function textOf(parts: string[], indexes: number[]): HTMLElement {
  const box = el('div', 'voice-recite__text');
  for (const i of indexes) box.append(el('p', 'voice-recite__part-text', parts[i] ?? ''));
  return box;
}

/** The whole text, folded, for between takes. */
export function reciteTextFold(text: string | undefined, label = 'Show the text'): HTMLElement {
  const fold = el('details', 'voice-recite__fold');
  fold.append(el('summary', 'voice-recite__fold-summary', label));
  const parts = reciteParts(text);
  fold.append(textOf(parts, parts.map((_, i) => i)));
  return fold;
}

export function mountRecitePractice(text: string | undefined, saved: ReciteProgress | undefined, save: (progress: ReciteProgress) => void): HTMLElement {
  const parts = reciteParts(text);
  const rounds = reciteRounds(parts.length);
  let progress = clampRecite(saved, rounds.length);
  const root = el('section', 'voice-recite');
  if (!parts.length) {
    root.append(el('p', 'pf-note block-secondary', 'Your teacher has not added the text yet.'));
    return root;
  }

  const move = (next: ReciteProgress) => {
    progress = next;
    save(progress);
    paint();
  };

  function paint(): void {
    const indexes = rounds[progress.round] ?? [];
    const together = indexes.length > 1;
    const last = progress.round >= rounds.length - 1;
    const steps = el('ol', 'voice-recite__steps');
    STEPS.forEach((name, i) => {
      const item = el('li', 'voice-recite__step', name);
      if (i === progress.step) item.setAttribute('aria-current', 'step');
      steps.append(item);
    });
    const title = together ? `Parts 1 to ${indexes.length} together` : `Part ${indexes[0]! + 1} of ${parts.length}`;
    const stage = progress.step === 1 ? el('p', 'voice-recite__covered', 'Covered') : textOf(parts, indexes);
    const actions = el('div', 'pf-actions');
    if (progress.step === 0) {
      actions.append(button('Cover it', 'primary', () => move({ ...progress, step: 1 })));
    } else if (progress.step === 1) {
      actions.append(button('Show it', 'primary', () => move({ ...progress, step: 2 })));
    } else {
      actions.append(button('Try again', 'secondary', () => move({ ...progress, step: 0 })));
      actions.append(
        last
          ? button('Ready to record', 'primary', () => move({ ...progress, ready: true }))
          : button(rounds[progress.round + 1]!.length > 1 ? 'Try them together' : 'Next part', 'primary', () => move({ round: progress.round + 1, step: 0 }))
      );
    }
    root.replaceChildren(el('h4', 'voice-plan__title', title), steps, stage, el('p', 'pf-field__hint block-secondary', HINTS[progress.step]!), actions);
    if (!(progress.step === 2 && last)) {
      root.append(button('I know it: ready to record', 'ghost', () => move({ ...progress, ready: true })));
    }
  }

  paint();
  return root;
}
