import type { OdysseyNode, Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import {
  addOdysseyChild,
  findOdysseyPath,
  newOdysseyNode,
  removeOdysseyNode,
  somedayOdysseyPaths
} from '@/domain/someday';
import { errorMessage, showViewLoading, withBusy } from '@/views/feedback';
import { el, labeledField } from '@/views/hub-kit';

const PATH_COLORS = ['wave', 'success', 'lilac'] as const;
type PathColor = (typeof PATH_COLORS)[number];

function colorFor(rootIndex: number): PathColor {
  return PATH_COLORS[rootIndex % PATH_COLORS.length];
}

function rangeField(label: string, value: number, onInput: (next: number) => void): HTMLElement {
  const wrap = el('label', 'someday-odyssey__range');
  const top = el('div', 'someday-odyssey__range-top');
  top.append(el('span', '', label));
  const readout = el('span', 'someday-odyssey__range-value', String(value));
  top.append(readout);
  wrap.append(top);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.value = String(value);
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => {
    readout.textContent = input.value;
    onInput(Number(input.value));
  });
  wrap.append(input);
  return wrap;
}

export async function renderSomedayOdysseyView(canvas: HTMLElement, taskId: string): Promise<void> {
  showViewLoading(canvas, 'Loading the daydream…', '.someday-odyssey');
  try {
    const task = await tasksApi.getTask(taskId);
    let tree = somedayOdysseyPaths(task);
    let focusedId: string | null = null;
    const paint = () => paintOdyssey(canvas, task, tree, focusedId, {
      onFocus: (id) => {
        focusedId = id;
        paint();
      },
      onTreeChange: async (next) => {
        tree = next;
        await tasksApi.updateTask(task.id, { odyssey_paths: next });
        paint();
      }
    });
    paint();
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load this daydream.')));
  }
}

type OdysseyHandlers = {
  onFocus: (id: string | null) => void;
  onTreeChange: (next: OdysseyNode[]) => void | Promise<void>;
};

function buildAddForm(
  parentId: string | null,
  color: PathColor,
  tree: OdysseyNode[],
  handlers: OdysseyHandlers
): HTMLElement {
  const form = el('form', `someday-odyssey__add someday-odyssey__add--${color}`);
  const titleField = document.createElement('input');
  titleField.type = 'text';
  titleField.required = true;
  titleField.placeholder = parentId ? 'Branch this further…' : 'A new road out from here…';
  titleField.className = 'hub-search__input';
  titleField.setAttribute('aria-label', 'Path title');
  form.append(labeledField('Title', titleField));

  const questionField = document.createElement('input');
  questionField.type = 'text';
  questionField.placeholder = 'What would this path prove?';
  questionField.className = 'hub-search__input';
  questionField.setAttribute('aria-label', 'Path question');
  form.append(labeledField('Question', questionField));

  let resources = 50;
  let confidence = 50;
  let coherence = 50;
  const gauges = el('div', 'someday-odyssey__gauges');
  gauges.append(
    rangeField('Resources', resources, (v) => (resources = v)),
    rangeField('Confidence', confidence, (v) => (confidence = v)),
    rangeField('Coherence', coherence, (v) => (coherence = v))
  );
  form.append(gauges);

  const submit = el('button', 'btn btn--primary btn--sm', 'Add path');
  submit.type = 'submit';
  form.append(submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = titleField.value.trim();
    if (!title) return;
    const child = newOdysseyNode({
      title,
      question: questionField.value.trim(),
      resources,
      confidence,
      coherence
    });
    void withBusy([submit], async () => {
      await handlers.onTreeChange(addOdysseyChild(tree, parentId, child));
      handlers.onFocus(child.id);
    });
  });

  return form;
}

function buildNodeChip(
  node: OdysseyNode,
  color: PathColor,
  isFocused: boolean,
  hasHiddenChildren: boolean
): HTMLElement {
  const chip = el('button', `someday-odyssey__chip someday-odyssey__chip--${color}${isFocused ? ' is-focused' : ''}`);
  chip.type = 'button';
  const dot = el('span', 'someday-odyssey__chip-dot', node.title.slice(0, 1).toUpperCase() || '·');
  chip.append(dot);
  chip.append(el('span', 'someday-odyssey__chip-label', node.title || 'Untitled path'));
  if (hasHiddenChildren) chip.append(el('span', 'someday-odyssey__chip-badge', String(node.children.length)));
  return chip;
}

function renderLevel(
  nodes: OdysseyNode[],
  focusedPath: OdysseyNode[],
  depth: number,
  rootIndex: number,
  tree: OdysseyNode[],
  handlers: OdysseyHandlers
): HTMLElement {
  const level = el('div', `someday-odyssey__level someday-odyssey__level--${depth}`);
  for (const node of nodes) {
    const wrap = el('div', 'someday-odyssey__node');
    const isFocused = focusedPath[depth]?.id === node.id;
    const color = colorFor(depth === 0 ? nodes.indexOf(node) : rootIndex);
    const chip = buildNodeChip(node, color, isFocused, !isFocused && node.children.length > 0);
    chip.addEventListener('click', () => handlers.onFocus(node.id));
    wrap.append(chip);

    if (isFocused) {
      const nextRootIndex = depth === 0 ? nodes.indexOf(node) : rootIndex;
      if (node.children.length) {
        wrap.append(renderLevel(node.children, focusedPath, depth + 1, nextRootIndex, tree, handlers));
      } else {
        const hint = el('p', 'someday-odyssey__leaf-hint', 'No branches yet — add one below, or send this to Someday.');
        wrap.append(hint);
      }
    }
    level.append(wrap);
  }
  return level;
}

