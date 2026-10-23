// apps/teaching/src/lecture/editor-tools.ts
import type { Block } from '@/schemas/block';
import { mapBlockById } from '@/blocks/block-pulse';
import { findBlockById } from '@/blocks/find-block';
import { createNarrationField } from './narration-field';
import { isGate, isSidePath, takesSidePath, DEFAULT_TAKEAWAY } from './scenes';
import { containerOf, insertAfter, nextSibling, previousSibling } from './tree';
import './lecture.css';

export type LectureEditorToolsOptions = {
  isLecture: () => boolean;
  getBlocks: () => Block[];
  onBlocks: (blocks: Block[]) => void;
  idFactory: () => string;
};

const GATES = new Set<Block['block_type']>(['hinge_question', 'cloze', 'self_check']);

type Content = Record<string, unknown>;

/**
 * In a lecture, each heading, section and gate on the canvas gets a strip of
 * lecture controls. They ride on the canvas row like the block pulse dot, so
 * the block editors stay as they are.
 */
export function createLectureEditorTools(options: LectureEditorToolsOptions) {
  const patch = (id: string, fn: (content: Content) => Content) => {
    options.onBlocks(
      mapBlockById(options.getBlocks(), id, (block) => ({ ...block, content: fn(block.content as Content) }) as Block)
    );
  };

  /** Sets or clears one optional content field. */
  const setField = (id: string, key: string, value: unknown) =>
    patch(id, (c) => {
      const { [key]: _old, ...rest } = c;
      return value === undefined ? rest : { ...rest, [key]: value };
    });

  /** A side path is a section; it can go where a section can, but never inside a side path, column or tab. */
  function canHoldSidePath(gateId: string): boolean {
    const holder = containerOf(options.getBlocks(), gateId);
    if (holder === null) return true;
    return holder?.block_type === 'section' && !isSidePath(holder);
  }

  /** Where the lecture will play this side path, or why it will skip it. */
  function sidePathNote(path: Block): string {
    const before = previousSibling(options.getBlocks(), path.id);
    if (!before || !takesSidePath(before)) return 'If wrong · Not under a hinge question or cloze yet, so students skip it.';
    if (!isGate(before)) return 'If wrong · The question above isn’t a gate, so students skip this.';
    return 'If wrong · plays only after a wrong answer on the question above';
  }

  /** Lecture tools act on a block on the page or in a chapter; not in a side path, column or tab. */
  function inReach(block: Block): boolean {
    const holder = containerOf(options.getBlocks(), block.id);
    if (holder === undefined) return false;
    return holder === null || (holder.block_type === 'section' && !isSidePath(holder));
  }

  function note(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'lecture-tools__note';
    p.textContent = text;
    return p;
  }

  function narration(block: Block, label: string): HTMLElement {
    return createNarrationField({
      label,
      value: (block.content as { narration?: Parameters<typeof createNarrationField>[0]['value'] }).narration,
      onChange: (next) => setField(block.id, 'narration', next)
    });
  }

  function headingTools(block: Extract<Block, { block_type: 'heading' }>, tools: HTMLElement): void {
    tools.append(narration(block, '🎙 Scene narration'));
    const reveal = document.createElement('div');
    reveal.className = 'lecture-tools__reveal';
    reveal.setAttribute('role', 'radiogroup');
    reveal.setAttribute('aria-label', 'How this scene shows');
    for (const [value, label] of [['one', 'One at a time'], ['all', 'Show all']] as const) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.dataset.reveal = value;
      pill.setAttribute('role', 'radio');
      pill.setAttribute('aria-checked', String((block.content.reveal ?? 'one') === value));
      pill.textContent = label;
      pill.addEventListener('click', () => patch(block.id, (c) => ({ ...c, reveal: value })));
      reveal.append(pill);
    }
    tools.append(reveal);
  }

  function chapterTools(block: Extract<Block, { block_type: 'section' }>, tools: HTMLElement): void {
    tools.append(narration(block, '🎙 Chapter intro'));
    const takeaway = block.content.takeaway;
    const on = takeaway?.enabled !== false;
    const wrap = document.createElement('label');
    wrap.className = 'lecture-tools__takeaway';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = on;
    box.addEventListener('click', () =>
      patch(block.id, (c) => ({ ...c, takeaway: { ...(c.takeaway as object | undefined), enabled: box.checked } }))
    );
    wrap.append(box, document.createTextNode(' Takeaway at the end'));
    const words = document.createElement('input');
    words.type = 'text';
    words.className = 'lecture-tools__takeaway-prompt';
    words.maxLength = 300;
    words.setAttribute('aria-label', 'Takeaway wording');
    words.placeholder = DEFAULT_TAKEAWAY(block.content.title.trim() || 'this chapter');
    words.value = takeaway?.prompt ?? '';
    words.disabled = !on;
    words.addEventListener('change', () => {
      const prompt = words.value.trim();
      patch(block.id, (c) => ({ ...c, takeaway: { enabled: true, ...(prompt ? { prompt } : {}) } }));
    });
    tools.append(wrap, words);
  }

  function gateTools(block: Block, tools: HTMLElement): void {
    const gate = document.createElement('label');
    gate.className = 'lecture-tools__gate';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = (block.content as { gate?: boolean }).gate !== false;
    box.addEventListener('click', () => patch(block.id, (c) => ({ ...c, gate: box.checked })));
    gate.append(box, document.createTextNode(' Gate: students answer before moving on'));
    tools.append(gate);
    if (!isGate(block) || !takesSidePath(block) || !canHoldSidePath(block.id)) return;
    const after = nextSibling(options.getBlocks(), block.id);
    if (after && isSidePath(after)) {
      tools.append(note('If wrong path ✓ (just below)'));
      return;
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn--ghost lecture-tools__side-path';
    add.textContent = '+ If wrong path';
    add.addEventListener('click', () => {
      const path = {
        id: options.idFactory(),
        type: 'block',
        block_type: 'section',
        variant: 'medium',
        visibility: 'student_teacher',
        content: { title: 'Let’s look again', blocks: [], side_path: true }
      } as unknown as Block;
      options.onBlocks(insertAfter(options.getBlocks(), block.id, path));
    });
    tools.append(add);
  }

  function toolsFor(block: Block): HTMLElement | null {
    const tools = document.createElement('div');
    tools.className = 'lecture-tools';
    // Clicks here must not select the row and open its editor, or start a drag.
    for (const type of ['click', 'pointerdown', 'mousedown'] as const) {
      tools.addEventListener(type, (event) => event.stopPropagation());
    }

    if (block.block_type === 'heading') {
      headingTools(block, tools);
    } else if (block.block_type === 'section' && isSidePath(block)) {
      // No switch back to a chapter: a nested side path can't become one.
      tools.append(note(sidePathNote(block)));
      tools.append(narration(block, '🎙 Narration'));
    } else if (block.block_type === 'section') {
      chapterTools(block, tools);
    } else if (GATES.has(block.block_type)) {
      gateTools(block, tools);
    } else {
      return null;
    }
    return tools;
  }

  function attach(target: HTMLElement, block: Block): void {
    if (!inReach(block)) return;
    if (Array.from(target.children).some((child) => child.classList.contains('lecture-tools'))) return;
    const tools = toolsFor(block);
    if (tools) target.append(tools);
  }

  return {
    decorate(row: HTMLElement, block: Block): void {
      if (!options.isLecture()) return;
      attach(row, block);
      // Blocks inside a section preview get their own strip.
      for (const el of row.querySelectorAll<HTMLElement>('.block[data-block-id]')) {
        const id = el.dataset.blockId;
        if (!id || id === block.id) continue;
        const inner = findBlockById(options.getBlocks(), id);
        if (inner) attach(el, inner);
      }
    }
  };
}
