import type { Block } from '@/schemas/block';

type Mode = 'teacher' | 'student' | 'print';
export type CalloutTarget = { block_id: string; question_id?: string };
type Target = CalloutTarget & { label: string; preview: string };
// A single pictogram family for block headings and every linked badge.
// Soft filled silhouettes carry the shape; rounded ink strokes carry the detail.
const ICONS: Record<string, [string, string]> = {
  cultural_warning: ['Cultural warning', '<path fill="#171717" stroke="none" d="M2 5h20v7H2z"/><path fill="#c33228" stroke="none" d="M2 12h20v7H2z"/><circle cx="12" cy="12" r="4" fill="#f5ce35" stroke="none"/>'],
  information: ['Information', '<path class="callout__icon-wash" d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M11 10h1v5h1"/><circle cx="12" cy="7" r=".8" fill="currentColor" stroke="none"/>'],
  important: ['Important', '<path class="callout__icon-wash" d="m12 2 3 3 4 .5.5 4 2.5 3-2.5 3-.5 4-4 .5-3 2-3-2-4-.5-.5-4L2 12.5 4.5 9l.5-3.5L9 5Z"/><path d="m12 7 1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L7 10.5l3.5-.5L12 7Z"/>'],
  warning: ['Warning', '<path class="callout__icon-wash" d="M10.3 4a2 2 0 0 1 3.4 0l7.5 13a2 2 0 0 1-1.7 3H4.5a2 2 0 0 1-1.7-3L10.3 4Z"/><path d="M12 8v5"/><circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none"/>'],
  extension: ['Extension', '<path class="callout__icon-wash" d="M4 3h6v18H4zM13 3h8v9h-8z"/><path d="M7 20V8m0 7c0-5 10-3 10-9m-3 1 3-3 3 3"/><circle cx="7" cy="19" r="2" fill="var(--paper)"/><path d="M5 4h4"/>'],
  scaffold: ['Scaffold', '<path class="callout__icon-wash" d="M3 16h6v-6h6V4h6v16H3Z"/><path d="M3 16h6v-6h6V4h6M5 20h16M7 17v3m6-9v9m6-15v15"/>'],
  example: ['Example', '<rect class="callout__icon-wash" x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h7M8 11h4m-4 5 2 2 5-5M17 7h.01"/><path d="M17 17h4m-2-2v4"/>'],
  remember: ['Remember', '<path class="callout__icon-wash" d="M6 3h12v18l-6-3-6 3V3Z"/><path d="M7 12h10m-5-1c-6-1-5-6-2-4l2 4Zm0 0c6-1 5-6 2-4l-2 4Zm0 1-2 4m2-4 2 4"/>'],
  teacher: ['Teacher', '<path class="callout__icon-wash" d="M3 12c3-2 6-1 9 1 3-2 6-3 9-1v9c-3-2-6-1-9 1-3-2-6-3-9-1v-9Z"/><circle cx="12" cy="6" r="3"/><path d="M3 12c3-2 6-1 9 1 3-2 6-3 9-1m-9 1v9M6 16l3 1m6 0 3-1"/>']
};

/** Recognise existing explicitly titled warnings without rewriting lesson content. */
export function resolvedCalloutStyle(content: { style: string; title?: string }): string {
  return content.style === 'information' && /^cultural warning\b/i.test(content.title?.trim() ?? '')
    ? 'cultural_warning' : content.style;
}

