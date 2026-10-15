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
 * Student side of class examples. Each box sits directly under the block it
 * belongs to. The page checks for newly shared examples about once a minute,
 * and only while the tab is visible and the lesson has at least one box.
 */

type LocalState =
  | { mode: 'idle' }
  | { mode: 'code' }
  | { mode: 'writing'; token: string; draft: string; open: boolean }
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
  const views = new Map<string, { el: HTMLElement; sig: string }>();

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

  function header(slot: PublicExampleSlot, extra?: HTMLElement): HTMLElement {
    const head = el('div', 'cx-slot__head');
    const titles = el('div', 'cx-slot__titles');
    titles.append(el('span', 'cx-slot__eyebrow', 'Class example'), el('span', 'cx-slot__label', slot.label));
    head.append(titles);
    if (extra) head.append(extra);
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
        .then(({ token }) => {
          if (disposed) return;
          setState(slot.id, { mode: 'writing', token, draft: '', open: true });
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
      void submitExample(lessonId, { class: classParam, slot_id: slot.id, token: state.token, text })
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
    section.dataset.slotId = slot.id;
    section.setAttribute('aria-label', `Class example: ${slot.label}`);

    if (state.mode === 'code') {
      section.classList.add('cx-slot--active');
      section.append(header(slot), unlockForm(slot));
      return section;
    }
    if (state.mode === 'writing' && state.open) {
      section.classList.add('cx-slot--active');
      section.append(header(slot), writeForm(slot, state));
      return section;
    }
    if (state.mode === 'saved' && !slot.shown) {
      section.classList.add('cx-slot--sent');
      section.append(
        header(slot, el('span', 'cx-chip', 'Sent to your teacher')),
        el('p', 'cx-slot__text', state.text),
        el('p', 'cx-slot__hint', 'It appears here for everyone once your teacher shares it.')
      );
      return section;
    }
    if (slot.shown) {
      section.classList.add('cx-slot--shown');
      section.append(header(slot), el('p', 'cx-slot__text', slot.text ?? ''));
      const foot = el('div', 'cx-slot__foot');
      foot.append(codeButton(slot));
      section.append(foot);
      return section;
    }
    section.classList.add('cx-slot--waiting');
    section.append(header(slot, codeButton(slot)));
    section.append(el('p', 'cx-slot__hint', "A classmate's answer will appear here."));
    return section;
  }

  function paint(slot: PublicExampleSlot, opts: { focus?: boolean } = {}): void {
    const group = groupFor(slot.block_id);
    if (!group) return;
    const next = renderSlot(slot);
    const current = views.get(slot.id);
    if (current?.el.isConnected && current.el.parentElement === group) current.el.replaceWith(next);
    else group.append(next);
    views.set(slot.id, { el: next, sig: signature(slot) });
    if (opts.focus) next.querySelector<HTMLElement>('input, textarea')?.focus();
  }

  function sync(): void {
    const live = new Set(slots.map((slot) => slot.id));
    for (const [id, view] of views) {
      if (live.has(id)) continue;
      view.el.remove();
      views.delete(id);
    }
    for (const slot of slots) {
      const state = stateFor(slot.id);
      // A shared example replaces the "sent" note for the student who wrote it.
      if (slot.shown && state.mode === 'saved') setState(slot.id, { mode: 'idle' });
      const view = views.get(slot.id);
      const busy = state.mode === 'code' || (state.mode === 'writing' && state.open);
      if (view?.el.isConnected && (busy || view.sig === signature(slot))) continue;
      paint(slot);
    }
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
