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
  const attachBtn = root.querySelector?.('#chat-attach');
  const attachInput = root.querySelector?.('#chat-attach-input');
  const attachList = root.querySelector?.('#chat-attach-list');
  /** @type {import('../../../packages/design-kit/js/hub-chat-attachments.js').HubChatAttachment[]} */
  let pendingAttachments = [];

  async function refreshAttachList() {
    if (!attachList) return;
    attachList.replaceChildren();
    for (const item of pendingAttachments) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chat-attach-chip';
      chip.textContent = item.name;
      chip.title = 'Remove attachment';
      chip.addEventListener('click', () => {
        pendingAttachments = pendingAttachments.filter(entry => entry.id !== item.id);
        void refreshAttachList();
      });
      attachList.append(chip);
    }
    attachList.hidden = pendingAttachments.length === 0;
  }

  if (attachBtn && attachInput && attachBtn.dataset.composerBound !== '1') {
    attachBtn.dataset.composerBound = '1';
    attachBtn.addEventListener('click', () => attachInput.click());
    attachInput.addEventListener('change', async () => {
      const files = [...(attachInput.files || [])];
      attachInput.value = '';
      if (!files.length) return;
      const { fileToChatAttachment } = await import('../../../packages/design-kit/js/hub-chat-attachments.js');
      for (const file of files.slice(0, 3)) {
        try {
          pendingAttachments.push(await fileToChatAttachment(file));
        } catch {
          /* skip unreadable */
        }
      }
      pendingAttachments = pendingAttachments.slice(-3);
      void refreshAttachList();
    });
  }

  if (form && form.dataset.composerBound !== '1') {
    form.dataset.composerBound = '1';
    form.addEventListener('submit', event => {
      event.preventDefault?.();
      const message = input?.value?.trim?.() ?? '';
      if (!message && !pendingAttachments.length) return;
      const attachments = pendingAttachments.slice();
      pendingAttachments = [];
      void refreshAttachList();
      if (input) {
        input.value = '';
        autoGrowComposer(input);
      }
      onSend?.(message || 'Please look at the attached file.', attachments);
    });
  }
  if (input && input.dataset.composerBound !== '1') {
    input.dataset.composerBound = '1';
    input.addEventListener('input', () => autoGrowComposer(input));
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault?.();
        onStop?.();
        return;
      }
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
    stop.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault?.();
      onStop?.();
    });
  }
}
