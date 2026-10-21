import type { Block } from '@/schemas/block';
import { createEditorFilter } from '@/blocks/editor-filter';

/**
 * A Format changes a block's shape: what it looks like and what students fill
 * in. New question or feedback styles become Format entries here, not new
 * block types. A block type with two or more formats shows the Format control.
 */
export type FormatEntry = { id: string; label: string; hint: string };

export const BLOCK_FORMATS: Partial<Record<Block['block_type'], FormatEntry[]>> = {
  question_set: [
    { id: 'standard', label: 'Standard', hint: 'A numbered list of questions.' },
    {
      id: 'human_experience_table', label: 'Human experience table',
      hint: 'Students fill a table: human experience, conceptual focus, one sentence, and window, mirror or both. The first question becomes the instruction.'
    },
    {
      id: 'anchor_bridge', label: 'Anchor & bridge',
      hint: 'Each question gets three boxes (anchor, human experience, bridge) and a response frame.'
    },
    {
      id: 'reasoning_chart', label: 'Reasoning chart',
      hint: 'Each question gets a deductive, inductive or abductive chart students build step by step, then a sentence frame to write it up.'
    }
  ],
  peer_feedback: [
    { id: 'comments', label: 'Two feedback boxes', hint: 'Each answer goes to one classmate, who fills in your two boxes.' },
    {
      id: 'annotate', label: 'Notes on the text',
      hint: 'Each answer goes to two classmates. They highlight parts of it and press your feedback buttons; the writer gets it back as two layers.'
    }
  ]
};

export function formatsFor(type: Block['block_type']): FormatEntry[] {
  return BLOCK_FORMATS[type] ?? [];
}

export function blockFormat(block: Block): string {
  if (block.block_type === 'question_set') return block.content.format ?? 'standard';
  if (block.block_type === 'peer_feedback') return block.content.mode ?? 'comments';
  return formatsFor(block.block_type)[0]?.id ?? '';
}

export function withFormat<T extends Block>(block: T, id: string): T {
  if (block.block_type === 'question_set') {
    return { ...block, content: { ...block.content, format: id as NonNullable<typeof block.content.format> } };
  }
  if (block.block_type === 'peer_feedback') {
    return { ...block, content: { ...block.content, mode: id as typeof block.content.mode } };
  }
  return block;
}

/** The shared Format control: the kit's dropdown pill and a one-line hint. */
export function createFormatField(options: {
  block: Block;
  onPick: (id: string) => void;
}): HTMLElement | null {
  const formats = formatsFor(options.block.block_type);
  if (formats.length < 2) return null;
  const wrap = document.createElement('div');
  wrap.className = 'block-editor__format';
  const hint = document.createElement('p');
  hint.className = 'block-editor__format-hint block-secondary';
  const paintHint = (id: string) => { hint.textContent = formats.find((f) => f.id === id)?.hint ?? ''; };
  const control = createEditorFilter({
    key: 'Format',
    value: blockFormat(options.block),
    options: formats.map((f) => ({ value: f.id, label: f.label })),
    className: 'block-editor__format-choice',
    ariaLabel: 'Format',
    onChange: (id) => { paintHint(id); options.onPick(id); }
  });
  paintHint(blockFormat(options.block));
  wrap.append(control.el, hint);
  return wrap;
}
