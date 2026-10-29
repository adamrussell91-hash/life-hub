/**
 * Teacher-side text tools in the rich text editor toolbar.
 *
 *   Dictionary scan  Saves word cards on `settings.word_help`. Students see the
 *                    words lit on the published block without waiting. In a
 *                    lesson, words the teacher pins (or types in with Add
 *                    word) sit in the word tray's strip under the text.
 *   Fry explainer    Rewrites the block as a Fry explainer. Teacher only. The
 *                    rewrite waits in a preview until the teacher replaces the
 *                    text, and the replace can be undone.
 *   Technique scan   Finds the Periodic Table techniques in the text. The
 *                    teacher ticks which ones students may get, saved on
 *                    `settings.technique_scan`; the classroom tools' technique
 *                    spinner only lands on those.
 */
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import type { Block } from '@/schemas/block';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import {
  DICTIONARY_ICON,
  readWordHelp,
  wordsPresentIn,
  type WordHelpEntry
} from '@/blocks/word-help';
import { rewriteAsFryExplainer, scanTechniquesAsTeacher, scanWordsAsTeacher } from '@/blocks/text-tools-client';
import { matrixStatus as defaultMatrixStatus, normaliseMatrixWord, type MatrixStatus } from '@/blocks/morphemic-client';
import { loadLiteraryElements } from '@/blocks/literary-elements';
import { approveTechniques, createTechniqueScan, quoteAppearsIn, readTechniqueScan } from '@/blocks/technique-scan';
import { openTechniqueReview } from '@/blocks/technique-review';

type RichTextBlock = Extract<Block, { block_type: 'rich_text' }>;

type TiptapLike = {
  host: HTMLElement;
  getHtml: () => string;
  setHtml: (html: string, emit?: boolean) => void;
};

