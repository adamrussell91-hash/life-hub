/**
 * Teacher-side text tools in the rich text editor toolbar.
 *
 *   Dictionary scan  Saves word cards on `settings.word_help`. Students see the
 *                    words lit on the published block without waiting.
 *   Fry explainer    Rewrites the block as a Fry explainer. Teacher only. The
 *                    rewrite waits in a preview until the teacher replaces the
 *                    text, and the replace can be undone.
 */
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import type { Block } from '@/schemas/block';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import {
  DICTIONARY_ICON,
  openWordCard,
  readWordHelp,
  wordsPresentIn,
  type WordHelpEntry
} from '@/blocks/word-help';
import { rewriteAsFryExplainer, scanWordsAsTeacher } from '@/blocks/text-tools-client';

type RichTextBlock = Extract<Block, { block_type: 'rich_text' }>;

type TiptapLike = {
  host: HTMLElement;
  getHtml: () => string;
  setHtml: (html: string, emit?: boolean) => void;
};

const FRY_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6l-1 6h-4z"/><path d="M10 8h4v13a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z"/><path d="M5 3l2 2M19 3l-2 2"/></svg>';

function plainText(html: string): string {
  const scratch = document.createElement('div');
  scratch.innerHTML = sanitizeRichTextHtml(html);
  return scratch.textContent ?? '';
}

function toolButton(icon: string, label: string, title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost block-editor__toolbar-btn text-tools-btn';
  button.innerHTML = `${icon}<span>${label}</span>`;
  button.title = title;
  return button;
}

export function createRichTextTools(options: {
  tiptap: TiptapLike;
  getLatest: () => RichTextBlock;
  onChange: (block: RichTextBlock) => void;
  scan?: typeof scanWordsAsTeacher;
  rewrite?: typeof rewriteAsFryExplainer;
}): { buttons: HTMLButtonElement[]; status: HTMLElement; strip: HTMLElement } {
  const scan = options.scan ?? scanWordsAsTeacher;
  const rewrite = options.rewrite ?? rewriteAsFryExplainer;
  const { tiptap } = options;

  const dictionary = toolButton(DICTIONARY_ICON, 'Dictionary scan', 'Highlight challenging words with dictionary cards for students');
  dictionary.dataset.tool = 'dictionary';
  const fry = toolButton(FRY_ICON, 'Fry explainer', 'Rewrite this block as a Fry explainer (teacher only)');
  fry.dataset.tool = 'fry';

  const status = document.createElement('p');
  status.className = 'text-tools-status';
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  const strip = document.createElement('div');
  strip.className = 'word-help-strip';

  let busy = false;

  function say(message: string, tone: 'neutral' | 'error' = 'neutral'): void {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('text-tools-status--error', tone === 'error');
  }

  function setBusy(on: boolean): void {
    busy = on;
    dictionary.disabled = on;
    fry.disabled = on;
    tiptap.host.classList.toggle('word-help-scanning', on);
  }

  function saveWords(words: WordHelpEntry[] | null): void {
    const latest = options.getLatest();
    const settings = { ...(latest.settings ?? {}) } as Record<string, unknown>;
    if (words) settings.word_help = { words, scanned_at: new Date().toISOString() };
    else delete settings.word_help;
    options.onChange({ ...latest, settings });
    paintStrip();
  }

  function paintStrip(): void {
    const saved = readWordHelp(options.getLatest());
    const words = wordsPresentIn(plainText(tiptap.getHtml()), saved);
    strip.replaceChildren();
    strip.hidden = saved.length === 0;
    if (saved.length === 0) return;

    const label = document.createElement('p');
    label.className = 'word-help-strip__label';
    label.textContent =
      words.length === saved.length
        ? `${words.length} ${words.length === 1 ? 'word' : 'words'} lit for students`
        : `${words.length} of ${saved.length} words still in the text. Scan again to refresh.`;
    const chips = document.createElement('div');
    chips.className = 'word-help-strip__chips';
    for (const entry of words) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'word-help-term word-help-strip__chip';
      chip.textContent = entry.word;
      chip.setAttribute('aria-haspopup', 'dialog');
      chip.addEventListener('click', () => openWordCard(chip, entry));
      chips.append(chip);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn--ghost word-help-strip__clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      saveWords(null);
      say('Dictionary words cleared. Students can still run their own scan.');
    });
    strip.append(label, chips, clear);
  }

  dictionary.addEventListener('click', async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    say('Scanning for challenging words…');
    try {
      const words = await scan(tiptap.getHtml());
      saveWords(words);
      say(words.length ? '' : 'No challenging words found in this block.');
    } catch (error) {
      say(error instanceof Error && error.message ? error.message : 'The scan did not finish. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  });

  fry.addEventListener('click', async (event) => {
    event.preventDefault();
    if (busy) return;
    const before = tiptap.getHtml();
    setBusy(true);
    say('Writing a Fry explainer. This takes about half a minute…');
    try {
      const result = await rewrite(before);
      say('');
      openFryReview(result, before, () => {
        const previous = tiptap.getHtml();
        tiptap.setHtml(result.html, true);
        paintStrip();
        if (readWordHelp(options.getLatest()).length) {
          say('Text replaced. Run Dictionary scan again to light the new words.');
        }
        offerTimedUndo({
          message: 'Replaced with a Fry explainer.',
          onUndo: () => {
            tiptap.setHtml(previous, true);
            paintStrip();
            say('');
          }
        });
      });
    } catch (error) {
      say(error instanceof Error && error.message ? error.message : 'The rewrite did not finish. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  });

  paintStrip();
  return { buttons: [dictionary, fry], status, strip };
}

function wordCount(html: string): number {
  return plainText(html).split(/\s+/).filter(Boolean).length;
}

/** Preview before anything changes: Replace or Discard. */
export function openFryReview(
  result: Awaited<ReturnType<typeof rewriteAsFryExplainer>>,
  beforeHtml: string,
  onReplace: () => void
): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'text-tools-review';
  dialog.setAttribute('aria-label', 'Fry explainer');

  const heading = document.createElement('h2');
  heading.textContent = 'Fry explainer';
  const body = document.createElement('div');
  body.className = 'text-tools-review__body';
  const length = document.createElement('p');
  length.className = 'text-tools-review__length';
  length.textContent = `${wordCount(beforeHtml)} words → ${wordCount(result.html)} words`;
  const preview = document.createElement('div');
  preview.className = 'block-rich-text text-tools-review__preview';
  preview.innerHTML = sanitizeRichTextHtml(result.html);
  body.append(length, preview);

  const actions = document.createElement('div');
  actions.className = 'text-tools-review__actions';
  const close = () => {
    dialog.close?.();
    dialog.remove();
  };
  const replace = document.createElement('button');
  replace.type = 'button';
  replace.className = 'btn btn--primary';
  replace.textContent = 'Replace text';
  replace.addEventListener('click', () => {
    close();
    onReplace();
  });
  actions.append(replace);
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn btn--ghost';
  dismiss.textContent = 'Discard';
  dismiss.addEventListener('click', close);
  actions.append(dismiss);
  dialog.addEventListener('cancel', () => dialog.remove());

  dialog.append(heading, body, actions);
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return dialog;
}
