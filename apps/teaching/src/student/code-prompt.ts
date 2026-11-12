import { el } from '@/quiz/dom';
import './code-prompt.css';

/**
 * Asks for the student's personal code when their initials are already in on
 * another computer. Resolves with what they typed, or null if they close it.
 * `wrong` shows the message as a problem with the last code.
 */
export function askForCode(message: string, wrong = false): Promise<string | null> {
  return new Promise((resolve) => {
    const back = el('div', 'st-code');
    const box = el('form', 'st-code__box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'st-code-title');
    const title = el('h2', 'st-code__title', 'Type your code');
    title.id = 'st-code-title';
    const said = el('p', `st-code__msg${wrong ? ' is-wrong' : ''}`, message);
    if (wrong) said.setAttribute('role', 'alert');
    const input = el('input', 'st-code__input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.maxLength = 20;
    input.placeholder = 'like apple-42';
    input.setAttribute('aria-label', 'Your code');
    const hint = el('p', 'st-code__hint', 'Your code is on your progress page and in your book. Your teacher has it too.');
    const actions = el('div', 'st-code__actions');
    const go = el('button', 'btn btn--primary', 'Go');
    go.type = 'submit';
    const cancel = el('button', 'btn btn--ghost', 'Cancel');
    cancel.type = 'button';
    actions.append(go, cancel);
    box.append(title, said, input, hint, actions);
    back.append(box);

    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const finish = (value: string | null) => {
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      before?.focus();
      resolve(value);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };
    box.addEventListener('submit', (event) => {
      event.preventDefault();
      const typed = input.value.trim();
      if (typed) finish(typed);
      else input.focus();
    });
    cancel.addEventListener('click', () => finish(null));
    document.addEventListener('keydown', onKey, true);
    document.body.append(back);
    input.focus();
  });
}
