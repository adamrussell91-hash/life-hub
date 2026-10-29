/** Answers are saved on this device only, so every lens and format ends by pointing students to their book or document. */
export const HANDOVER_TEXT = 'Your answer is saved on this device. Copy it into your book or document when you finish.';

export function copyAnswerButton(box: HTMLTextAreaElement, status: HTMLElement): HTMLButtonElement {
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn btn--ghost';
  copy.textContent = 'Copy';
  const fallback = () => { box.select(); status.textContent = 'Select your answer and copy it.'; };
  copy.addEventListener('click', () => {
    const copied = navigator.clipboard?.writeText(box.value);
    if (copied) copied.then(() => { status.textContent = 'Copied.'; }, fallback);
    else fallback();
  });
  return copy;
}
