import type { AnnotationCodeRef } from '@/schemas/block';
import { button, el } from '@/blocks/peer-feedback-ui';
import { codeInk, codeText, descriptorFor, loadFeedbackCodes, resolveTyped, STRENGTH_COLOUR, type FeedbackCode } from '@/blocks/feedback-codes';
import '@/blocks/voice.css';

/**
 * The "Feedback code" field on an annotation note: type a code the way you
 * would in a margin (AR, TS …), tick Strength for a "+". The code's words are
 * copied onto the note (see AnnotationCodeRefSchema).
 */

export function codeRef(code: FeedbackCode, positive: boolean): AnnotationCodeRef {
  return {
    id: code.id,
    code: code.code,
    label: code.label,
    descriptor: descriptorFor(code, positive),
    colour: code.colour,
    positive
  };
}

export function annotationCodeChip(ref: AnnotationCodeRef): HTMLElement {
  const chip = el('span', 'fc-chip', `${ref.code}${ref.positive ? '+' : ''}`);
  chip.style.setProperty('--fc-ink', codeInk(ref.positive ? STRENGTH_COLOUR : ref.colour));
  if (ref.positive) chip.classList.add('fc-chip--strength');
  return chip;
}

/** The code on a note as the reader sees it: chip, name and what it asks for. */
export function renderAnnotationCode(ref: AnnotationCodeRef): HTMLElement {
  const box = el('div', 'block-annotation__code');
  const head = el('p', 'block-annotation__code-head');
  head.append(annotationCodeChip(ref), ` ${ref.label}`);
  box.append(head);
  if (ref.descriptor) box.append(el('p', 'block-annotation__code-text', ref.descriptor));
  return box;
}

export function mountAnnotationCodeField(current: AnnotationCodeRef | undefined, onChange: (next: AnnotationCodeRef | undefined) => void): HTMLElement {
  const root = el('div', 'block-editor__annotation-code');
  root.append(el('p', 'block-editor__annotation-field-label', 'Feedback code'));
  const row = el('div', 'block-editor__annotation-code-row');
  const input = el('input', 'pa-input block-editor__annotation-code-input');
  input.type = 'text';
  input.maxLength = 3;
  input.placeholder = 'e.g. AR';
  input.setAttribute('aria-label', 'Feedback code letters');
  input.value = current?.code ?? '';
  const strength = el('label', 'block-editor__annotation-code-strength');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = current?.positive ?? false;
  strength.append(box, ' Strength');
  const hint = el('p', 'block-secondary block-editor__annotation-code-hint');
  hint.setAttribute('aria-live', 'polite');
  row.append(input, strength);
  root.append(row, hint);
  if (current) {
    root.append(
      button('Remove code', 'ghost', () => onChange(undefined))
    );
  }

  let codes: FeedbackCode[] = [];
  const apply = (confirm: boolean) => {
    const typed = input.value.toUpperCase().replace(/[^A-Z]/g, '');
    input.value = typed;
    if (!typed) {
      hint.textContent = '';
      return;
    }
    const result = resolveTyped(typed, codes, confirm);
    if (result.kind === 'match') {
      hint.textContent = `${codeText(result.code, box.checked)} · ${result.code.label}`;
      if (confirm || current?.code !== result.code.code || current?.positive !== box.checked) onChange(codeRef(result.code, box.checked));
    } else if (result.kind === 'partial') {
      hint.textContent = `${result.matches.map((c) => `${c.code} ${c.label}`).join(' · ')}. Press Enter for ${typed}.`;
    } else {
      hint.textContent = `No code “${typed}”. Edit codes from a Voice block.`;
    }
  };
  input.addEventListener('input', () => apply(false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply(true);
    }
  });
  box.addEventListener('change', () => {
    if (current && codes.length) {
      const code = codes.find((c) => c.id === current.id);
      if (code) onChange(codeRef(code, box.checked));
    }
  });
  void loadFeedbackCodes()
    .then((loaded) => {
      codes = loaded;
      if (current) hint.textContent = `${codeText(current, current.positive)} · ${current.label}`;
    })
    .catch(() => {
      hint.textContent = 'Couldn’t load your codes.';
    });
  return root;
}
