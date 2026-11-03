import { fileToChatAttachment, type HubChatAttachment } from '../../design-kit/js/hub-chat-attachments.js';

/** Clare's Attach button: holds picked files until the next send. */
export function bindChatAttachments(root: ParentNode): { take: () => HubChatAttachment[] } {
  const button = root.querySelector<HTMLButtonElement>('#chat-attach');
  const picker = root.querySelector<HTMLInputElement>('#chat-attach-input');
  const list = root.querySelector<HTMLElement>('#chat-attach-list');
  const field = root.querySelector<HTMLTextAreaElement>('#chat-input');
  let pending: HubChatAttachment[] = [];

  function paint(error = ''): void {
    if (field) field.required = pending.length === 0;
    if (!list) return;
    list.replaceChildren();
    for (const item of pending) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chat-attach-chip';
      chip.textContent = item.name;
      chip.title = 'Remove attachment';
      chip.addEventListener('click', () => {
        pending = pending.filter((entry) => entry.id !== item.id);
        paint();
      });
      list.append(chip);
    }
    if (error) {
      const note = document.createElement('p');
      note.className = 'chat-attach-error';
      note.textContent = error;
      list.append(note);
    }
    list.hidden = pending.length === 0 && !error;
  }

  button?.addEventListener('click', () => picker?.click());
  picker?.addEventListener('change', async () => {
    const files = [...(picker.files ?? [])];
    picker.value = '';
    let error = '';
    for (const file of files) {
      try {
        pending.push(await fileToChatAttachment(file));
      } catch (err) {
        error = err instanceof Error ? err.message : 'Could not attach that file.';
      }
    }
    pending = pending.slice(-3);
    paint(error);
  });

  return {
    take: () => {
      const taken = pending;
      pending = [];
      paint();
      return taken;
    }
  };
}
