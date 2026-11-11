import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCodeField, spacedCode } from '@/games/live/code-field';

function setup() {
  const onChange = vi.fn();
  const onComplete = vi.fn();
  const field = createCodeField({ onChange, onComplete });
  document.body.append(field.root);
  const boxes = [...field.root.querySelectorAll<HTMLInputElement>('.gl-code__box')];
  const type = (i: number, text: string) => {
    boxes[i].value = text;
    boxes[i].dispatchEvent(new Event('input', { bubbles: true }));
  };
  const key = (i: number, k: string) => boxes[i].dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const paste = (i: number, text: string) => {
    const e = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData(): string } };
    Object.defineProperty(e, 'clipboardData', { value: { getData: () => text } });
    boxes[i].dispatchEvent(e);
    return e;
  };
  return { field, boxes, type, key, paste, onChange, onComplete };
}

afterEach(() => document.body.replaceChildren());

describe('live code field (R4)', () => {
  it('has six numeric boxes the phone opens a number pad for', () => {
    const { boxes } = setup();
    expect(boxes).toHaveLength(6);
    for (const b of boxes) {
      expect(b.inputMode).toBe('numeric');
      expect(b.pattern).toBe('[0-9]*');
      expect(b.getAttribute('aria-label')).toMatch(/^Digit \d of 6$/);
    }
    expect(boxes[0].autocomplete).toBe('one-time-code');
  });

  it('moves to the next box on each digit and ignores letters', () => {
    const { boxes, type, field, onComplete } = setup();
    boxes[0].focus();
    type(0, '4');
    expect(document.activeElement).toBe(boxes[1]);
    type(1, 'x');
    expect(boxes[1].value).toBe('');
    expect(document.activeElement).toBe(boxes[1]);
    '82913'.split('').forEach((d, k) => type(k + 1, d));
    expect(field.value()).toBe('482913');
    expect(field.complete()).toBe(true);
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('fills every box from a pasted code, with or without a space', () => {
    const { boxes, paste, field } = setup();
    const e = paste(3, '482 913');
    expect(e.defaultPrevented).toBe(true);
    expect(field.value()).toBe('482913');
    expect(document.activeElement).toBe(boxes[5]);
    // Autofill or a paste the browser drops into one box spreads the same way.
    const two = setup();
    two.type(0, '135791');
    expect(two.field.value()).toBe('135791');
  });

  it('Backspace clears the box, then steps back on an empty one', () => {
    const { boxes, key, field } = setup();
    field.set('482913');
    boxes[5].focus();
    key(5, 'Backspace');
    expect(field.value()).toBe('48291');
    expect(document.activeElement).toBe(boxes[5]);
    key(5, 'Backspace');
    expect(field.value()).toBe('4829');
    expect(document.activeElement).toBe(boxes[4]);
    key(4, 'ArrowLeft');
    expect(document.activeElement).toBe(boxes[3]);
    key(3, 'ArrowRight');
    expect(document.activeElement).toBe(boxes[4]);
  });

  it('marks a wrong code and clears the mark on the next change', () => {
    const { field, type } = setup();
    field.invalid(true);
    expect(field.root.classList.contains('is-invalid')).toBe(true);
    type(0, '1');
    expect(field.root.classList.contains('is-invalid')).toBe(false);
    expect(spacedCode('482913')).toBe('482 913');
  });
});
