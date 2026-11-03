import type { z } from 'zod';
import type { AnnotationExemplarSchema } from '@/schemas/block';

/**
 * Exemplars in the annotation block: one model piece, a stronger piece beside a nearly-there one, or
 * an example beside a counterexample. The pieces are one text split at a stanza, so every note,
 * thread and voice clip keeps working across both; two pieces sit side by side (stacked on a phone).
 * With hidden labels the pieces read A and B under a "Which one…?" prompt until someone presses
 * Reveal, which shows the real labels and the what/why/how questions. Answers go in books.
 */

export type Exemplar = z.infer<typeof AnnotationExemplarSchema>;
export type ExemplarKind = Exemplar['kind'];
type Stanza = { id: string; lines?: Array<{ text: string }> };
type Content = { exemplar?: Exemplar; text: { stanzas: Stanza[] } };

export const EXEMPLAR_KINDS: ReadonlyArray<{ id: ExemplarKind; label: string; hint: string }> = [
  { id: 'single', label: 'Exemplar', hint: 'One model piece, annotated' },
  { id: 'compare', label: 'Comparative exemplars', hint: 'A stronger piece beside a nearly-there one' },
  { id: 'counter', label: 'Example and counterexample', hint: 'One that is, beside one that isn’t' }
];

export const DEFAULT_LABELS: Readonly<Record<ExemplarKind, readonly string[]>> = {
  single: ['Exemplar'],
  compare: ['Stronger', 'Nearly there'],
  counter: ['Example', 'Counterexample']
};

export const QUESTION_KINDS = [
  { id: 'what', label: 'What' },
  { id: 'why', label: 'Why' },
  { id: 'how', label: 'How' }
] as const;

const PLACEHOLDER_LABELS = ['A', 'B'];
export const isTwoPiece = (kind: ExemplarKind | undefined): boolean => kind === 'compare' || kind === 'counter';

/** The label a piece shows when revealed: the teacher's, or the kind's default. */
export function pieceLabel(exemplar: Exemplar, index: number): string {
  return exemplar.labels[index]?.trim() || DEFAULT_LABELS[exemplar.kind][index] || PLACEHOLDER_LABELS[index] || '';
}

/**
 * The pieces as stanza id lists, in text order. Two-piece kinds need a split inside the text
 * (not on the first stanza); without one the whole text is one piece, so nothing breaks.
 */
export function exemplarPieces(content: Content): Array<{ label: string; placeholder: string; stanzaIds: string[] }> | null {
  const ex = content.exemplar;
  if (!ex) return null;
  const ids = content.text.stanzas.map((s) => s.id);
  const at = isTwoPiece(ex.kind) && ex.split_at ? ids.indexOf(ex.split_at) : -1;
  if (at <= 0) return [{ label: pieceLabel(ex, 0), placeholder: PLACEHOLDER_LABELS[0]!, stanzaIds: ids }];
  return [
    { label: pieceLabel(ex, 0), placeholder: PLACEHOLDER_LABELS[0]!, stanzaIds: ids.slice(0, at) },
    { label: pieceLabel(ex, 1), placeholder: PLACEHOLDER_LABELS[1]!, stanzaIds: ids.slice(at) }
  ];
}

/** "Which one is the example of …?" for a hidden two-piece exemplar, or the plain heading. */
export function exemplarPrompt(ex: Exemplar): string {
  const focus = ex.focus?.trim();
  if (ex.hide_labels && isTwoPiece(ex.kind)) {
    if (ex.kind === 'counter') return focus ? `Which one is an example of ${focus}?` : 'Which one is the example?';
    return focus ? `Which one shows ${focus} better?` : 'Which one is stronger?';
  }
  return focus ? `${EXEMPLAR_KINDS.find((k) => k.id === ex.kind)!.label}: ${focus}` : EXEMPLAR_KINDS.find((k) => k.id === ex.kind)!.label;
}

