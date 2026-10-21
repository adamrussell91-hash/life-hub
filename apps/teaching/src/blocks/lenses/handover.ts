/** Nothing students type is kept, so every lens and format ends by handing the answer over. */
export const HANDOVER_TEXT = 'This page won’t keep your answer. Write it in your book or document now.';

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
