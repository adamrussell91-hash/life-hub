import type { Block } from '@/schemas/block';

type Mode = 'teacher' | 'student' | 'print';
export type CalloutTarget = { block_id: string; question_id?: string };
type Target = CalloutTarget & { label: string; preview: string };
const ICONS: Record<string, [string, string]> = {
  information: ['Information', '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'],
  important: ['Important', '<path d="M5 21V3m0 0h14l-3 5 3 5H5"/>'],
  warning: ['Warning', '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>'],
  extension: ['Extension', '<path d="M12 21V3m-5 5 5-5 5 5M12 14H5v5m7-5h7v5"/>'],
  scaffold: ['Scaffold', '<path d="M6 3v18M18 3v18M6 7h12M6 12h12M6 17h12"/>'],
  example: ['Example', '<path d="M12 5v16m0-16C8 2 3 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-4-2-7-1-10 1Z"/>'],
  remember: ['Remember', '<path d="M3 10a9 9 0 0 1 16-4l2 3M21 3v6h-6m6 5a9 9 0 0 1-16 4l-2-3m0 6v-6h6"/>'],
  teacher: ['Teacher', '<path d="m2 8 10-5 10 5-10 5L2 8Zm4 3v6c4 3 8 3 12 0v-6m4-3v9"/>']
};

export function calloutIdentity(style: string): HTMLElement {
  const [label, paths] = ICONS[style] ?? ICONS.information!;
  const identity = document.createElement('span');
  identity.className = 'callout__identity';
  identity.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  identity.append(document.createTextNode(label));
  return identity;
}

function visibleBlocks(blocks: Block[], mode: Mode): Block[] {
  return blocks.flatMap(block => {
    if (mode !== 'teacher' && block.visibility === 'teacher_only') return [];
    let children: Block[] = [];
    if (block.block_type === 'section') children = block.content.blocks as Block[];
    if (block.block_type === 'columns') children = block.content.columns.flatMap(c => c.blocks) as Block[];
    if (block.block_type === 'tabs') children = block.content.tabs.flatMap(t => t.blocks) as Block[];
    return [block, ...visibleBlocks(children, mode)];
  });
}

export function calloutTargets(blocks: Block[], mode: Mode): Target[] {
  return visibleBlocks(blocks, mode).flatMap((block, index) => {
    const content = block.content as Record<string, unknown>;
    const label = [content.title, content.text, content.prompt, content.label].find(v => typeof v === 'string' && v.trim()) as string | undefined;
    const name = label?.slice(0, 100) ?? `${block.block_type.replaceAll('_', ' ')} ${index + 1}`;
    const preview = [content.prompt, content.text, content.body, content.title].find(v => typeof v === 'string' && v.trim()) as string | undefined;
    const target: Target = { block_id: block.id, label: name, preview: preview ?? name };
    if (block.block_type !== 'question_set') return [target];
    return [target, ...block.content.questions.map((question, i) => ({
      block_id: block.id, question_id: question.id,
      label: `${name} · Question ${i + 1}`, preview: question.prompt
    }))];
  });
}

function key(target: CalloutTarget): string {
  return JSON.stringify([target.block_id, target.question_id ?? null]);
}

export function createCalloutTargetPicker(
  block: Extract<Block, { block_type: 'callout' }>,
  blocks: Block[],
  onChange: (target: CalloutTarget | undefined) => void
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'block-editor__callout-target';
  select.setAttribute('aria-label', 'Related activity or question');
  const none = document.createElement('option'); none.value = ''; none.textContent = 'No related activity';
  select.append(none);
  const targets = calloutTargets(blocks, 'teacher').filter(target => target.block_id !== block.id);
  for (const target of targets) {
    const option = document.createElement('option'); option.value = key(target); option.textContent = target.label;
    select.append(option);
  }
  const selected = block.content.related_to ? key(block.content.related_to) : '';
  if (selected && !targets.some(target => key(target) === selected)) {
    const missing = document.createElement('option'); missing.value = selected;
    missing.textContent = 'Linked activity unavailable — choose a replacement'; select.append(missing);
  }
  select.value = selected;
  select.addEventListener('change', () => {
    const target = targets.find(target => key(target) === select.value);
    if (!select.value) onChange(undefined);
    else if (target) onChange({ block_id: target.block_id, ...(target.question_id ? {question_id: target.question_id} : {}) });
  });
  return select;
}

function references(blocks: Block[], mode: Mode): Array<Target & { marker: string }> {
  const used = new Set(visibleBlocks(blocks, mode).flatMap(block =>
    block.block_type === 'callout' && block.content.related_to && block.content.related_to.block_id !== block.id
      ? [key(block.content.related_to)] : []));
  return calloutTargets(blocks, mode).filter(target => used.has(key(target))).map((target, i) => {
    // Spreadsheet-style letters keep markers short without a 26-target cap.
    let number = i + 1, marker = '';
    while (number) { number--; marker = String.fromCharCode(65 + number % 26) + marker; number = Math.floor(number / 26); }
    return { ...target, marker };
  });
}

function marker(text: string): HTMLSpanElement {
  const pill = document.createElement('span'); pill.className = 'callout-ref'; pill.textContent = text; return pill;
}

