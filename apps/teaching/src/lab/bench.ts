import { button, el } from '@/quiz/dom';
import { describeEdits, markEdits, type Edit, type MarkedToken, type Token } from './model';

/**
 * The bench: the control beside the pair's version. A pair taps a word in
 * its version, then replaces it, cuts it, or moves the line break after it.
 * The version is an `Edit` against the control's tokens; what shows comes
 * from `markEdits` and the change line from `describeEdits`. Lilac marks
 * every change, and a small lilac bar marks a line break that moved.
 */

// ---------------------------------------------------------------------------
// The tools, as pure changes to an Edit
// ---------------------------------------------------------------------------

const without = (list: number[] | undefined, i: number): number[] => (list ?? []).filter((x) => x !== i);
const toggled = (list: number[] | undefined, i: number): number[] => ((list ?? []).includes(i) ? without(list, i) : [...(list ?? []), i].sort((a, b) => a - b));
/** Drops empty parts, so an edit with nothing in it is `{}`. */
function tidy(edit: Edit): Edit {
  return {
    ...(edit.cut?.length ? { cut: edit.cut } : {}),
    ...(edit.rep && Object.keys(edit.rep).length ? { rep: edit.rep } : {}),
    ...(edit.join?.length ? { join: edit.join } : {}),
    ...(edit.brk?.length ? { brk: edit.brk } : {})
  };
}

/** Replace: the word becomes `word`. The original word, or nothing, puts it back. A replaced word is no longer cut. */
export function replaceWord(tokens: Token[], edit: Edit, i: number, word: string): Edit {
  const next = word.trim().replace(/\s+/g, ' ').slice(0, 40);
  const rep = { ...(edit.rep ?? {}) };
  if (next && next !== tokens[i]?.w) rep[i] = next;
  else delete rep[i];
  return tidy({ ...edit, rep, cut: without(edit.cut, i) });
}

/** Cut, or Put back. */
export function toggleCut(edit: Edit, i: number): Edit {
  return tidy({ ...edit, cut: toggled(edit.cut, i) });
}

/** Break line after, or Join to next line: flips whether a line ends after this word. */
export function toggleBreak(tokens: Token[], edit: Edit, i: number): Edit {
  if (i < 0 || i >= tokens.length - 1) return edit;
  return tidy(tokens[i]!.br ? { ...edit, join: toggled(edit.join, i) } : { ...edit, brk: toggled(edit.brk, i) });
}

// ---------------------------------------------------------------------------
// The text, drawn
// ---------------------------------------------------------------------------

/** A text with numbered lines and no marks: the control, and any version as a reader sees it. */
export function poem(lines: string[]): HTMLElement {
  const list = el('ol', 'lab-poem');
  for (const line of lines) {
    const item = el('li');
    item.append(el('span', '', line));
    list.append(item);
  }
  return list;
}

/**
 * A pair's version with its changes marked: replaced words in lilac, cut
 * words struck through, a bar where a line break moved. With `onTap`, every
 * word is a button.
 */
export function markedPoem(marked: MarkedToken[], o: { sel?: number; onTap?: (index: number) => void } = {}): HTMLElement {
  const list = el('ol', 'lab-poem');
  let line = el('span');
  const close = (): void => {
    if (!line.childNodes.length) return;
    const item = el('li');
    item.append(line);
    list.append(item);
    line = el('span');
  };
  marked.forEach((t, i) => {
    const word = o.onTap ? el('button', 'lab-tok') : el('span', 'lab-tok');
    word.textContent = t.cut ? t.w : t.shown;
    if (t.cut) word.classList.add('is-cut');
    else if (t.replaced) word.classList.add('is-changed');
    if (i === o.sel) word.classList.add('is-sel');
    if (word instanceof HTMLButtonElement) {
      word.type = 'button';
      word.dataset.tok = String(i);
      word.setAttribute('aria-pressed', String(i === o.sel));
      if (t.cut) word.setAttribute('aria-label', `${t.w}, cut`);
      else if (t.replaced) word.setAttribute('aria-label', `${t.shown}, changed from ${t.w}`);
      word.addEventListener('click', () => o.onTap!(i));
    }
    if (line.childNodes.length) line.append(' ');
    line.append(word);
    if (t.moved) {
      const bar = el('span', 'lab-mk');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', t.breakAfter ? 'line break added' : 'line break taken away');
      line.append(bar);
    }
    if (t.breakAfter) close();
  });
  close();
  return list;
}