const TECHNIQUE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9 15.5v-7h3.5a2 2 0 0 1 0 4H9M14 15.5l-2-3"/></svg>';

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
  scanTechniques?: typeof scanTechniquesAsTeacher;
  /** Where a pinned word's morphemic matrix stands; asking starts its build. */
  matrixStatus?: (word: string) => Promise<MatrixStatus>;
}): { buttons: HTMLButtonElement[]; status: HTMLElement; strip: HTMLElement } {
  const scan = options.scan ?? scanWordsAsTeacher;
  const rewrite = options.rewrite ?? rewriteAsFryExplainer;
  const scanTechniques = options.scanTechniques ?? scanTechniquesAsTeacher;
  const askMatrix = options.matrixStatus ?? defaultMatrixStatus;
  const { tiptap } = options;

  const dictionary = toolButton(DICTIONARY_ICON, 'Dictionary scan', 'Highlight challenging words with dictionary cards for students');
  dictionary.dataset.tool = 'dictionary';
  const fry = toolButton(FRY_ICON, 'Fry explainer', 'Rewrite this block as a Fry explainer (teacher only)');
  fry.dataset.tool = 'fry';
  const technique = toolButton(TECHNIQUE_ICON, 'Technique scan', 'Find the literary techniques in this text for the technique spinner');
  technique.dataset.tool = 'techniques';

  const status = document.createElement('p');
  status.className = 'text-tools-status';
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  const strip = document.createElement('div');
  strip.className = 'word-help-strip';
  const wordStrip = document.createElement('div');
  wordStrip.className = 'word-help-strip__part';
  const techniqueStrip = document.createElement('div');
  techniqueStrip.className = 'word-help-strip__part technique-strip';
  strip.append(wordStrip, techniqueStrip);

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
    technique.disabled = on;
    tiptap.host.classList.toggle('word-help-scanning', on);
  }

  function saveWords(words: WordHelpEntry[]): void {
    const latest = options.getLatest();
    const settings = { ...(latest.settings ?? {}) } as Record<string, unknown>;
    if (words.length) {
      const previous = settings.word_help as { scanned_at?: unknown } | undefined;
      settings.word_help = {
        words,
        scanned_at: typeof previous?.scanned_at === 'string' ? previous.scanned_at : new Date().toISOString()
      };
    } else delete settings.word_help;
    options.onChange({ ...latest, settings });
    paintStrip();
  }

  /** A fresh scan keeps the teacher's pins and typed-in words. */
  function mergeScan(scanned: WordHelpEntry[]): WordHelpEntry[] {
    const saved = readWordHelp(options.getLatest());
    const pinned = new Set(saved.filter((entry) => entry.pinned).map((entry) => entry.word.toLowerCase()));
    const added = saved.filter((entry) => entry.added);
    const addedKeys = new Set(added.map((entry) => entry.word.toLowerCase()));
    return [
      ...scanned
        .filter((entry) => !addedKeys.has(entry.word.toLowerCase()))
        .map((entry) => (pinned.has(entry.word.toLowerCase()) ? { ...entry, pinned: true } : entry)),
      ...added
    ];
  }

  // Matrix status per word for the strip's dots. Ready and none are final; building is asked again.
  const matrixStates = new Map<string, MatrixStatus>();
  const MATRIX_DOT_TITLE: Record<MatrixStatus, string> = {
    ready: 'Morphemic matrix ready',
    building: 'Building the morphemic matrix…',
    none: 'No prefix or suffix to build with'
  };

  function matrixDot(word: string): HTMLElement {
    const dot = document.createElement('span');
    dot.className = 'word-help-strip__dot';
    dot.setAttribute('aria-hidden', 'true');
    const key = normaliseMatrixWord(word);
    const paint = (state: MatrixStatus) => {
      dot.dataset.state = state;
      dot.title = MATRIX_DOT_TITLE[state];
    };
    if (!key) {
      paint('none');
      return dot;
    }
    const known = matrixStates.get(key);
    if (known && known !== 'building') {
      paint(known);
      return dot;
    }
    paint('building');
    let tries = 0;
    const ask = () => {
      void askMatrix(word).then((state) => {
        matrixStates.set(key, state);
        if (!dot.isConnected && tries > 0) return;
        paint(state);
        if (state === 'building' && tries < 60) {
          tries += 1;
          setTimeout(ask, 3000);
        }
      });
    };
    ask();
    return dot;
  }

  function chipButton(label: string, className: string): HTMLButtonElement {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = className;
    chip.textContent = label;
    return chip;
  }

  function openAddForm(): void {
    const form = document.createElement('form');
    form.className = 'word-help-strip__add-form';
    const term = document.createElement('input');
    term.className = 'input';
    term.placeholder = 'Word';
    term.setAttribute('aria-label', 'Word');
    const meaning = document.createElement('input');
    meaning.className = 'input';
    meaning.placeholder = 'Meaning';
    meaning.setAttribute('aria-label', 'Meaning');
    const add = chipButton('Add', 'btn btn--primary');
    add.type = 'submit';
    const cancel = chipButton('Cancel', 'btn btn--ghost');
    cancel.addEventListener('click', () => paintStrip());
    form.append(term, meaning, add, cancel);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const word = term.value.trim();
      const definition = meaning.value.trim();
      if (!word || !definition) {
        (word ? meaning : term).focus();
        return;
      }
      const saved = readWordHelp(options.getLatest()).filter((entry) => entry.word.toLowerCase() !== word.toLowerCase());
      saveWords([
        ...saved,
        { word, kind: 'uncommon', part_of_speech: '', pronunciation: '', definition, etymology: '', example: '', added: true, pinned: true }
      ]);
    });
    wordStrip.querySelector('.word-help-strip__add')?.replaceWith(form);
    term.focus();
  }

  function paintStrip(): void {
    const latest = options.getLatest();
    const saved = readWordHelp(latest);
    const scanned = saved.filter((entry) => !entry.added);
    const words = wordsPresentIn(plainText(tiptap.getHtml()), scanned);
    const added = saved.filter((entry) => entry.added);
    wordStrip.replaceChildren();
    wordStrip.hidden = false;
    strip.hidden = false;

    const label = document.createElement('p');
    label.className = 'word-help-strip__label';
    label.textContent =
      scanned.length === 0
        ? 'Words under this block'
        : words.length === scanned.length
          ? `${words.length} ${words.length === 1 ? 'word' : 'words'} lit for students. Tap one to show it under the text.`
          : `${words.length} of ${scanned.length} words still in the text. Scan again to refresh.`;
    const chips = document.createElement('div');
    chips.className = 'word-help-strip__chips';
    const toggle = (target: WordHelpEntry) => {
      saveWords(
        readWordHelp(options.getLatest()).map((entry) =>
          entry.word === target.word && !entry.added ? { ...entry, pinned: !entry.pinned } : entry
        )
      );
    };
    for (const entry of words) {
      const chip = chipButton(entry.word, 'word-help-term word-help-strip__chip');
      if (entry.pinned) chip.prepend(matrixDot(entry.word));
      chip.setAttribute('aria-pressed', String(Boolean(entry.pinned)));
      chip.title = entry.pinned ? 'Shown under the text. Tap to hide.' : 'Tap to show under the text.';
      chip.addEventListener('click', () => toggle(entry));
      chips.append(chip);
    }
    for (const entry of added) {
      const chip = chipButton(`${entry.word} ×`, 'word-help-term word-help-strip__chip');
      chip.prepend(matrixDot(entry.word));
      chip.setAttribute('aria-pressed', 'true');
      chip.setAttribute('aria-label', `Remove ${entry.word}`);
      chip.title = entry.definition;
      chip.addEventListener('click', () =>
        saveWords(readWordHelp(options.getLatest()).filter((candidate) => candidate !== entry && candidate.word !== entry.word))
      );
      chips.append(chip);
    }
    const addButton = chipButton('+ Add word', 'word-help-strip__add');
    addButton.addEventListener('click', openAddForm);
    chips.append(addButton);
    wordStrip.append(label, chips);
    if (saved.some((entry) => entry.pinned)) {
      const legend = document.createElement('p');
      legend.className = 'word-help-strip__legend';
      for (const state of ['ready', 'building', 'none'] as const) {
        const item = document.createElement('span');
        const dot = document.createElement('span');
        dot.className = 'word-help-strip__dot';
        dot.dataset.state = state;
        item.append(dot, state === 'ready' ? 'Matrix ready' : state === 'building' ? 'Building' : 'No prefix or suffix to build with');
        legend.append(item);
      }
      wordStrip.append(legend);
    }

    if (scanned.length) {
      const clear = chipButton('Clear', 'btn btn--ghost word-help-strip__clear');
      clear.addEventListener('click', () => {
        saveWords(added);
        say('Dictionary words cleared. Students can still run their own scan.');
      });
      wordStrip.append(clear);
    }
  }

  function saveTechniques(next: ReturnType<typeof createTechniqueScan> | null): void {
    const latest = options.getLatest();
    const settings = { ...(latest.settings ?? {}) } as Record<string, unknown>;
    if (next) settings.technique_scan = next;
    else delete settings.technique_scan;
    options.onChange({ ...latest, settings });
    void paintTechniqueStrip();
  }

  async function paintTechniqueStrip(): Promise<void> {
    const raw = options.getLatest().settings?.technique_scan;
    techniqueStrip.replaceChildren();
    techniqueStrip.hidden = !raw;
    strip.hidden = wordStrip.hidden && techniqueStrip.hidden;
    if (!raw) return;
    const table = await loadLiteraryElements();
    const saved = readTechniqueScan(options.getLatest(), table);
    if (!saved) {
      techniqueStrip.hidden = true;
      strip.hidden = wordStrip.hidden;
      return;
    }
    const text = plainText(tiptap.getHtml());
    const stale = saved.findings.some((finding) => !quoteAppearsIn(text, finding.quote));
    const label = document.createElement('p');
    label.className = 'word-help-strip__label';
    const names = saved.approved_ids
      .map((id) => table.techniques.find((t) => t.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    label.textContent = !saved.approved_at
      ? 'Technique scan not reviewed yet. Students get nothing until you tick and save.'
      : names.length
        ? `${names.length} ${names.length === 1 ? 'technique' : 'techniques'} for the spinner: ${names.join(', ')}`
        : 'Technique scan reviewed. Nothing ticked for students.';
    if (stale) label.textContent += ' The text has changed since the scan. Scan again to refresh.';
    const review = document.createElement('button');
    review.type = 'button';
    review.className = 'btn btn--ghost word-help-strip__clear';
    review.textContent = 'Review';
    review.addEventListener('click', () => {
      const current = readTechniqueScan(options.getLatest(), table);
      if (current) openTechniqueReview(current, table, (ids) => saveTechniques(approveTechniques(current, ids)));
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn--ghost word-help-strip__clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      saveTechniques(null);
      say('Technique scan cleared. The spinner has nothing from this text.');
    });
    techniqueStrip.append(label, review, clear);
  }

  dictionary.addEventListener('click', async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    say('Scanning for challenging words…');
    try {
      const words = await scan(tiptap.getHtml());
      const latest = options.getLatest();
      // A new scan is a new date even when the old pins carry over.
      const settings = { ...(latest.settings ?? {}) } as Record<string, unknown>;
      delete settings.word_help;
      const merged = mergeScan(words);
      options.onChange({ ...latest, settings });
      saveWords(merged);
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

  technique.addEventListener('click', async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    say('Scanning for literary techniques…');
    try {
      const table = await loadLiteraryElements();
      const findings = await scanTechniques(tiptap.getHtml(), table);
      say(findings.length ? '' : 'No techniques found in this block.');
      if (findings.length) {
        const fresh = createTechniqueScan(findings);
        openTechniqueReview(fresh, table, (ids) => saveTechniques(approveTechniques(fresh, ids)));
      }
    } catch (error) {
      say(error instanceof Error && error.message ? error.message : 'The scan did not finish. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  });

  paintStrip();
  void paintTechniqueStrip();
  return { buttons: [dictionary, fry, technique], status, strip };
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