const option = (label: string, value: string): HTMLOptionElement => {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Whether the view starts hidden: only two-piece exemplars with hidden labels do. */
export const startsHidden = (ex: Exemplar | undefined): boolean => !!ex && ex.hide_labels && isTwoPiece(ex.kind);

/**
 * The prompt, the Reveal button and the questions above the text. Revealing flips
 * `data-exemplar-revealed` on `root`, which the labels and questions read through CSS,
 * so the text never has to be redrawn.
 */
export function renderExemplarHeader(ex: Exemplar, root: HTMLElement, opts: { print?: boolean } = {}): HTMLElement {
  root.dataset.exemplar = ex.kind;
  root.dataset.exemplarRevealed = String(!startsHidden(ex));
  const head = el('div', 'block-annotation__exemplar');
  // On paper there is nothing to press: the pieces stay A and B, and the questions print beneath.
  if (opts.print) head.classList.add('block-annotation__exemplar--print');
  head.append(el('p', 'block-annotation__exemplar-prompt', exemplarPrompt(ex)));
  const questions = ex.questions.filter((q) => q.text.trim());
  const after = el('div', 'block-annotation__exemplar-after');
  if (questions.length) {
    const list = el('ol', 'block-annotation__exemplar-questions');
    for (const q of questions) {
      const item = el('li', 'block-annotation__exemplar-question');
      item.dataset.kind = q.kind;
      item.append(el('span', 'block-annotation__exemplar-kind', QUESTION_KINDS.find((k) => k.id === q.kind)!.label), el('span', '', q.text));
      list.append(item);
    }
    after.append(list, el('p', 'block-annotation__exemplar-books', 'Answer in your book.'));
  }
  if (startsHidden(ex) && !opts.print) {
    const reveal = el('button', 'btn btn--secondary block-annotation__exemplar-reveal', questions.length ? 'Reveal the labels and questions' : 'Reveal the labels');
    reveal.type = 'button';
    reveal.addEventListener('click', (event) => {
      event.stopPropagation();
      root.dataset.exemplarRevealed = 'true';
      // The button styles set display, which would win over `hidden`.
      reveal.remove();
    });
    head.append(reveal);
  }
  if (after.childElementCount) head.append(after);
  return head;
}

/**
 * Regroups drawn stanza elements into piece columns. Called after the stanzas are drawn; a single
 * piece only gains its label. Each piece label carries both names; CSS shows A/B until revealed.
 */
export function groupIntoPieces(stanzasHost: HTMLElement, content: Content): void {
  const pieces = exemplarPieces(content);
  if (!pieces) return;
  const stanzaEls = new Map(
    [...stanzasHost.children]
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('block-annotation__stanza'))
      .map((s) => [s.dataset.stanzaId ?? '', s])
  );
  stanzasHost.classList.toggle('block-annotation__stanzas--pieces', pieces.length > 1);
  const columns = pieces.map((piece, index) => {
    const col = el('section', 'block-annotation__piece');
    col.dataset.piece = String(index);
    const label = el('h4', 'block-annotation__piece-label');
    label.append(el('span', 'block-annotation__piece-name', piece.label), el('span', 'block-annotation__piece-placeholder', piece.placeholder));
    col.append(label);
    for (const id of piece.stanzaIds) {
      const stanza = stanzaEls.get(id);
      if (stanza) col.append(stanza);
    }
    return col;
  });
  stanzasHost.prepend(...columns);
}

type EditorBlock = { content: Content };

let questionSeq = 0;
const newQuestionId = (): string => `q_${Date.now().toString(36)}${(questionSeq++).toString(36)}`;

/**
 * The editor's Exemplar section. It saves `content.exemplar` on its own, merged into the latest
 * block, so the rest of the annotation editor never has to know about it. None takes it off.
 */
