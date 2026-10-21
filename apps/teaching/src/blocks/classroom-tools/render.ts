/**
 * Renderers for the divider (with its toolbox), the Tools block and the
 * countdown header. Print mode never shows tools: a divider is just a rule.
 */
import type { Block } from '@/schemas/block';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { mountToolbox } from '@/blocks/classroom-tools/toolbox';
import { countdownState, formatDueDay, formatDueTime, isoDay } from '@/blocks/classroom-tools/logic';
import './classroom-tools.css';

type DividerBlock = Extract<Block, { block_type: 'divider' }>;
type ToolsBlock = Extract<Block, { block_type: 'classroom_tools' }>;
type CountdownBlock = Extract<Block, { block_type: 'countdown' }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const viewerFor = (mode: RenderMode): 'teacher' | 'student' => (mode === 'teacher' ? 'teacher' : 'student');

export function renderDividerContent(block: DividerBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  if (mode === 'print' || block.content?.tools === false) {
    const hr = el('hr', 'block-divider');
    return hr;
  }
  const host = el('div', 'block-divider block-divider--tools');
  mountToolbox(host, {
    kind: 'divider',
    viewer: viewerFor(mode),
    timerStack: block.content?.timer_stack ?? [],
    lessonId: ctx.lessonId,
    pageBlocks: ctx.pageBlocks,
    key: block.id
  });
  return host;
}

export function renderClassroomToolsContent(block: ToolsBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  if (mode === 'print') {
    return el('p', 'block-print-fallback__label', 'Classroom tools (on screen only)');
  }
  const host = el('section', 'classroom-tools');
  host.setAttribute('aria-label', 'Classroom tools');
  mountToolbox(host, {
    kind: 'block',
    viewer: viewerFor(mode),
    timerStack: block.content?.timer_stack ?? [],
    startTool: block.content?.start_tool,
    lessonId: ctx.lessonId,
    pageBlocks: ctx.pageBlocks,
    key: block.id
  });
  return host;
}

/** Header for an assessment page. Counts every day to the due date, weekends and holidays included. */
export function renderCountdownContent(block: CountdownBlock, _mode: RenderMode, today = isoDay(new Date())): HTMLElement {
  const { title, due_date, due_time, set_date, note } = block.content;
  const root = el('header', 'countdown');
  const text = el('div', 'countdown__text');
  text.append(el('p', 'countdown__eyebrow block-eyebrow', 'Assessment'));
  text.append(el('h2', 'countdown__title block-title', title.trim() || 'Assessment task'));
  const dueLine = el('p', 'countdown__due block-secondary');
  if (due_date) {
    const time = formatDueTime(due_time);
    dueLine.textContent = `Due ${formatDueDay(due_date)}${time ? `, ${time}` : ''}`;
  } else {
    dueLine.textContent = 'Due date to be set';
  }
  text.append(dueLine);
  if (note.trim()) text.append(el('p', 'countdown__note block-body', note.trim()));
  root.append(text);

  const state = countdownState({ due_date, set_date }, today);
  const figure = el('div', 'countdown__figure');
  if (state.kind === 'upcoming') {
    figure.append(el('span', 'countdown__n', String(state.days)), el('small', 'block-eyebrow', state.days === 1 ? 'day to go' : 'days to go'));
  } else if (state.kind === 'today') {
    figure.append(el('span', 'countdown__n countdown__n--word', 'Today'), el('small', 'block-eyebrow', 'due today'));
    root.classList.add('countdown--today');
  } else if (state.kind === 'past') {
    figure.append(el('span', 'countdown__n countdown__n--word', 'Closed'), el('small', 'block-eyebrow', state.days === 1 ? 'due yesterday' : `due ${state.days} days ago`));
    root.classList.add('countdown--past');
  } else {
    figure.append(el('span', 'countdown__n', '–'), el('small', 'block-eyebrow', 'days to go'));
  }
  root.append(figure);

  if (state.kind === 'upcoming' && state.total !== null && state.gone !== null && state.total <= 120) {
    const ticks = el('div', 'countdown__ticks');
    ticks.setAttribute('role', 'img');
    ticks.setAttribute('aria-label', `${state.gone} of ${state.total} days gone`);
    for (let i = 0; i < state.total; i += 1) ticks.append(el('i', i < state.gone ? 'is-gone' : ''));
    root.append(ticks);
  }
  return root;
}