export function calloutIdentity(style: string): HTMLElement {
  const [label, paths] = ICONS[style] ?? ICONS.information!;
  const identity = document.createElement('span');
  identity.className = 'callout__identity block-eyebrow';
  identity.dataset.calloutStyle = ICONS[style] ? style : 'information';
  identity.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
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

type Callout = Extract<Block, { block_type: 'callout' }>;
type Reference = Target & { callout: Callout };

function references(blocks: Block[], mode: Mode): Reference[] {
  const targets = new Map(calloutTargets(blocks, mode).map(target => [key(target), target]));
  return visibleBlocks(blocks, mode).flatMap(block => {
    if (block.block_type !== 'callout' || !block.content.related_to || block.content.related_to.block_id === block.id) return [];
    const target = targets.get(key(block.content.related_to));
    // One reference per callout, even when several share a target or type.
    return target ? [{ ...target, callout: block }] : [];
  });
}

function marker(style: string, showLabel = true): HTMLSpanElement {
  const pill = document.createElement('span'); pill.className = 'callout-ref';
  const identity = calloutIdentity(style);
  if (!showLabel) Array.from(identity.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
  pill.append(identity);
  return pill;
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

function referencePreview(
  wrapper: HTMLElement, iconStyle: string, label: string, titleText: string,
  previewText: string, destination: Target, blocks: Block[], attached: boolean
): HTMLDetailsElement {
  const disclosure = document.createElement('details');
  disclosure.className = `callout-reference${attached ? ' callout-reference--attached' : ''}`;
  const summary = document.createElement('summary');
  summary.setAttribute('aria-label', label);
  summary.title = label;
  summary.append(marker(iconStyle, attached));
  if (!attached) summary.append(document.createTextNode(titleText));
  const preview = document.createElement('div'); preview.className = 'callout-ref__preview';
  const title = document.createElement('strong'); title.textContent = titleText;
  const text = document.createElement('p'); text.textContent = previewText;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn--ghost callout-ref__jump';
  const typeName = (ICONS[iconStyle] ?? ICONS.information!)[0];
  button.textContent = attached ? `Jump to ${typeName.toLowerCase()}` : destination.question_id ? 'Jump to question' : 'Jump to activity';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.hidden = true;
  button.addEventListener('click', () => {
    if (jump(wrapper, destination, blocks)) disclosure.open = false;
    else { status.textContent = 'This activity is no longer on the page.'; status.hidden = false; }
  });
  disclosure.addEventListener('click', event => event.stopPropagation());
  disclosure.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); disclosure.open = false; summary.focus(); }
  });
  preview.append(title, text, button, status); disclosure.append(summary, preview);
  return disclosure;
}

/** Decorates independent blocks; it never moves or nests a callout. */
export function decorateCalloutReferences(wrapper: HTMLElement, block: Block, mode: Mode, blocks: Block[]): void {
  const refs = references(blocks, mode);
  const groups = new Map<HTMLElement, HTMLElement>();
  for (const ref of refs.filter(ref => ref.block_id === block.id)) {
    const target = ref.question_id
      ? Array.from(wrapper.querySelectorAll<HTMLElement>('[data-question-id]')).find(node => node.dataset.questionId === ref.question_id)
      : wrapper;
    if (!target) continue;
    let group = groups.get(target);
    if (!group) {
      group = document.createElement('div'); group.className = 'callout-ref-list';
      group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Related callouts');
      groups.set(target, group);
      if (target === wrapper) {
        // Sits in the block's top-right corner, left of the feedback dot, so it never adds a row above the content.
        if (mode !== 'print') { group.classList.add('callout-ref-list--corner'); wrapper.classList.add('callout-ref-host'); }
        target.prepend(group);
      }
      else {
        const prompt = Array.from(target.children).find(child => child.classList.contains('block-question-set__prompt'));
        if (prompt) prompt.after(group); else target.append(group);
      }
    }
    if (mode === 'print') { group.append(marker(resolvedCalloutStyle(ref.callout.content))); continue; }
    const typeName = (ICONS[resolvedCalloutStyle(ref.callout.content)] ?? ICONS.information!)[0];
    const title = ref.callout.content.title?.trim() || typeName;
    const destination: Target = { block_id: ref.callout.id, label: title, preview: ref.callout.content.body };
    const badge = referencePreview(wrapper, resolvedCalloutStyle(ref.callout.content), `${typeName}: ${title}. Preview related callout`, title, ref.callout.content.body, destination, blocks, true);
    badge.dataset.calloutId = ref.callout.id;
    group.append(badge);
  }
  if (block.block_type !== 'callout' || !block.content.related_to) return;
  const ref = refs.find(ref => ref.callout.id === block.id);
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
    label.append(marker(block.content.style, false), document.createTextNode(ref.label)); head.append(label); return;
  }
  const typeName = (ICONS[block.content.style] ?? ICONS.information!)[0];
  head.append(referencePreview(wrapper, block.content.style, `${typeName} for ${ref.label}`, ref.label, ref.preview, ref, blocks, false));
}

/** Refresh references after an edit without replacing inputs or their caret. */
export function refreshCalloutReferences(scope: HTMLElement, blocks: Block[], mode: Mode): void {
  scope.querySelectorAll('.callout-ref-list, .callout-reference, .callout-ref__missing, .callout-ref__print').forEach(node => node.remove());
  const byId = new Map(visibleBlocks(blocks, mode).map(block => [block.id, block]));
  scope.querySelectorAll<HTMLElement>('.block[data-block-id]').forEach(wrapper => {
    const block = byId.get(wrapper.dataset.blockId ?? '');
    if (block) decorateCalloutReferences(wrapper, block, mode, blocks);
  });
}
