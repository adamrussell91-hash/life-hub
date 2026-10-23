import type { Block } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import { editorShell, type BlockChangeHandler } from '@/blocks/editors';

export type FadedExampleBlock = Extract<Block, { block_type: 'faded_example' }>;

/** Fired when a student rates a faded step; the tutorial player sends it to the live board. */
export const FADED_EVENT = 'tutorial:faded';
export type FadedDetail = { blockId: string; parts: Record<number, string>; rating: 'right' | 'wrong' };

/**
 * One step of a faded worked example: the extract, then each part of the
 * model answer. Blank parts are for the student to write; the rest show.
 * Checking and rating are added in a later task.
 */
export function renderFadedExample(block: FadedExampleBlock, mode: RenderMode): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-faded';
  root.dataset.blockId = block.id;
  const { prompt, extract, parts, blanks } = block.content;
  if (prompt) {
    const p = document.createElement('p');
    p.className = 'block-faded__prompt block-body';
    p.textContent = prompt;
    root.append(p);
  }
  const quote = document.createElement('blockquote');
  quote.className = 'block-faded__extract';
  quote.textContent = extract;
  root.append(quote);
  const list = document.createElement('dl');
  list.className = 'block-faded__parts';
  parts.forEach((part, index) => {
    const term = document.createElement('dt');
    term.textContent = part.label;
    const value = document.createElement('dd');
    if (blanks.includes(index) && mode !== 'teacher') {
      const input = document.createElement('textarea');
      input.className = 'block-faded__input';
      input.rows = 2;
      input.dataset.part = String(index);
      input.setAttribute('aria-label', `Your ${part.label.toLowerCase()}`);
      value.append(input);
    } else {
      value.textContent = part.answer;
      if (blanks.includes(index)) value.classList.add('block-faded__model');
    }
    list.append(term, value);
  });
  root.append(list);
  return root;
}

export function createFadedExampleEditor(
  block: FadedExampleBlock,
  onChange: BlockChangeHandler<FadedExampleBlock>,
  getLatest: () => FadedExampleBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__faded';
  const emit = (patch: Partial<FadedExampleBlock['content']>) => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, ...patch } });
  };
  const area = (label: string, value: string, rows: number, on: (v: string) => void) => {
    const wrap = document.createElement('label');
    wrap.className = 'block-editor__label';
    wrap.textContent = label;
    const input = document.createElement('textarea');
    input.rows = rows;
    input.value = value;
    input.addEventListener('input', () => on(input.value));
    wrap.append(input);
    return wrap;
  };
  fields.append(
    area('Prompt', block.content.prompt, 1, (prompt) => emit({ prompt })),
    area('Extract', block.content.extract, 3, (extract) => emit({ extract }))
  );
  block.content.parts.forEach((part, index) => {
    const row = document.createElement('div');
    row.className = 'block-editor__faded-part';
    row.append(
      area(`${part.label}: model answer`, part.answer, 2, (answer) =>
        emit({ parts: getLatest().content.parts.map((p, i) => (i === index ? { ...p, answer } : p)) })
      )
    );
    const blank = document.createElement('label');
    blank.className = 'block-editor__check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = block.content.blanks.includes(index);
    box.addEventListener('change', () => {
      const current = getLatest().content.blanks.filter((i) => i !== index);
      emit({ blanks: box.checked ? [...current, index].sort() : current });
    });
    blank.append(box, ' Students write this part');
    row.append(blank);
    fields.append(row);
  });
  return editorShell(block, onChange, fields, getLatest);
}