function tabPath(blocks: Block[], targetId: string): string[] | null {
  for (const block of blocks) {
    if (block.id === targetId) return [];
    if (block.block_type === 'tabs') {
      for (const tab of block.content.tabs) {
        const nested = tabPath(tab.blocks as Block[], targetId);
        if (nested) return [`${block.id}-panel-${tab.id}`, ...nested];
      }
    }
    const children = block.block_type === 'section' ? block.content.blocks as Block[]
      : block.block_type === 'columns' ? block.content.columns.flatMap(column => column.blocks) as Block[] : [];
    const nested = tabPath(children, targetId);
    if (nested) return nested;
  }
  return null;
}

function jump(source: HTMLElement, target: Target, blocks: Block[]): boolean {
  const scope = source.closest('.lesson-page--blocks, .lesson-page__canvas, .lesson-blocks, .unit-plan') ?? source.parentElement;
  // The teacher may still be editing the destination. Let the canvas restore
  // previews before locating it, while retaining this stable page scope.
  source.dispatchEvent(new CustomEvent('callout-reference-jump', { bubbles: true }));
  // Inactive tab panels are empty. Resolve their path from saved blocks before
  // looking for the target DOM node, opening outer tabs before inner ones.
  for (const panelId of tabPath(blocks, target.block_id) ?? []) {
    const panel = Array.from(scope?.querySelectorAll<HTMLElement>('[role="tabpanel"]') ?? []).find(node => node.id === panelId);
    if (panel?.hidden) {
      Array.from(scope?.querySelectorAll<HTMLButtonElement>('[role="tab"][aria-controls]') ?? [])
        .find(node => node.getAttribute('aria-controls') === panelId)?.click();
    }
  }
  const block = Array.from(scope?.querySelectorAll<HTMLElement>('.block[data-block-id], [data-block-id]') ?? [])
    .find(node => node.dataset.blockId === target.block_id);
  const destination = target.question_id
    ? Array.from(block?.querySelectorAll<HTMLElement>('[data-question-id]') ?? []).find(node => node.dataset.questionId === target.question_id)
    : block;
  if (!destination) return false;
  for (let ancestor: HTMLElement | null = destination; ancestor && ancestor !== scope; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    if (ancestor.getAttribute('role') === 'tabpanel' && ancestor.hidden) {
      const tab = Array.from(scope?.querySelectorAll<HTMLButtonElement>('[role="tab"][aria-controls]') ?? [])
        .find(node => node.getAttribute('aria-controls') === ancestor!.id);
      tab?.click();
    }
  }
  destination.tabIndex = -1;
  destination.classList.add('callout-ref-target');
  destination.focus({ preventScroll: true });
  destination.scrollIntoView?.({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return true;
}

/** Decorates independent blocks; it never moves or nests a callout. */
export function decorateCalloutReferences(wrapper: HTMLElement, block: Block, mode: Mode, blocks: Block[]): void {
  const refs = references(blocks, mode);
  for (const ref of refs.filter(ref => ref.block_id === block.id)) {
    const target = ref.question_id
      ? Array.from(wrapper.querySelectorAll<HTMLElement>('[data-question-id]')).find(node => node.dataset.questionId === ref.question_id)
      : wrapper;
    target?.append(marker(ref.marker));
  }
  if (block.block_type !== 'callout' || !block.content.related_to) return;
  const ref = refs.find(ref => key(ref) === key(block.content.related_to!));
  const head = wrapper.querySelector('.callout__head');
  if (!head) return;
  if (!ref) {
    if (mode === 'teacher') {
      const missing = document.createElement('span'); missing.className = 'callout-ref__missing';
      missing.textContent = 'Linked activity unavailable'; head.append(missing);
    }
    return;
  }
  if (mode === 'print') {
    const label = document.createElement('span'); label.className = 'callout-ref__print';
    label.textContent = `${ref.marker} · ${ref.label}`; head.append(label); return;
  }
  const disclosure = document.createElement('details'); disclosure.className = 'callout-reference';
  const summary = document.createElement('summary'); summary.setAttribute('aria-label', `Reference ${ref.marker}: ${ref.label}`);
  summary.append(marker(ref.marker), document.createTextNode(ref.label));
  const preview = document.createElement('div'); preview.className = 'callout-ref__preview';
  const title = document.createElement('strong'); title.textContent = ref.label;
  const text = document.createElement('p'); text.textContent = ref.preview;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn--ghost callout-ref__jump';
  button.textContent = ref.question_id ? 'Jump to question' : 'Jump to activity';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.hidden = true;
  button.addEventListener('click', () => {
    if (jump(wrapper, ref, blocks)) disclosure.open = false;
    else { status.textContent = 'This activity is no longer on the page.'; status.hidden = false; }
  });
  disclosure.addEventListener('click', event => event.stopPropagation());
  disclosure.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); disclosure.open = false; summary.focus(); }
  });
  preview.append(title, text, button, status); disclosure.append(summary, preview); head.append(disclosure);
}

/** Refresh references after an edit without replacing inputs or their caret. */
export function refreshCalloutReferences(scope: HTMLElement, blocks: Block[], mode: Mode): void {
  scope.querySelectorAll('.callout-ref, .callout-reference, .callout-ref__missing, .callout-ref__print').forEach(node => node.remove());
  const byId = new Map(visibleBlocks(blocks, mode).map(block => [block.id, block]));
  scope.querySelectorAll<HTMLElement>('.block[data-block-id]').forEach(wrapper => {
    const block = byId.get(wrapper.dataset.blockId ?? '');
    if (block) decorateCalloutReferences(wrapper, block, mode, blocks);
  });
}
