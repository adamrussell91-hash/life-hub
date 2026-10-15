import { ApiClientError } from '@/api/client';
import { askTextCard } from '@/teacher/confirm-dialog';
import type { Block } from '@/schemas/block';
import {
  DIRECT_CONTEXT,
  MAX_EXAMPLE_LENGTH,
  fetchTeacherExamples,
  postTeacherExample,
  type ExampleContext,
  type TeacherExampleAction,
  type TeacherExamples,
  type TeacherExampleSlot
} from '@/class-examples/api';
import { offerTimedUndo, showHubToast } from '../../design-kit/js/hub-feedback.js';
import { HUB_LIST_ICONS, createHubMenuButton, openHubMenu } from '../../design-kit/js/hub-list.js';

/**
 * Teacher side of class examples, drawn inside each lesson block row.
 *
 * A quiet "+" on hover adds a box under the block. Each box gets its own
 * one-use three-digit code. Answers are kept per class, so switching the
 * class shows that class's answers and a reused lesson starts empty.
 */

export interface TeacherClassExamplesHandle {
  decorate(row: HTMLElement, block: Block): void;
  dispose(): void;
}

export interface TeacherClassExamplesOptions {
  lessonId: string;
  /** Test seam for the default class: `YYYY-MM-DD` in the teacher's time zone. */
  today?: () => string;
}

const WATCH_MS = 8_000;

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Today's class first, then the class that last had it, then the next one. */
export function pickDefaultContext(contexts: ExampleContext[], today: string, remembered?: string | null): string {
  if (remembered && contexts.some((ctx) => ctx.id === remembered)) return remembered;
  const classes = contexts.filter((ctx) => ctx.id !== DIRECT_CONTEXT);
  const todays = classes.find((ctx) => ctx.dates.includes(today));
  if (todays) return todays.id;
  let recent: { id: string; date: string } | null = null;
  let upcoming: { id: string; date: string } | null = null;
  for (const ctx of classes) {
    for (const date of ctx.dates) {
      if (date <= today && (!recent || date > recent.date)) recent = { id: ctx.id, date };
      if (date > today && (!upcoming || date < upcoming.date)) upcoming = { id: ctx.id, date };
    }
  }
  return recent?.id ?? upcoming?.id ?? classes[0]?.id ?? DIRECT_CONTEXT;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', className, label);
  btn.type = 'button';
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return btn;
}

function plusIcon(): string {
  return HUB_LIST_ICONS.plus;
}

type Chip = { text: string; tone: 'muted' | 'wave' | 'gold' | 'success' | 'danger'; live?: boolean };

function chipFor(slot: TeacherExampleSlot): Chip {
  const { status, shown } = slot.entry;
  if (status === 'open') return { text: 'Waiting for code', tone: 'wave' };
  if (status === 'writing') return { text: 'Student writing', tone: 'wave', live: true };
  if (status === 'locked') return { text: 'Locked', tone: 'danger' };
  if (status === 'saved' && shown) return { text: 'Showing to class', tone: 'success' };
  if (status === 'saved') return { text: 'Ready to show', tone: 'gold' };
  return { text: 'Empty', tone: 'muted' };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'network_error') return "Couldn't reach the server. Try again.";
    if (error.message) return error.message;
  }
  return 'That did not save. Try again.';
}

