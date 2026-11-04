import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';
import './sheet.css';

export type SharedSheet = {
  title: string;
  message?: string;
  from?: string;
  meeting_date?: string | null;
  time_zone?: string | null;
  summary?: string;
  blocks?: Block[];
  minutes?: Array<{ heading: string; text: string }>;
  coaching?: Array<{ technique: string; steps: Array<{ step: string; seen: string; next: string }> }>;
  shared_at?: string;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dateLabel(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const format = (zone?: string) =>
    date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...(zone ? { timeZone: zone } : {}) });
  try {
    return format(timeZone ?? undefined);
  } catch {
    return format();
  }
}

function section(label: string): HTMLElement {
  const node = el('section', 'shared-sheet__section');
  node.append(el('h2', 'shared-sheet__label', label));
  return node;
}

function blocksLabel(blocks: Block[]): string {
  const annotated = blocks.filter((block) => block.block_type === 'annotation').length;
  if (annotated === blocks.length) return 'Annotations';
  return annotated ? 'Notes and annotations' : 'Notes';
}

/** Nothing on a sheet takes typing, even if a block brings its own box. Layer ticks stay: they only choose what to read. */
function lockTyping(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"])').forEach((node) => {
    if (node.isContentEditable) node.setAttribute('contenteditable', 'false');
    else (node as HTMLInputElement).disabled = true;
  });
}

/** The whole sheet: the sender's preview and the page behind the link. */
export function renderSharedSheet(sheet: SharedSheet): { el: HTMLElement; dispose(): void } {
  const root = el('article', 'shared-sheet');
  const top = el('header', 'shared-sheet__top');
  top.append(el('h1', 'shared-sheet__title', sheet.title));
  const by = [sheet.from ? `From ${sheet.from}` : '', dateLabel(sheet.meeting_date, sheet.time_zone)].filter(Boolean).join(' · ');
  if (by) top.append(el('p', 'shared-sheet__by', by));
  root.append(top);
  if (sheet.message) root.append(el('p', 'shared-sheet__message', sheet.message));

  let parts = 0;
  if (sheet.summary) {
    parts += 1;
    const node = section('Summary');
    node.append(el('p', 'shared-sheet__text', sheet.summary));
    root.append(node);
  }
  const blocks = sheet.blocks ?? [];
  if (blocks.length) {
    parts += 1;
    const node = section(blocksLabel(blocks));
    const list = el('div', 'shared-sheet__blocks');
    for (const block of blocks) list.append(renderBlock(block, 'student', { pageBlocks: blocks, saveScope: 'shared-sheet' }));
    node.append(list);
    root.append(node);
  }
  if (sheet.minutes?.length) {
    parts += 1;
    const node = section('Minutes');
    for (const item of sheet.minutes) {
      const row = el('div', 'shared-sheet__item');
      if (item.heading) row.append(el('h3', undefined, item.heading));
      row.append(el('p', 'shared-sheet__text', item.text));
      node.append(row);
    }
    root.append(node);
  }
  if (sheet.coaching?.length) {
    parts += 1;
    const node = section('Coaching sheet');
    for (const item of sheet.coaching) {
      const row = el('div', 'shared-sheet__item');
      row.append(el('h3', undefined, item.technique));
      for (const step of item.steps) {
        const text = [step.seen && `Seen: ${step.seen}`, step.next && `Next: ${step.next}`].filter(Boolean).join('\n');
        row.append(el('p', 'shared-sheet__text', `Step ${step.step}\n${text}`));
      }
      node.append(row);
    }
    root.append(node);
  }
  if (!parts) root.append(el('p', 'shared-sheet__empty', 'Nothing on this sheet yet.'));
  const shared = dateLabel(sheet.shared_at);
  root.append(el('p', 'shared-sheet__end', shared ? `Shared on ${shared}. Read only.` : 'Read only.'));

  // The note covers the bottom of a narrow screen, so bring its mark up clear of it.
  root.addEventListener('click', (event) => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 999px)').matches) return;
    const mark = event.target instanceof Element ? event.target.closest('.block-annotation__anchor') : null;
    if (mark) requestAnimationFrame(() => mark.scrollIntoView?.({ block: 'center' }));
  });

  lockTyping(root);
  // Blocks repaint as they are read, so a box drawn later is locked as well.
  const observer = new MutationObserver(() => lockTyping(root));
  observer.observe(root, { childList: true, subtree: true });
  return { el: root, dispose: () => observer.disconnect() };
}