export function createExemplarEditor<T extends EditorBlock>(getLatest: () => T, onChange: (block: T) => void): HTMLDetailsElement {
  const details = el('details', 'block-editor__annotation-details block-editor__annotation-exemplar');
  const summary = el('summary', '', 'Exemplar');
  const help = el('p', 'block-editor__hint', 'Use the text as a model. For two pieces, write both in the text, one after the other, then choose where the second starts. They show side by side. Students answer the questions in their books.');
  const body = el('div', 'block-editor__exemplar-body');
  details.append(summary, help, body);

  const save = (next: Exemplar | undefined): void => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, exemplar: next } });
    paint();
  };
  const current = (): Exemplar | undefined => getLatest().content.exemplar;
  const update = (patch: Partial<Exemplar>): void => {
    const ex = current();
    if (ex) save({ ...ex, ...patch });
  };

  const field = (label: string, control: HTMLElement): HTMLLabelElement => {
    const wrap = el('label', 'block-editor__exemplar-field');
    wrap.append(el('span', 'block-editor__exemplar-label', label), control);
    return wrap;
  };

  function paint(): void {
    body.replaceChildren();
    const ex = current();
    const kind = el('select', 'input block-editor__exemplar-kind');
    kind.setAttribute('aria-label', 'Exemplar kind');
    kind.append(option('Not an exemplar', ''));
    for (const k of EXEMPLAR_KINDS) kind.append(option(`${k.label} · ${k.hint}`, k.id));
    kind.value = ex?.kind ?? '';
    kind.addEventListener('change', () => {
      const value = kind.value as ExemplarKind | '';
      if (!value) return save(undefined);
      save({ kind: value, focus: ex?.focus, labels: [], split_at: ex?.split_at, hide_labels: ex?.hide_labels ?? false, questions: ex?.questions ?? [] });
    });
    body.append(field('Kind', kind));
    if (!ex) return;

    const focus = el('input', 'input block-editor__exemplar-focus');
    focus.type = 'text';
    focus.maxLength = 120;
    focus.value = ex.focus ?? '';
    focus.placeholder = ex.kind === 'counter' ? 'e.g. a metaphor' : 'e.g. a topic sentence that argues';
    // Typed fields save on change, so the caret survives.
    focus.addEventListener('change', () => update({ focus: focus.value.trim() || undefined }));
    body.append(field(ex.kind === 'counter' ? 'An example of…' : 'What it shows', focus));

    const two = isTwoPiece(ex.kind);
    const labelRow = el('div', 'block-editor__exemplar-row');
    for (let i = 0; i < (two ? 2 : 1); i += 1) {
      const input = el('input', 'input block-editor__exemplar-piece-label');
      input.type = 'text';
      input.maxLength = 40;
      input.value = ex.labels[i] ?? '';
      input.placeholder = DEFAULT_LABELS[ex.kind][i] ?? '';
      input.setAttribute('aria-label', two ? `Label for piece ${i + 1}` : 'Label');
      input.addEventListener('change', () => {
        const labels = [...(current()?.labels ?? [])];
        while (labels.length <= i) labels.push('');
        labels[i] = input.value.trim();
        update({ labels: labels.slice(0, two ? 2 : 1) });
      });
      labelRow.append(input);
    }
    body.append(field(two ? 'Piece labels' : 'Label', labelRow));

    if (two) {
      const stanzas = getLatest().content.text.stanzas;
      const split = el('select', 'input block-editor__exemplar-split');
      split.setAttribute('aria-label', 'Where the second piece starts');
      split.append(option('Choose a stanza or paragraph', ''));
      stanzas.forEach((s, i) => {
        if (i === 0) return;
        const first = s.lines?.[0]?.text.trim() ?? '';
        split.append(option(`${i + 1}. ${first.length > 48 ? `${first.slice(0, 47)}…` : first || '(blank)'}`, s.id));
      });
      split.value = ex.split_at && stanzas.some((s, i) => i > 0 && s.id === ex.split_at) ? ex.split_at : '';
      split.addEventListener('change', () => update({ split_at: split.value || undefined }));
      body.append(field('Second piece starts at', split));
      if (stanzas.length < 2) body.append(el('p', 'block-editor__hint', 'Leave a blank line between the two pieces in the text so each has its own stanza or paragraph.'));

      const hide = el('input', 'block-editor__exemplar-hide');
      hide.type = 'checkbox';
      hide.checked = ex.hide_labels;
      hide.addEventListener('change', () => update({ hide_labels: hide.checked }));
      const hideLabel = el('label', 'block-editor__exemplar-check');
      hideLabel.append(hide, el('span', '', 'Hide the labels as A and B, ask “Which one…?”, then reveal the labels and questions'));
      body.append(hideLabel);
    }

    const qHost = el('div', 'block-editor__exemplar-questions');
    qHost.append(el('span', 'block-editor__exemplar-label', 'Questions'));
    ex.questions.forEach((q, index) => {
      const row = el('div', 'block-editor__exemplar-question');
      const qKind = el('select', 'input block-editor__exemplar-qkind');
      qKind.setAttribute('aria-label', `Question ${index + 1} type`);
      for (const k of QUESTION_KINDS) qKind.append(option(k.label, k.id));
      qKind.value = q.kind;
      qKind.addEventListener('change', () => update({ questions: (current()?.questions ?? []).map((x) => (x.id === q.id ? { ...x, kind: qKind.value as typeof q.kind } : x)) }));
      const text = el('input', 'input block-editor__exemplar-qtext');
      text.type = 'text';
      text.maxLength = 300;
      text.value = q.text;
      text.setAttribute('aria-label', `Question ${index + 1}`);
      text.placeholder = q.kind === 'what' ? 'What has the writer done here?' : q.kind === 'why' ? 'Why does it work?' : 'How could the weaker one improve?';
      text.addEventListener('change', () => update({ questions: (current()?.questions ?? []).map((x) => (x.id === q.id ? { ...x, text: text.value.trim() } : x)) }));
      const remove = el('button', 'btn btn--ghost block-editor__exemplar-qremove', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove question ${index + 1}`);
      remove.addEventListener('click', () => update({ questions: (current()?.questions ?? []).filter((x) => x.id !== q.id) }));
      row.append(qKind, text, remove);
      qHost.append(row);
    });
    if (ex.questions.length < 8) {
      const add = el('button', 'btn btn--secondary block-editor__exemplar-qadd', 'Add a question');
      add.type = 'button';
      add.addEventListener('click', () => {
        const used = new Set((current()?.questions ?? []).map((x) => x.kind));
        const kind = QUESTION_KINDS.find((k) => !used.has(k.id))?.id ?? 'why';
        update({ questions: [...(current()?.questions ?? []), { id: newQuestionId(), kind, text: '' }] });
      });
      qHost.append(add);
    }
    body.append(qHost);
  }

  // The text can change while the section is closed; redraw the stanza list each time it opens.
  details.addEventListener('toggle', () => { if (details.open) paint(); });
  paint();
  if (current()) details.open = true;
  return details;
}
