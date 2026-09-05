const MAX_COMPOSER_PX = 160;

function isTouchPrimary() {
  const view = globalThis;
  return Boolean(view.matchMedia?.('(pointer: coarse) and (not (any-pointer: fine))')?.matches);
}

export function autoGrowComposer(input) {
  if (!input || input.tagName !== 'TEXTAREA' && input.tagName !== 'textarea') return;
  input.style.height = 'auto';
  const next = Math.min(input.scrollHeight || 0, MAX_COMPOSER_PX);
  if (next) input.style.height = `${next}px`;
}

export function bindChatComposer(root, { onSend, onStop } = {}) {
  const form = root.querySelector?.('#chat-form');
  const input = root.querySelector?.('#chat-input');
  const stop = root.querySelector?.('#chat-stop');
  if (form && form.dataset.composerBound !== '1') {
    form.dataset.composerBound = '1';
    form.addEventListener('submit', event => {
      event.preventDefault?.();
      const message = input?.value?.trim?.() ?? '';
      if (!message) return;
      if (input) {
        input.value = '';
        autoGrowComposer(input);
      }
      onSend?.(message);
    });
  }
  if (input && input.dataset.composerBound !== '1') {
    input.dataset.composerBound = '1';
    input.addEventListener('input', () => autoGrowComposer(input));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      if (event.isComposing || event.keyCode === 229) return;
      if (event.shiftKey) return;
      if (isTouchPrimary()) return;
      event.preventDefault?.();
      form?.requestSubmit?.() ?? form?.dispatchEvent?.(new Event('submit', { cancelable: true }));
    });
    autoGrowComposer(input);
  }
  if (stop && stop.dataset.composerBound !== '1') {
    stop.dataset.composerBound = '1';
    stop.addEventListener('click', event => {
      event.preventDefault?.();
      onStop?.();
    });
  }
}
