import { button, el } from '@/journal/story/dom';

export interface InlineWordsOptions {
  /** The block holding the words (or the "Add a line" prompt). The editor takes its place while open. */
  host: HTMLElement;
  text: string;
  /** Saves the new words. Rejects when the save fails; the field then stays open. */
  onSave: (text: string) => Promise<void>;
  /** Told when editing starts and ends, so the page holds off repainting under the keyboard. */
  onEditingChange?: (editing: boolean) => void;
}

export const WORDS_SAVE_FAILED = 'Could not save. Your words are still here. Check your connection and try again.';

/**
 * Edit a moment's words where they stand. Leaving the field or pressing Done
 * saves; Escape puts the old words back. A failed save keeps the field open
 * with the new words in it and says why.
 */
export function openInlineWords(options: InlineWordsOptions): { close(): void } {
  const { host } = options;
  const editor = el('div', 'story-words-edit');
  const bar = el('div', 'story-words-edit__bar');
  const status = el('p', 'story-words-edit__status');
  status.setAttribute('role', 'alert');
  status.hidden = true;
  const done = button('story-words-edit__done', 'Done');
  bar.append(status, done);

  const field = el('textarea', 'story-words-edit__field');
  field.value = options.text;
  field.rows = 1;
  field.setAttribute('aria-label', 'Words for this moment');
  field.placeholder = 'Add a line';
  editor.append(bar, field);

  let closed = false;
  let saving = false;

  const grow = (): void => {
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  };

  function close(): void {
    if (closed) return;
    closed = true;
    editor.remove();
    host.hidden = false;
    options.onEditingChange?.(false);
  }

  async function commit(): Promise<void> {
    if (closed || saving) return;
    const next = field.value.replace(/\s+$/g, '');
    if (next === options.text.replace(/\s+$/g, '')) {
      close();
      return;
    }
    saving = true;
    field.readOnly = true;
    done.disabled = true;
    done.textContent = 'Saving…';
    status.hidden = true;
    try {
      await options.onSave(next.trim());
      close();
    } catch {
      saving = false;
      field.readOnly = false;
      done.disabled = false;
      done.textContent = 'Try again';
      status.hidden = false;
      status.textContent = WORDS_SAVE_FAILED;
    }
  }

  field.addEventListener('input', grow);
  field.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    close();
  });
  // Leaving the field saves. After a failed save the words wait for "Try again".
  field.addEventListener('blur', () => {
    if (status.hidden) void commit();
  });
  // Keep focus in the field while Done is pressed, so blur does not race the click.
  done.addEventListener('pointerdown', (ev) => ev.preventDefault());
  done.addEventListener('click', () => void commit());

  host.hidden = true;
  host.after(editor);
  options.onEditingChange?.(true);
  grow();
  field.focus({ preventScroll: false });
  field.setSelectionRange(field.value.length, field.value.length);

  return { close };
}
