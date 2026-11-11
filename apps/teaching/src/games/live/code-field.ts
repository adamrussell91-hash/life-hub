import { el } from '@/quiz/dom';

/**
 * The six-box room code field (spec §5.1; approved mockup
 * docs/mockups/games/lobby.html). R4: every box is a 16 px+ numeric input
 * (`inputmode="numeric"`, so iOS shows the number pad and never zooms);
 * typing a digit moves on, Backspace on an empty box goes back, arrows move,
 * and pasting a whole code (with or without a space) fills every box.
 */

export const CODE_LENGTH = 6;

export type CodeField = {
  root: HTMLElement;
  value(): string;
  set(code: string): void;
  clear(): void;
  focus(): void;
  /** True when all six boxes hold a digit. */
  complete(): boolean;
  /** Shake and mark as wrong (a code that isn't running). */
  invalid(on: boolean): void;
};

export function createCodeField(options: { onChange?: (code: string) => void; onComplete?: (code: string) => void; label?: string } = {}): CodeField {
  const root = el('div', 'gl-code');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', options.label ?? 'Game code, six numbers');
  const boxes: HTMLInputElement[] = [];
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const box = el('input', 'gl-code__box');
    box.type = 'text';
    box.inputMode = 'numeric';
    box.pattern = '[0-9]*';
    box.autocomplete = i === 0 ? 'one-time-code' : 'off';
    box.maxLength = CODE_LENGTH; // A paste lands whole; `fill` spreads it.
    box.setAttribute('aria-label', `Digit ${i + 1} of ${CODE_LENGTH}`);
    box.dataset.i = String(i);
    boxes.push(box);
    root.append(box);
  }

  const value = () => boxes.map((b) => b.value).join('');
  const changed = () => {
    const code = value();
    root.classList.remove('is-invalid');
    options.onChange?.(code);
    if (code.length === CODE_LENGTH && /^\d{6}$/.test(code)) options.onComplete?.(code);
  };

  /** Spreads digits from box `from` onward; returns the box after the last one filled. */
  function fill(from: number, digits: string): number {
    let at = from;
    for (const d of digits) {
      if (at >= CODE_LENGTH) break;
      boxes[at].value = d;
      at += 1;
    }
    return at;
  }

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      const digits = box.value.replace(/\D/g, '');
      if (digits.length <= 1) {
        box.value = digits;
        if (digits && i < CODE_LENGTH - 1) boxes[i + 1].focus();
      } else {
        // Typed over a digit, autofill, or a paste the browser put in one box.
        box.value = '';
        const next = digits.length >= CODE_LENGTH ? fill(0, digits.slice(0, CODE_LENGTH)) : fill(i, digits);
        boxes[Math.min(next, CODE_LENGTH - 1)].focus();
      }
      changed();
    });
    box.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') ?? '';
      const digits = text.replace(/\D/g, '');
      if (!digits) return;
      e.preventDefault();
      const start = digits.length >= CODE_LENGTH ? 0 : i;
      const next = fill(start, digits.slice(0, CODE_LENGTH));
      boxes[Math.min(next, CODE_LENGTH - 1)].focus();
      changed();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (box.value) {
          box.value = '';
          changed();
          e.preventDefault();
        } else if (i > 0) {
          boxes[i - 1].value = '';
          boxes[i - 1].focus();
          changed();
          e.preventDefault();
        }
      } else if (e.key === 'ArrowLeft' && i > 0) {
        boxes[i - 1].focus();
        e.preventDefault();
      } else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) {
        boxes[i + 1].focus();
        e.preventDefault();
      }
    });
    box.addEventListener('focus', () => box.select?.());
  });

  return {
    root,
    value,
    set(code: string) {
      boxes.forEach((b) => (b.value = ''));
      fill(0, code.replace(/\D/g, '').slice(0, CODE_LENGTH));
      changed();
    },
    clear() {
      boxes.forEach((b) => (b.value = ''));
      changed();
    },
    focus() {
      const first = boxes.find((b) => !b.value) ?? boxes[CODE_LENGTH - 1];
      first.focus({ preventScroll: true });
    },
    complete: () => /^\d{6}$/.test(value()),
    invalid(on: boolean) {
      root.classList.remove('is-invalid');
      if (on) {
        void root.offsetWidth;
        root.classList.add('is-invalid');
      }
    }
  };
}

/** "482913" → "482 913" for the board. */
export const spacedCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);
