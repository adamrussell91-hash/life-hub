/**
 * Block editors for the divider (tools on or off, saved timers), the Tools
 * block and the countdown header.
 */
import type { Block, ClassroomToolId, TimerSegment } from '@/schemas/block';
import { editorShell, type BlockChangeHandler } from '@/blocks/editors';
import { ALL_TOOLS, TIMER_PRESETS, TOOL_LABEL, stackTotalMinutes, formatClock } from '@/blocks/classroom-tools/logic';
import './classroom-tools.css';

type DividerBlock = Extract<Block, { block_type: 'divider' }>;
type ToolsBlock = Extract<Block, { block_type: 'classroom_tools' }>;
type CountdownBlock = Extract<Block, { block_type: 'countdown' }>;

let editorSeed = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(labelText: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  const label = el('label', 'ct-editor__field');
  label.append(el('span', 'ct-editor__label', labelText), control);
  if (hint) label.append(el('span', 'block-editor__hint', hint));
  return label;
}

/**
 * The saved timer stack: rows of name + minutes, presets, add and remove.
 * Calls `onStack` with the new stack on every change.
 */
export function createTimerStackEditor(initial: TimerSegment[], onStack: (stack: TimerSegment[]) => void): HTMLElement {
  const uid = (editorSeed += 1);
  let stack = initial.map((seg) => ({ ...seg }));
  const root = el('div', 'ct-editor__stack');
  const heading = el('p', 'ct-editor__label', 'Saved timers');
  const hint = el('p', 'block-editor__hint', 'Ready to start when the lesson opens. Leave empty for a single 5 minute timer.');
  const rows = el('div', 'ct-stack');
  const presets = el('div', 'ct-presets');
  const add = el('button', 'ct-btn ct-btn--sm', '+ Add a timer');
  add.type = 'button';
  const total = el('span', 'ct-sub ct-sub--end');
  root.append(heading, hint, presets, rows, el('div', 'ct-row'));
  (root.lastElementChild as HTMLElement).append(add, total);

  presets.append(el('span', 'ct-inline', 'Presets'));
  for (const preset of TIMER_PRESETS) {
    const chip = el('button', 'ct-chip ct-chip--sm', preset.label);
    chip.type = 'button';
    chip.addEventListener('click', () => {
      stack = preset.stack.map((seg) => ({ ...seg }));
      emit();
    });
    presets.append(chip);
  }

  const emit = () => {
    onStack(stack.map((seg) => ({ ...seg })));
    paint();
  };

  function paint(): void {
    rows.replaceChildren(
      ...stack.map((seg, i) => {
        const line = el('div', 'ct-seg');
        const name = el('input', 'ct-seg__name');
        name.type = 'text';
        name.id = `ct-ed-seg-${uid}-${i}`;
        name.value = seg.label;
        name.maxLength = 60;
        name.placeholder = 'Name, e.g. Reading time';
        name.setAttribute('aria-label', `Timer ${i + 1} name`);
        name.addEventListener('input', () => {
          stack[i] = { ...stack[i], label: name.value };
          onStack(stack.map((s) => ({ ...s })));
        });
        const mins = el('input', 'ct-num');
        mins.type = 'number';
        mins.id = `ct-ed-min-${uid}-${i}`;
        mins.min = '0.5';
        mins.max = '180';
        mins.step = '0.5';
        mins.value = String(seg.minutes);
        mins.setAttribute('aria-label', `Timer ${i + 1} minutes`);
        mins.addEventListener('change', () => {
          stack[i] = { ...stack[i], minutes: Math.min(180, Math.max(0.5, Number(mins.value) || 1)) };
          emit();
        });
        const minLabel = el('label', 'ct-inline');
        minLabel.append(mins, el('span', '', 'min'));
        const remove = el('button', 'ct-btn ct-btn--sm', 'Remove');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove timer ${i + 1}`);
        remove.addEventListener('click', () => {
          stack = stack.filter((_, j) => j !== i);
          emit();
        });
        line.append(el('span', 'ct-seg__dot'), name, minLabel, remove);
        return line;
      })
    );
    add.disabled = stack.length >= 8;
    total.textContent = stack.length ? `${stack.length} ${stack.length === 1 ? 'timer' : 'timers'} · ${formatClock(stackTotalMinutes(stack) * 60_000)} total` : 'No saved timers';
  }

  add.addEventListener('click', () => {
    if (stack.length >= 8) return;
    stack = [...stack, { label: stack.length ? 'Next' : 'Timer', minutes: 5 }];
    emit();
  });
  paint();
  return root;
}

export function createDividerEditor(
  block: DividerBlock,
  onChange: BlockChangeHandler<DividerBlock>,
  getLatest: () => DividerBlock = () => block
): HTMLElement {
  const fields = el('div', 'block-editor__fields ct-editor');
  const toggle = el('input');
  toggle.type = 'checkbox';
  toggle.id = `ct-ed-tools-${(editorSeed += 1)}`;
  toggle.checked = block.content?.tools !== false;
  const toggleLabel = el('label', 'ct-inline');
  toggleLabel.append(toggle, el('span', '', 'Classroom tools on this divider'));
  const hint = el('p', 'block-editor__hint', 'A faint gear at the end of the line opens the timer, name picker and other tools in the gap between the blocks. Students only get the timer, stopwatch, technique spinner, coin and dice.');
  const stack = createTimerStackEditor(block.content?.timer_stack ?? [], (timer_stack) => {
    const latest = getLatest();
    onChange({ ...latest, content: { tools: latest.content?.tools !== false, timer_stack } });
  });
  stack.hidden = !toggle.checked;
  toggle.addEventListener('change', () => {
    const latest = getLatest();
    stack.hidden = !toggle.checked;
    onChange({ ...latest, content: { tools: toggle.checked, timer_stack: latest.content?.timer_stack ?? [] } });
  });
  fields.append(toggleLabel, hint, stack);
  return editorShell(block, onChange, fields, getLatest);
}

export function createClassroomToolsEditor(
  block: ToolsBlock,
  onChange: BlockChangeHandler<ToolsBlock>,
  getLatest: () => ToolsBlock = () => block
): HTMLElement {
  const fields = el('div', 'block-editor__fields ct-editor');
  const start = el('select', 'ct-select');
  start.id = `ct-ed-start-${(editorSeed += 1)}`;
  const none = el('option', '', 'None, show the tool row');
  none.value = '';
  start.append(none);
  for (const tool of ALL_TOOLS) {
    const option = el('option', '', TOOL_LABEL[tool]);
    option.value = tool;
    start.append(option);
  }
  start.value = block.content?.start_tool ?? '';
  start.addEventListener('change', () => {
    const latest = getLatest();
    onChange({
      ...latest,
      content: { timer_stack: latest.content?.timer_stack ?? [], start_tool: (start.value || undefined) as ClassroomToolId | undefined }
    });
  });
  const stack = createTimerStackEditor(block.content?.timer_stack ?? [], (timer_stack) => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, timer_stack } });
  });
  fields.append(
    field('Open on', start, 'If students can’t use this tool (names, number, groups, scores), they see the tool row instead.'),
    stack
  );
  return editorShell(block, onChange, fields, getLatest);
}

export function createCountdownEditor(
  block: CountdownBlock,
  onChange: BlockChangeHandler<CountdownBlock>,
  getLatest: () => CountdownBlock = () => block
): HTMLElement {
  const uid = (editorSeed += 1);
  const fields = el('div', 'block-editor__fields ct-editor ct-editor--countdown');
  const input = (type: string, id: string, value: string, placeholder = '') => {
    const node = el('input');
    node.type = type;
    node.id = `ct-cd-${id}-${uid}`;
    node.value = value;
    if (placeholder) node.placeholder = placeholder;
    return node;
  };
  const c = block.content;
  const title = input('text', 'title', c.title, 'e.g. Narrative writing task');
  title.maxLength = 200;
  const due = input('date', 'due', c.due_date);
  const time = input('time', 'time', c.due_time);
  const set = input('date', 'set', c.set_date);
  const note = el('textarea');
  note.id = `ct-cd-note-${uid}`;
  note.rows = 2;
  note.maxLength = 400;
  note.value = c.note;
  note.placeholder = 'Optional, e.g. Submit through the class page';

  const emit = () => {
    onChange({
      ...getLatest(),
      content: { title: title.value, due_date: due.value, due_time: time.value, set_date: set.value, note: note.value }
    });
  };
  for (const node of [title, due, time, set, note]) node.addEventListener(node === due || node === set || node === time ? 'change' : 'input', emit);

  fields.append(
    field('Task', title),
    field('Due date', due, 'Counts every day, including weekends, holidays and pupil-free days.'),
    field('Due time', time),
    field('Date set', set, 'Optional. Adds a bar of days gone.'),
    field('Note', note)
  );
  return editorShell(block, onChange, fields, getLatest);
}