export function createTeacherClassExamples(options: TeacherClassExamplesOptions): TeacherClassExamplesHandle {
  const { lessonId } = options;
  const today = options.today ?? localToday;
  const rememberKey = `class-examples:context:${lessonId}`;

  let data: TeacherExamples | null = null;
  let context: string | null = null;
  let disposed = false;
  let watchTimer: ReturnType<typeof setTimeout> | null = null;
  let loadSeq = 0;

  const hosts = new Map<string, { host: HTMLElement; block: Block }>();
  const editing = new Map<string, string>();
  const busy = new Set<string>();
  const fresh = new Set<string>();

  function remembered(): string | null {
    try {
      return localStorage.getItem(rememberKey);
    } catch {
      return null;
    }
  }

  function remember(id: string): void {
    try {
      localStorage.setItem(rememberKey, id);
    } catch {
      /* ignore */
    }
  }

  function currentContext(): ExampleContext | undefined {
    return data?.contexts.find((ctx) => ctx.id === data?.context);
  }

  /* ── Data ──────────────────────────────────────────────────────────── */

  function apply(next: TeacherExamples): void {
    if (data && data.context === next.context) {
      for (const slot of next.slots) {
        const before = data.slots.find((row) => row.id === slot.id)?.entry.status;
        if ((before === 'writing' || before === 'open') && slot.entry.status === 'saved') {
          fresh.add(slot.id);
          showHubToast(`${slot.label}: a student saved their example. Check it, then show it to the class.`, {
            tone: 'success'
          });
        }
      }
    }
    data = next;
    context = next.context;
    paintAll();
    scheduleWatch();
  }

  async function load(nextContext?: string): Promise<void> {
    const seq = ++loadSeq;
    try {
      const result = await fetchTeacherExamples(lessonId, nextContext ?? context ?? undefined);
      if (disposed || seq !== loadSeq) return;
      if (!context && !nextContext) {
        const preferred = pickDefaultContext(result.contexts, today(), remembered());
        if (preferred !== result.context) {
          context = preferred;
          void load(preferred);
          return;
        }
      }
      apply(result);
    } catch {
      // Leave the blocks as they are; the "+" still offers to add a box.
    }
  }

  async function act(body: TeacherExampleAction, slotId?: string): Promise<TeacherExamples | null> {
    if (slotId) {
      busy.add(slotId);
      paintAll();
    }
    try {
      const result = await postTeacherExample(lessonId, context ?? DIRECT_CONTEXT, body);
      if (disposed) return null;
      if (slotId) busy.delete(slotId);
      apply(result);
      return result;
    } catch (error) {
      if (slotId) busy.delete(slotId);
      if (!disposed) {
        paintAll();
        showHubToast(errorMessage(error), { tone: 'danger' });
      }
      return null;
    }
  }

  /** While a box is open or a student is writing, check every few seconds. */
  function scheduleWatch(): void {
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = null;
    const waiting = data?.slots.some((slot) => slot.entry.status === 'open' || slot.entry.status === 'writing');
    if (!waiting || disposed) return;
    watchTimer = setTimeout(() => {
      if (document.hidden) scheduleWatch();
      else void load();
    }, WATCH_MS);
  }

  function switchContext(id: string): void {
    if (id === context) return;
    remember(id);
    context = id;
    editing.clear();
    fresh.clear();
    void load(id);
  }

  /* ── Actions ───────────────────────────────────────────────────────── */

  async function addSlot(block: Block): Promise<void> {
    const count = data?.slots.filter((slot) => slot.block_id === block.id).length ?? 0;
    const suggestion = block.block_type === 'question_set' ? `Question ${count + 1}` : `Example ${count + 1}`;
    const label = await askTextCard({
      eyebrow: 'Class example',
      title: 'Name this example box',
      supporting: 'Students see this name above the box, so use the question it answers.',
      value: suggestion,
      confirmLabel: 'Add box'
    });
    if (!label || disposed) return;
    await act({ action: 'add_slot', block_id: block.id, label });
  }

  async function renameSlot(slot: TeacherExampleSlot): Promise<void> {
    const label = await askTextCard({
      eyebrow: 'Class example',
      title: 'Rename example box',
      value: slot.label,
      confirmLabel: 'Rename'
    });
    if (!label || label === slot.label || disposed) return;
    await act({ action: 'rename_slot', slot_id: slot.id, label }, slot.id);
  }

  async function removeSlot(slot: TeacherExampleSlot): Promise<void> {
    const index = data?.slots.findIndex((row) => row.id === slot.id) ?? -1;
    const result = await act({ action: 'remove_slot', slot_id: slot.id });
    const removed = result?.removed;
    if (!removed) return;
    offerTimedUndo({
      message: `${slot.label} example box removed`,
      onUndo: () => {
        void act({ action: 'restore_slot', slot: removed, index: Math.max(0, index) });
      }
    });
  }

  /* ── Painting ──────────────────────────────────────────────────────── */

  function contextControl(): HTMLElement {
    const contexts = data?.contexts ?? [];
    const current = currentContext();
    if (contexts.length <= 1) {
      return el('span', 'cx-panel__context cx-panel__context--static', current?.label ?? 'Lesson link');
    }
    const trigger = el('button', 'cx-panel__context');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-label', `Answers for ${current?.label ?? 'this class'}. Change class`);
    trigger.append(el('span', 'cx-panel__context-for', 'For'), el('span', 'cx-panel__context-name', current?.label ?? ''));
    const caret = el('span', 'cx-panel__caret');
    caret.setAttribute('aria-hidden', 'true');
    trigger.append(caret);
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      openHubMenu(
        trigger,
        contexts.map((ctx) => ({
          label: ctx.label,
          hint: ctx.id === data?.context ? 'Showing' : ctx.detail,
          icon: ctx.id === data?.context ? HUB_LIST_ICONS.check : '',
          onSelect: () => switchContext(ctx.id)
        })),
        { label: 'Show answers for' }
      );
    });
    return trigger;
  }

  function codeDisplay(code: string): HTMLElement {
    const box = el('div', 'cx-code');
    box.setAttribute('role', 'text');
    box.setAttribute('aria-label', `Code ${code.split('').join(' ')}`);
    for (const digit of code) {
      const cell = el('span', 'cx-code__digit', digit);
      cell.setAttribute('aria-hidden', 'true');
      box.append(cell);
    }
    return box;
  }

  function slotMenu(slot: TeacherExampleSlot): HTMLButtonElement {
    return createHubMenuButton(
      () => {
        const hasText = Boolean(slot.entry.text);
        return [
          { label: 'Rename', icon: HUB_LIST_ICONS.edit, onSelect: () => void renameSlot(slot) },
          ...(hasText
            ? [
                {
                  label: 'Edit example',
                  icon: HUB_LIST_ICONS.edit,
                  onSelect: () => {
                    editing.set(slot.id, slot.entry.text ?? '');
                    paintAll();
                    document
                      .querySelector<HTMLTextAreaElement>(`.cx-row[data-slot-id="${slot.id}"] textarea`)
                      ?.focus();
                  }
                },
                {
                  label: 'New code for a new answer',
                  icon: HUB_LIST_ICONS.plus,
                  hint: 'Keeps this one until saved',
                  onSelect: () => void act({ action: 'open', slot_id: slot.id }, slot.id)
                },
                {
                  label: 'Clear example',
                  icon: HUB_LIST_ICONS.trash,
                  hold: true,
                  onSelect: () => void act({ action: 'clear', slot_id: slot.id }, slot.id)
                }
              ]
            : []),
          'separator' as const,
          {
            label: 'Remove box',
            icon: HUB_LIST_ICONS.trash,
            danger: true,
            hold: true,
            onSelect: () => void removeSlot(slot)
          }
        ];
      },
      { label: `${slot.label} example options`, className: 'cx-row__menu' }
    );
  }

  function editor(slot: TeacherExampleSlot): HTMLElement {
    const form = el('form', 'cx-row__edit');
    form.noValidate = true;
    const field = el('textarea', 'cx-row__field');
    field.value = editing.get(slot.id) ?? '';
    field.maxLength = MAX_EXAMPLE_LENGTH;
    field.rows = 4;
    field.setAttribute('aria-label', `Edit ${slot.label} example`);
    field.addEventListener('input', () => editing.set(slot.id, field.value));
    field.addEventListener('click', (event) => event.stopPropagation());
    const actions = el('div', 'cx-row__actions');
    const save = el('button', 'btn btn--primary', 'Save');
    save.type = 'submit';
    actions.append(
      save,
      button('btn btn--ghost', 'Cancel', () => {
        editing.delete(slot.id);
        paintAll();
      })
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = field.value.trim();
      if (!text) return;
      void act({ action: 'edit_text', slot_id: slot.id, text }, slot.id).then((result) => {
        if (result) {
          editing.delete(slot.id);
          paintAll();
        }
      });
    });
    form.append(field, actions);
    return form;
  }

  function slotRow(slot: TeacherExampleSlot): HTMLElement {
    const { entry } = slot;
    const row = el('li', 'cx-row');
    row.dataset.slotId = slot.id;
    row.dataset.status = entry.shown ? 'shown' : entry.status;
    if (busy.has(slot.id)) row.classList.add('cx-row--busy');
    if (fresh.has(slot.id)) row.classList.add('cx-row--fresh');

    const top = el('div', 'cx-row__top');
    const chip = chipFor(slot);
    const chipEl = el('span', `cx-chip cx-chip--${chip.tone}`);
    if (chip.live) chipEl.append(el('span', 'cx-chip__pulse'));
    chipEl.append(document.createTextNode(chip.text));
    const title = el('div', 'cx-row__title');
    const name = el('span', 'cx-row__label', slot.label);
    name.title = slot.label;
    title.append(name, chipEl);
    top.append(title, slotMenu(slot));
    row.append(top);

    const body = el('div', 'cx-row__body');
    const actions = el('div', 'cx-row__actions');
    const run = (body: TeacherExampleAction) => () => {
      fresh.delete(slot.id);
      void act(body, slot.id);
    };

    if (editing.has(slot.id)) {
      body.append(editor(slot));
      row.append(body);
      return row;
    }

    switch (entry.status) {
      case 'open': {
        const codeWrap = el('div', 'cx-row__code');
        codeWrap.append(codeDisplay(entry.code ?? '---'));
        const note = el('p', 'cx-row__note', 'Read this to the student. It works once.');
        if (entry.attempts > 0) {
          note.append(el('span', 'cx-row__attempts', ` ${entry.attempts} wrong ${entry.attempts === 1 ? 'try' : 'tries'} so far.`));
        }
        codeWrap.append(note);
        body.append(codeWrap);
        actions.append(
          button('btn btn--ghost', 'New code', run({ action: 'open', slot_id: slot.id })),
          button('btn btn--ghost', 'Close', run({ action: 'close', slot_id: slot.id }))
        );
        break;
      }
      case 'writing':
        body.append(el('p', 'cx-row__note', 'They have the box open. Their answer lands here when they save.'));
        actions.append(button('btn btn--ghost', 'Close', run({ action: 'close', slot_id: slot.id })));
        break;
      case 'locked':
        body.append(
          el('p', 'cx-row__note', `Locked after ${data?.max_wrong_codes ?? 10} wrong codes. Give the student a new code.`)
        );
        actions.append(
          button('btn btn--primary', 'New code', run({ action: 'open', slot_id: slot.id })),
          button('btn btn--ghost', 'Close', run({ action: 'close', slot_id: slot.id }))
        );
        break;
      case 'saved':
        body.append(el('p', 'cx-row__text', entry.text ?? ''));
        actions.append(
          entry.shown
            ? button('btn btn--secondary', 'Hide from class', run({ action: 'hide', slot_id: slot.id }))
            : button('btn btn--primary', 'Show to class', run({ action: 'show', slot_id: slot.id }))
        );
        break;
      default:
        body.append(el('p', 'cx-row__note', 'Open it to give one student a three-digit code.'));
        actions.append(button('btn btn--secondary', 'Open for a student', run({ action: 'open', slot_id: slot.id })));
    }

    // A replacement in progress keeps the earlier answer visible to you.
    if ((entry.status === 'open' || entry.status === 'writing' || entry.status === 'locked') && entry.text) {
      const keep = el('p', 'cx-row__kept');
      keep.append(el('span', 'cx-row__kept-label', entry.shown ? 'Showing now: ' : 'Current: '), document.createTextNode(entry.text));
      body.append(keep);
    }

    row.append(body, actions);
    row.querySelectorAll('button').forEach((btn) => {
      if (busy.has(slot.id)) btn.disabled = true;
    });
    return row;
  }

  function paintHost(host: HTMLElement, block: Block): void {
    const slots = data?.slots.filter((slot) => slot.block_id === block.id) ?? [];
    if (!slots.length) {
      host.replaceChildren();
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const focusedSlot = (document.activeElement as HTMLElement | null)?.closest?.('.cx-row')?.getAttribute('data-slot-id');

    const panel = el('div', 'cx-panel');
    const head = el('div', 'cx-panel__head');
    head.append(el('span', 'cx-panel__eyebrow', 'Class examples'), contextControl());
    const list = el('ol', 'cx-panel__list');
    for (const slot of slots) list.append(slotRow(slot));
    const add = button('cx-panel__add', 'Add another', () => void addSlot(block));
    const icon = el('span', 'cx-panel__add-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = plusIcon();
    add.prepend(icon);
    panel.append(head, list, add);
    // Clicks inside the panel belong to it, not to the block row.
    panel.addEventListener('click', (event) => event.stopPropagation());
    host.replaceChildren(panel);

    if (focusedSlot && editing.has(focusedSlot)) {
      host.querySelector<HTMLTextAreaElement>(`.cx-row[data-slot-id="${focusedSlot}"] textarea`)?.focus();
    }
  }

  function paintAll(): void {
    for (const [blockId, entry] of hosts) {
      if (!entry.host.isConnected) {
        hosts.delete(blockId);
        continue;
      }
      paintHost(entry.host, entry.block);
    }
  }

  void load();

  return {
    decorate(row: HTMLElement, block: Block) {
      const add = button('cx-add', '', () => void addSlot(block));
      add.setAttribute('aria-label', 'Add a class example under this block');
      const icon = el('span', 'cx-add__icon');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = plusIcon();
      add.append(icon, document.createTextNode('Class example'));
      const host = el('div', 'cx-teacher');
      host.hidden = true;
      row.append(host, add);
      hosts.set(block.id, { host, block });
      paintHost(host, block);
    },
    dispose() {
      disposed = true;
      if (watchTimer) clearTimeout(watchTimer);
      hosts.clear();
    }
  };
}
