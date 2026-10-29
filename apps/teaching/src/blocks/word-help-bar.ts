/**
 * The student's "Dictionary scan" button under a rich text block.
 *
 * With a teacher pre-scan the words are already lit and the button switches
 * them off and on. Without one, the first press asks the server to scan the
 * published block, plays the sweep while it works, then lights the words.
 */
import {
  applyWordHelp,
  DICTIONARY_ICON,
  removeWordHelp,
  setScanning,
  type OpenWord,
  type WordHelpEntry
} from '@/blocks/word-help';
import { scanWordsAsStudent } from '@/blocks/text-tools-client';

export function createStudentWordHelpBar(options: {
  body: HTMLElement;
  lessonId: string;
  blockId: string;
  preScanned: WordHelpEntry[];
  scan?: typeof scanWordsAsStudent;
  /** Lessons pass the word tray's opener; elsewhere a tap opens the floating card. */
  openWord?: OpenWord;
}): HTMLElement {
  const scan = options.scan ?? scanWordsAsStudent;
  const bar = document.createElement('div');
  bar.className = 'word-help-bar';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-help-bar__btn';
  button.innerHTML = `${DICTIONARY_ICON}<span class="word-help-bar__label">Dictionary scan</span>`;

  const status = document.createElement('p');
  status.className = 'word-help-bar__status';
  status.setAttribute('aria-live', 'polite');
  bar.append(button, status);

  let words: WordHelpEntry[] | null = options.preScanned.length ? options.preScanned : null;
  let shown = words !== null;
  let busy = false;

  function paint(): void {
    button.setAttribute('aria-pressed', String(shown));
    button.classList.toggle('is-on', shown);
    button.disabled = busy;
  }

  function show(on: boolean): void {
    shown = on;
    if (on && words) {
      const found = applyWordHelp(options.body, words, options.openWord);
      status.textContent = found ? '' : 'Every word in this block is one you can read on your own.';
    } else {
      removeWordHelp(options.body);
      status.textContent = '';
    }
    paint();
  }

  button.addEventListener('click', async () => {
    if (busy) return;
    if (words) {
      show(!shown);
      return;
    }
    busy = true;
    status.textContent = 'Scanning for tricky words…';
    paint();
    setScanning(options.body, true);
    try {
      words = await scan(options.lessonId, options.blockId);
      show(true);
    } catch (error) {
      status.textContent = error instanceof Error && error.message ? error.message : 'The scan did not finish. Try again.';
    } finally {
      busy = false;
      setScanning(options.body, false);
      paint();
    }
  });

  paint();
  return bar;
}