/** "No change yet.", "One change: …." or "2 changes: …; …. One change gives a cleaner result." */
export function changeLine(desc: string[]): HTMLElement {
  const line = el('p', 'lab-change');
  if (desc.length === 0) line.append(el('span', 'lab-muted', 'No change yet.'));
  else if (desc.length === 1) line.append(el('strong', '', 'One change:'), ` ${desc[0]}.`);
  else line.append(el('strong', '', `${desc.length} changes:`), ` ${desc.join('; ')}. `, el('span', 'lab-muted', 'One change gives a cleaner result.'));
  return line;
}

/** A labelled box on the bench. `live` is the pair's own version. */
export function pane(label: string | null, body: HTMLElement[], live = false): HTMLElement {
  const box = el('div', `lab-pane${live ? ' is-live' : ''}`);
  if (label) box.append(el('span', 'lab-label', label));
  box.append(...body);
  return box;
}

export type BenchOptions = {
  /** The control, as tokens. */
  tokens: Token[];
  /** The pair's version so far. */
  edit: Edit;
  /** The selected word's index, or -1. */
  sel: number;
  /** What is typed in the Replace box for the selected word, when it differs from the word shown. */
  replacement?: string;
  onSelect(index: number): void;
  onReplacement?(text: string): void;
  /** A tool was used: the pair's version is now this. */
  onEdit(edit: Edit): void;
  /** Put it on the bench. Only called when there is a change. */
  onReady(): void;
  /** Goes between the change line and the buttons once there is a change: the Design lab note. */
  note?: HTMLElement | null;
};

/** The Design screen's working parts: the two panes, the tool row, the change line and the buttons. */
export function designBench(o: BenchOptions): HTMLElement[] {
  const { tokens, edit } = o;
  const marked = markEdits(tokens, edit);
  const desc = describeEdits(tokens, edit);
  const control = markEdits(tokens, {});

  const panes = el('div', 'lab-bench');
  panes.append(
    pane('Control', [markedPoem(control)]),
    pane('Your version', [markedPoem(marked, { sel: o.sel, onTap: o.onSelect })], true)
  );

  const tools = el('div', 'lab-tools');
  const chosen = marked[o.sel];
  if (!chosen) {
    tools.append(el('p', 'lab-muted', 'Tap a word in your version to change it, cut it, or move a line break.'));
  } else {
    const index = o.sel;
    const input = el('input', 'lab-tools__word');
    input.type = 'text';
    input.maxLength = 40;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', `Replace “${chosen.w}” with`);
    input.value = o.replacement ?? chosen.shown;
    input.addEventListener('input', () => o.onReplacement?.(input.value));
    const replace = button('Replace', 'secondary', () => o.onEdit(replaceWord(tokens, edit, index, input.value)));
    replace.dataset.tool = 'replace';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') replace.click();
    });
    const cut = button(chosen.cut ? 'Put back' : 'Cut', 'secondary', () => o.onEdit(toggleCut(edit, index)));
    cut.dataset.tool = 'cut';
    tools.append(input, replace, cut);
    if (index < tokens.length - 1) {
      const brk = button(chosen.breakAfter ? 'Join to next line' : 'Break line after', 'secondary', () => o.onEdit(toggleBreak(tokens, edit, index)));
      brk.dataset.tool = 'break';
      tools.append(brk);
    }
  }

  const buttons = el('div', 'lab-tools');
  const ready = button('Put it on the bench', 'primary', () => {
    if (desc.length) o.onReady();
  });
  ready.dataset.act = 'ready';
  ready.disabled = desc.length === 0;
  buttons.append(ready);
  if (desc.length) {
    const clear = button('Start over', 'secondary', () => o.onEdit({}));
    clear.dataset.act = 'clear';
    buttons.append(clear);
  }

  return [panes, tools, changeLine(desc), ...(desc.length && o.note ? [o.note] : []), buttons];
}