function buildDetailPanel(
  task: Task,
  focused: OdysseyNode | null,
  color: PathColor | null,
  handlers: OdysseyHandlers,
  tree: OdysseyNode[],
  parentId: string | null
): HTMLElement {
  const panel = el('div', 'someday-odyssey__detail glass-tile');
  if (!focused) {
    panel.append(
      el('p', 'someday-odyssey__detail-label', 'Currently viewing'),
      el('p', 'someday-odyssey__detail-title', task.title),
      el('p', 'someday-odyssey__detail-copy', task.description || 'The starting point — sketch a road out from here.')
    );
    return panel;
  }
  panel.append(
    el('p', `someday-odyssey__detail-label someday-odyssey__detail-label--${color}`, 'Currently viewing'),
    el('p', 'someday-odyssey__detail-title', focused.title || 'Untitled path')
  );
  if (focused.question) {
    panel.append(el('p', 'someday-odyssey__detail-question', `“${focused.question}”`));
  }
  panel.append(
    el(
      'p',
      'someday-odyssey__detail-stats',
      `Resources ${focused.resources} · Confidence ${focused.confidence} · Coherence ${focused.coherence}`
    )
  );

  const actions = el('div', 'someday-odyssey__detail-actions');
  const send = el('button', 'btn btn--decisive', 'Send back as a Someday');
  send.type = 'button';
  send.addEventListener('click', () => {
    void withBusy([send], async () => {
      await tasksApi.createTask({
        title: focused.title || 'Untitled path',
        description: focused.question,
        domain: task.domain,
        bucket: 'someday',
        status: 'deferred',
        life_area: task.life_area ?? null,
        maturity: 'new'
      });
      location.hash = '#/someday';
    });
  });
  const remove = el('button', 'btn btn--ghost', 'Remove this path');
  remove.type = 'button';
  remove.addEventListener('click', () => {
    if (!window.confirm(`Remove "${focused.title || 'this path'}" and everything under it?`)) return;
    void handlers.onTreeChange(removeOdysseyNode(tree, focused.id));
    handlers.onFocus(parentId);
  });
  actions.append(send, remove);
  panel.append(actions);
  return panel;
}

function paintOdyssey(
  canvas: HTMLElement,
  task: Task,
  tree: OdysseyNode[],
  focusedId: string | null,
  handlers: OdysseyHandlers
): void {
  canvas.replaceChildren();
  const root = el('div', 'someday-odyssey');

  const back = el('a', 'someday-back-link', '← Someday');
  back.href = '#/someday';
  root.append(back);

  root.append(
    el('h2', 'someday-odyssey__title', `Odyssey mode — ${task.title}`),
    el('p', 'someday-odyssey__subtitle', 'Branch any path as far as it goes. Walk back up the way you came.')
  );

  const focusedPath = focusedId ? findOdysseyPath(tree, focusedId) ?? [] : [];

  const crumb = el('nav', 'someday-odyssey__breadcrumb');
  crumb.setAttribute('aria-label', 'Dream path');
  const youCrumb = el('button', `someday-odyssey__crumb${focusedId === null ? ' is-current' : ''}`, 'You, now');
  youCrumb.type = 'button';
  youCrumb.addEventListener('click', () => handlers.onFocus(null));
  crumb.append(youCrumb);
  focusedPath.forEach((node, i) => {
    crumb.append(el('span', 'someday-odyssey__crumb-sep', '›'));
    const isCurrent = i === focusedPath.length - 1;
    const btn = el('button', `someday-odyssey__crumb${isCurrent ? ' is-current' : ''}`, node.title || 'Untitled');
    btn.type = 'button';
    btn.addEventListener('click', () => handlers.onFocus(node.id));
    crumb.append(btn);
  });
  root.append(crumb);

  const board = el('div', 'someday-odyssey__board glass-tile');
  if (tree.length === 0) {
    board.append(el('p', 'someday-odyssey__empty', 'No roads sketched yet — add the first one below.'));
  } else {
    board.append(renderLevel(tree, focusedPath, 0, 0, tree, handlers));
  }
  root.append(board);

  const focusedNode = focusedPath[focusedPath.length - 1] ?? null;
  const focusedColor = focusedPath.length ? colorFor(tree.indexOf(focusedPath[0])) : null;
  const parentId = focusedPath.length > 1 ? focusedPath[focusedPath.length - 2].id : null;
  root.append(buildDetailPanel(task, focusedNode, focusedColor, handlers, tree, parentId));

  const addColor = focusedColor ?? colorFor(tree.length);
  root.append(buildAddForm(focusedId, addColor, tree, handlers));

  canvas.append(root);
}
