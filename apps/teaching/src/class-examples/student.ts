import { ApiClientError } from '@/api/client';
import {
  DIRECT_CONTEXT,
  MAX_EXAMPLE_LENGTH,
  fetchPublicExamples,
  submitExample,
  unlockExample,
  type PublicExampleSlot
} from '@/class-examples/api';

/**
 * Student side of class examples. A block's boxes sit under it as a row of
 * tabs; only the box a student picks opens, so the lesson stays compact.
 * The page checks for newly shared examples about once a minute, and only
 * while the tab is visible and the lesson has at least one box.
 */

type LocalState =
  | { mode: 'idle' }
  | { mode: 'code' }
  /** `context` is the class the box was opened in, sent back on save. */
  | { mode: 'writing'; token: string; draft: string; open: boolean; context?: string }
  | { mode: 'saved'; text: string };

export interface StudentClassExamplesHandle {
  dispose(): void;
}

export interface MountStudentClassExamplesOptions {
  lessonId: string;
  classId?: string;
  /** Test seam: the default reads `document`. */
  doc?: Document;
}

const DEFAULT_POLL_MS = 60_000;

function errorText(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'wrong_code') {
      const left = (error.details as { attempts_left?: number } | undefined)?.attempts_left;
      if (typeof left === 'number') {
        return `That code didn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
      }
      return "That code didn't match.";
    }
    if (error.code === 'not_yours') {
      return 'Your teacher closed this box. Your writing is still here, so copy it if you need it.';
    }
    if (error.code === 'network_error') {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    if (error.message) return error.message;
  }
  return 'Something went wrong. Try again.';
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

function readSession(key: string): LocalState | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalState;
    if (parsed?.mode === 'writing' && typeof parsed.token === 'string') {
      return { ...parsed, draft: String(parsed.draft ?? ''), open: true };
    }
    if (parsed?.mode === 'saved' && typeof parsed.text === 'string') return parsed;
  } catch {
    /* storage unavailable: the box still works for this page view */
  }
  return null;
}

function writeSession(key: string, state: LocalState | null): void {
  try {
    if (!state || state.mode === 'idle' || state.mode === 'code') sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

let fieldSeq = 0;

export function mountStudentClassExamples(
  root: HTMLElement,
  options: MountStudentClassExamplesOptions
): StudentClassExamplesHandle {
  const { lessonId, classId } = options;
  const doc = options.doc ?? document;
  const context = classId || DIRECT_CONTEXT;
  const classParam = classId || undefined;

  let slots: PublicExampleSlot[] = [];
  let pollMs = DEFAULT_POLL_MS;
  let lastFetch = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let inFlight = false;

  const local = new Map<string, LocalState>();
  /** Per block: the open tab's slot id, or null once the student closed it. */
  const selected = new Map<string, string | null>();
  const groups = new Map<
    string,
    { group: HTMLElement; strip: HTMLElement | null; stripSig: string; panel: HTMLElement | null; panelSig: string }
  >();

  const storageKey = (slotId: string) => `class-example:${lessonId}:${context}:${slotId}`;

  function stateFor(slotId: string): LocalState {
    let state = local.get(slotId);
    if (!state) {
      state = readSession(storageKey(slotId)) ?? { mode: 'idle' };
      local.set(slotId, state);
    }
    return state;
  }

  function setState(slotId: string, state: LocalState): void {
    local.set(slotId, state);
    writeSession(storageKey(slotId), state);
  }

  function signature(slot: PublicExampleSlot): string {
    const state = stateFor(slot.id);
    return [slot.label, slot.shown, slot.text ?? '', state.mode, state.mode === 'writing' ? state.open : ''].join('\u0000');
  }

  function isBusy(slot: PublicExampleSlot): boolean {
    const state = stateFor(slot.id);
    return state.mode === 'code' || (state.mode === 'writing' && state.open);
  }

  /** Something of this student's own is in the box, so open its tab unasked. */
  function isMine(slot: PublicExampleSlot): boolean {
    const state = stateFor(slot.id);
    return state.mode === 'code' || state.mode === 'writing' || (state.mode === 'saved' && !slot.shown);
  }

  const panelId = (slotId: string) => `cx-panel-${slotId}`;

  function blockElement(blockId: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`.block[data-block-id="${blockId}"]`);
  }

  function groupFor(blockId: string): HTMLElement | null {
    const block = blockElement(blockId);
    if (!block) return null;
    const next = block.nextElementSibling;
    if (next instanceof HTMLElement && next.classList.contains('cx-group') && next.dataset.for === blockId) {
      return next;
    }
    const group = el('div', 'cx-group');
    group.dataset.for = blockId;
    block.after(group);
    return group;
  }

  /* ── Views ─────────────────────────────────────────────────────────── */

  /** The tab already names the box, so the panel head only carries the status. */
  function header(extra: HTMLElement): HTMLElement {
    const head = el('div', 'cx-slot__head');
    head.append(extra);
    return head;
  }

  function codeButton(slot: PublicExampleSlot): HTMLButtonElement {
    const state = stateFor(slot.id);
    const continuing = state.mode === 'writing';
    const btn = el('button', 'cx-slot__code-btn', continuing ? 'Continue writing' : 'Have a code?');
    btn.type = 'button';
    if (!continuing) btn.setAttribute('aria-label', `Have a code? Write the class example for ${slot.label}`);
    btn.addEventListener('click', () => {
      if (state.mode === 'writing') setState(slot.id, { ...state, open: true });
      else setState(slot.id, { mode: 'code' });
      paint(slot, { focus: true });
    });
    return btn;
  }

  function message(): HTMLElement {
    const msg = el('p', 'cx-msg');
    msg.setAttribute('role', 'alert');
    msg.hidden = true;
    return msg;
  }

  function showMessage(msg: HTMLElement, text: string): void {
    msg.textContent = text;
    msg.hidden = !text;
  }

  function unlockForm(slot: PublicExampleSlot): HTMLElement {
    const form = el('form', 'cx-unlock');
    form.noValidate = true;
    const id = `cx-code-${++fieldSeq}`;
    const label = el('label', 'cx-unlock__label', 'Code from your teacher');
    label.htmlFor = id;
    const input = el('input', 'cx-unlock__input');
    input.id = id;
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.maxLength = 3;
    input.pattern = '[0-9]*';
    input.placeholder = '000';
    input.setAttribute('aria-describedby', `${id}-msg`);
    const unlock = el('button', 'btn btn--primary', 'Unlock');
    unlock.type = 'submit';
    const cancel = el('button', 'btn btn--ghost', 'Cancel');
    cancel.type = 'button';
    const row = el('div', 'cx-unlock__row');
    row.append(input, unlock, cancel);
    const msg = message();
    msg.id = `${id}-msg`;

    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 3);
      if (digits !== input.value) input.value = digits;
      showMessage(msg, '');
    });
    cancel.addEventListener('click', () => {
      setState(slot.id, { mode: 'idle' });
      paint(slot);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = input.value.trim();
      if (!/^\d{3}$/.test(code)) {
        showMessage(msg, 'Codes are three digits.');
        input.focus();
        return;
      }
      unlock.disabled = true;
      unlock.textContent = 'Checking…';
      void unlockExample(lessonId, { class: classParam, slot_id: slot.id, code })
        .then(({ token, context: openedIn }) => {
          if (disposed) return;
          setState(slot.id, { mode: 'writing', token, draft: '', open: true, context: openedIn });
          paint(slot, { focus: true });
        })
        .catch((error: unknown) => {
          if (disposed) return;
          unlock.disabled = false;
          unlock.textContent = 'Unlock';
          showMessage(msg, errorText(error));
          form.classList.remove('cx-unlock--shake');
          void form.offsetWidth;
          form.classList.add('cx-unlock--shake');
          input.select();
        });
    });

    form.append(label, row, msg);
    return form;
  }

  function writeForm(slot: PublicExampleSlot, state: Extract<LocalState, { mode: 'writing' }>): HTMLElement {
    const form = el('form', 'cx-write');
    form.noValidate = true;
    const id = `cx-write-${++fieldSeq}`;
    const label = el('label', 'cx-write__label', `Your example for ${slot.label}`);
    label.htmlFor = id;
    const field = el('textarea', 'cx-write__field');
    field.id = id;
    field.rows = 4;
    field.maxLength = MAX_EXAMPLE_LENGTH;
    field.value = state.draft;
    const count = el('span', 'cx-write__count');
    const note = el('span', 'cx-write__note', 'Saving locks it. Your teacher shares it with the class.');
    const foot = el('div', 'cx-write__foot');
    foot.append(note, count);
    const save = el('button', 'btn btn--primary', 'Save example');
    save.type = 'submit';
    const later = el('button', 'btn btn--ghost', 'Not now');
    later.type = 'button';
    const actions = el('div', 'cx-actions');
    actions.append(save, later);
    const msg = message();

    const sync = () => {
      count.textContent = `${field.value.length} / ${MAX_EXAMPLE_LENGTH}`;
      save.disabled = !state.token || !field.value.trim();
      field.style.height = 'auto';
      field.style.height = `${Math.max(field.scrollHeight, 96)}px`;
    };
    field.addEventListener('input', () => {
      setState(slot.id, { ...state, draft: field.value });
      state.draft = field.value;
      sync();
    });
    later.addEventListener('click', () => {
      setState(slot.id, { ...state, draft: field.value, open: false });
      paint(slot);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = field.value.trim();
      if (!text || !state.token) return;
      save.disabled = true;
      save.textContent = 'Saving…';
      void submitExample(lessonId, { class: state.context ?? classParam, slot_id: slot.id, token: state.token, text })
        .then(() => {
          if (disposed) return;
          setState(slot.id, { mode: 'saved', text });
          paint(slot);
        })
        .catch((error: unknown) => {
          if (disposed) return;
          save.textContent = 'Save example';
          if (error instanceof ApiClientError && error.code === 'not_yours') {
            state.token = '';
            setState(slot.id, { ...state, draft: field.value });
          }
          showMessage(msg, errorText(error));
          sync();
        });
    });

    form.append(label, field, foot, actions, msg);
    queueMicrotask(sync);
    return form;
  }

  function renderSlot(slot: PublicExampleSlot): HTMLElement {
    const state = stateFor(slot.id);
    const section = el('section', 'cx-slot');
    section.id = panelId(slot.id);
    section.dataset.slotId = slot.id;
    section.setAttribute('aria-label', `Class example: ${slot.label}`);

    if (state.mode === 'code') {
      section.classList.add('cx-slot--active');
      section.append(unlockForm(slot));
      return section;
    }
    if (state.mode === 'writing' && state.open) {
      section.classList.add('cx-slot--active');
      section.append(writeForm(slot, state));
      return section;
    }
    if (state.mode === 'saved' && !slot.shown) {
      section.classList.add('cx-slot--sent');
      section.append(
        header(el('span', 'cx-chip', 'Sent to your teacher')),
        el('p', 'cx-slot__text', state.text),
        el('p', 'cx-slot__hint', 'It appears here for everyone once your teacher shares it.')
      );
      return section;
    }
    if (slot.shown) {
      section.classList.add('cx-slot--shown');
      section.append(el('p', 'cx-slot__text', slot.text ?? ''));
      const foot = el('div', 'cx-slot__foot');
      foot.append(codeButton(slot));
      section.append(foot);
      return section;
    }
    section.classList.add('cx-slot--waiting');
    const head = header(codeButton(slot));
    head.prepend(el('p', 'cx-slot__hint', "A classmate's answer will appear here."));
    section.append(head);
    return section;
  }

  function tabDot(slot: PublicExampleSlot): HTMLElement | null {
    const state = stateFor(slot.id);
    const [tone, said] = slot.shown
      ? ['shown', 'shared']
      : state.mode === 'saved'
        ? ['sent', 'sent to your teacher']
        : state.mode === 'writing'
          ? ['active', 'in progress']
          : ['', ''];
    if (!tone) return null;
    const dot = el('span', `cx-tab__dot cx-tab__dot--${tone}`);
    dot.append(el('span', 'cx-sr', `, ${said}`));
    return dot;
  }

  function tabStrip(blockId: string, blockSlots: PublicExampleSlot[], current: string | null): HTMLElement {
    const strip = el('div', 'cx-tabs');
    strip.append(el('span', 'cx-tabs__eyebrow', 'Class examples'));
    const list = el('div', 'cx-tabs__list');
    for (const slot of blockSlots) {
      const on = slot.id === current;
      const tab = el('button', on ? 'cx-tab cx-tab--on' : 'cx-tab');
      tab.type = 'button';
      tab.dataset.slotId = slot.id;
      tab.setAttribute('aria-expanded', String(on));
      tab.setAttribute('aria-controls', panelId(slot.id));
      tab.append(el('span', 'cx-tab__label', slot.label));
      const dot = tabDot(slot);
      if (dot) tab.append(dot);
      tab.addEventListener('click', () => {
        selected.set(blockId, on ? null : slot.id);
        paintGroup(blockId, { force: true });
        root.querySelector<HTMLElement>(`.cx-tab[data-slot-id="${slot.id}"]`)?.focus();
      });
      list.append(tab);
    }
    strip.append(list);
    return strip;
  }

  function existingGroup(blockId: string): HTMLElement | null {
    const next = blockElement(blockId)?.nextElementSibling;
    return next instanceof HTMLElement && next.classList.contains('cx-group') && next.dataset.for === blockId
      ? next
      : null;
  }

  /**
   * Redraws one block's tabs and its open box. Without `force`, an open box
   * the student is typing in is left alone so a refresh never wipes it.
   */
  function paintGroup(blockId: string, opts: { force?: boolean; focus?: boolean } = {}): void {
    const blockSlots = slots.filter((slot) => slot.block_id === blockId);
    if (!blockSlots.length) {
      existingGroup(blockId)?.remove();
      groups.delete(blockId);
      return;
    }
    const group = groupFor(blockId);
    if (!group) return;

    if (!selected.has(blockId)) {
      const mine = blockSlots.find(isMine);
      if (mine) selected.set(blockId, mine.id);
    }
    const current = blockSlots.find((slot) => slot.id === selected.get(blockId)) ?? null;

    let view = groups.get(blockId);
    if (!view || view.group !== group) {
      view = { group, strip: null, stripSig: '', panel: null, panelSig: '' };
      groups.set(blockId, view);
    }

    const stripSig = [current?.id ?? '', ...blockSlots.map((slot) => `${slot.id}\u0002${signature(slot)}`)].join('\u0001');
    if (opts.force || stripSig !== view.stripSig || !view.strip?.isConnected) {
      const strip = tabStrip(blockId, blockSlots, current?.id ?? null);
      if (view.strip?.isConnected) view.strip.replaceWith(strip);
      else group.prepend(strip);
      view.strip = strip;
      view.stripSig = stripSig;
    }

    if (!current) {
      view.panel?.remove();
      view.panel = null;
      view.panelSig = '';
      return;
    }
    const panelSig = `${current.id}\u0002${signature(current)}`;
    const sameBox = view.panel?.isConnected && view.panel.dataset.slotId === current.id;
    const keep = sameBox && (panelSig === view.panelSig || isBusy(current));
    if (opts.force || !keep) {
      const panel = renderSlot(current);
      if (view.panel?.isConnected) view.panel.replaceWith(panel);
      else group.append(panel);
      view.panel = panel;
      view.panelSig = panelSig;
    }
    if (opts.focus) view.panel?.querySelector<HTMLElement>('input, textarea')?.focus();
  }

  function paint(slot: PublicExampleSlot, opts: { focus?: boolean } = {}): void {
    selected.set(slot.block_id, slot.id);
    paintGroup(slot.block_id, { force: true, focus: opts.focus });
  }

  function sync(): void {
    for (const slot of slots) {
      // A shared example replaces the "sent" note for the student who wrote it.
      if (slot.shown && stateFor(slot.id).mode === 'saved') setState(slot.id, { mode: 'idle' });
    }
    const blocks = new Set(slots.map((slot) => slot.block_id));
    for (const blockId of groups.keys()) {
      if (!blocks.has(blockId)) paintGroup(blockId);
    }
    for (const blockId of blocks) paintGroup(blockId);
    root.querySelectorAll('.cx-group').forEach((group) => {
      if (!group.childElementCount) group.remove();
    });
  }

  /* ── Checking for updates ──────────────────────────────────────────── */

  function stopPolling(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startPolling(): void {
    if (timer || disposed) return;
    timer = setInterval(() => {
      if (!doc.hidden) void refresh();
    }, pollMs);
  }

  async function refresh(): Promise<void> {
    if (disposed || inFlight) return;
    inFlight = true;
    lastFetch = Date.now();
    try {
      const data = await fetchPublicExamples(lessonId, classParam);
      if (disposed) return;
      slots = data.slots;
      const nextPoll = Math.max(15, data.poll_seconds || 60) * 1000;
      if (nextPoll !== pollMs) {
        pollMs = nextPoll;
        stopPolling();
      }
      sync();
      if (slots.length > 0) startPolling();
      else stopPolling();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'not_found') stopPolling();
      // Anything else: keep what is on screen and try again next minute.
    } finally {
      inFlight = false;
    }
  }

  const onVisibility = () => {
    if (!doc.hidden && timer && Date.now() - lastFetch >= pollMs) void refresh();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  void refresh();

  return {
    dispose() {
      disposed = true;
      stopPolling();
      doc.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
