import { apiPost, ApiClientError } from '@/api/client';
import { setActivityListener, storageKey } from '@/blocks/learning-activity';
import { button, deviceToken, el, errorText, labelled } from '@/quiz/dom';
import './work-sync.css';

/**
 * Sends a student's written work in a lesson to the teacher as they write.
 * Every block keeps its own state on the device (learning-activity.ts); this
 * listens to those saves, keeps the written parts (question set answers, their
 * formats, lenses) and posts each one a moment after the student stops typing.
 * The device copy stays the student's: a failed send loses nothing and the
 * next change, or the next visit, sends it again.
 *
 * The class's initials claim says whose work it is, the same claim the quiz
 * uses. A device without one is asked once, at the top of the lesson.
 */

type Reply = { need: 'initials' | null; initials?: string; anonymous?: true; saved?: true; handin_blocks?: string[]; handed_in_at?: string };
export type WorkCall = (action: 'status' | 'claim' | 'save' | 'handin', extra?: Record<string, unknown>) => Promise<Reply>;
export type WorkSyncOptions = { lessonId: string; classId: string; /** Replaces the network in tests. */ call?: WorkCall; delayMs?: number; retryMs?: number };
export type WorkSyncHandle = {
  dispose(): void;
  /** Sends what is waiting now. */
  flush(): Promise<void>;
  /** For the lesson footer: answers written on this device, and the marked blocks with writing to hand in. */
  progress(): { written: number; toHandIn: number };
  /** Sends everything, then hands in every marked block with writing. True when all went through. */
  handInAll(): Promise<boolean>;
};

/** The parts of a block's saved state that hold writing. Must match lesson-work.mjs. */
const PART = /^(answers|(format|lens|kaplan)\.[A-Za-z0-9_-]{1,60})$/;
/** Saved alongside the writing, but not writing. */
const SKIP = new Set(['step', 'level', 'done', 'index', 'order', 'flipped', 'revealed', 'rating']);
const FIELD = /^[A-Za-z0-9_.:-]{1,80}$/;

/** The block and part a saved key belongs to, for this lesson. Null for anything else. */
export function parseWorkKey(lessonId: string, key: string): { blockId: string; part: string } | null {
  const prefix = `${storageKey(lessonId, '')}`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) return null;
  const blockId = rest.slice(0, dot);
  const part = rest.slice(dot + 1);
  return PART.test(part) ? { blockId, part } : null;
}

/** The text in a saved state, by path: `{ notes: { s1: 'x' } }` gives `{ 'notes.s1': 'x' }`. */
export function writtenFields(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (v: unknown, path: string, depth: number): void => {
    if (typeof v === 'string') {
      if (path && FIELD.test(path) && v.trim()) out[path] = v;
      return;
    }
    if (depth > 3 || !v || typeof v !== 'object') return;
    const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v);
    for (const [name, child] of entries) {
      if (!path && SKIP.has(name)) continue;
      walk(child, path ? `${path}.${name}` : name, depth + 1);
    }
  };
  walk(value, '', 0);
  return out;
}

function networkCall(lessonId: string, classId: string): WorkCall {
  return (action, extra = {}) =>
    apiPost<Reply>(`/api/published/work/${encodeURIComponent(lessonId)}`, { action, class_id: classId, class_token: deviceToken(`class:${classId}`), ...extra });
}

/** Every written part this device already holds for the lesson, so work typed earlier reaches the teacher too. */
function heldParts(lessonId: string): Array<[string, unknown]> {
  const found: Array<[string, unknown]> = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !parseWorkKey(lessonId, key)) continue;
      const raw = localStorage.getItem(key);
      if (raw) found.push([key, JSON.parse(raw) as unknown]);
    }
  } catch {
    // No storage, or a garbled entry: nothing earlier to send.
  }
  return found;
}

export function mountWorkSync(host: HTMLElement, options: WorkSyncOptions): WorkSyncHandle {
  const { lessonId, classId } = options;
  const call = options.call ?? networkCall(lessonId, classId);
  const delay = options.delayMs ?? 1500;
  const retry = options.retryMs ?? 10_000;
  /** unknown until the server answers; off when nothing can be recorded (no list, no class). */
  let state: 'unknown' | 'ready' | 'initials' | 'off' = 'unknown';
  let disposed = false;
  let timer: number | undefined;
  let sending: Promise<void> | null = null;
  let lastCheck = 0;
  const pending = new Map<string, { blockId: string; part: string; fields: Record<string, string> }>();

  const bar = el('section', 'ws-bar');
  bar.hidden = true;
  bar.setAttribute('aria-label', 'Sending your work');
  const message = el('p', 'ws-bar__message');
  message.setAttribute('role', 'status');
  // Under the lesson's title, above the first block.
  const blocks = host.querySelector('.lesson-blocks');
  if (blocks) blocks.before(bar);
  else host.prepend(bar);

  /** Blocks the class's Markbook marks, as the server last said. */
  let marked: string[] = [];

  /** A Hand in bar under each block the class's Markbook marks. */
  function showHandIn(blockIds: string[] | undefined): void {
    marked = blockIds ?? [];
    for (const id of blockIds ?? []) {
      const block = [...host.querySelectorAll<HTMLElement>('[data-block-id]')].find((b) => b.dataset.blockId === id);
      if (!block || block.querySelector(':scope > .ws-handin')) continue;
      block.append(handInBar(id));
    }
  }

  function handInBar(blockId: string): HTMLElement {
    const handin = el('div', 'ws-handin');
    const note = el('p', 'ws-handin__note', 'Your teacher marks this one. Hand it in when it’s ready.');
    note.setAttribute('role', 'status');
    const send = button('Hand in', 'primary', () => {
      send.disabled = true;
      void flush()
        .then(() => call('handin', { block_id: blockId }))
        .then(
          (r) => {
            note.textContent = `Handed in ${new Date(r.handed_in_at ?? Date.now()).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. You can hand it in again until it comes back.`;
            send.textContent = 'Hand in again';
          },
          (e: unknown) => {
            note.textContent = errorText(e);
          }
        )
        .finally(() => {
          send.disabled = false;
        });
    });
    handin.append(note, send);
    return handin;
  }

  function queue(key: string, value: unknown): void {
    const where = parseWorkKey(lessonId, key);
    if (!where || disposed || state === 'off') return;
    pending.set(`${where.blockId}|${where.part}`, { ...where, fields: writtenFields(value) });
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), delay);
  }

  function showInitials(): void {
    const input = el('input', 'ws-bar__initials');
    input.type = 'text';
    input.maxLength = 6;
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.placeholder = 'Your initials';
    const error = el('p', 'ws-bar__error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const send = button('Send my work', 'primary', () => {
      error.hidden = true;
      void call('claim', { initials: input.value }).then(
        (reply) => {
          state = 'ready';
          bar.hidden = true;
          showHandIn(reply.handin_blocks);
          for (const [key, value] of heldParts(lessonId)) queue(key, value);
          void flush();
        },
        (e: unknown) => {
          error.textContent = errorText(e);
          error.hidden = false;
        }
      );
    });
    bar.replaceChildren(
      el('p', 'ws-bar__title', 'Your teacher sees your answers as you write.'),
      labelled('Type your initials to send them', input),
      send,
      error
    );
    bar.hidden = false;
  }

  async function check(): Promise<void> {
    lastCheck = Date.now();
    try {
      const reply = await call('status');
      if (disposed) return;
      if (reply.anonymous) state = 'off';
      else if (reply.need === 'initials') {
        if (state !== 'initials') showInitials();
        state = 'initials';
      } else {
        state = 'ready';
        bar.hidden = true;
        showHandIn(reply.handin_blocks);
      }
    } catch (error) {
      // A lesson or class the server doesn't know can't take work; a dropped connection tries again later.
      if (error instanceof ApiClientError && ['not_found', 'need_class'].includes(error.code ?? '')) state = 'off';
    }
  }

  async function sendAll(): Promise<void> {
    // The quiz on the page may have claimed initials since: look again, now and then.
    if (state === 'unknown' || (state === 'initials' && Date.now() - lastCheck > retry)) await check();
    if (state !== 'ready') return;
    for (const [id, item] of [...pending]) {
      if (disposed) return;
      try {
        await call('save', { block_id: item.blockId, part: item.part, fields: item.fields });
        // A newer change for the same part waits for the next send.
        if (pending.get(id) === item) pending.delete(id);
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code ?? '' : '';
        if (code === 'need_initials') {
          state = 'unknown';
          await check();
          return;
        }
        if (['bad_block', 'bad_part', 'bad_request', 'too_many', 'no_list'].includes(code)) {
          // The server won't keep this one: stop retrying it; the device keeps it.
          pending.delete(id);
          continue;
        }
        message.textContent = 'Your answers are saved on this device. They’ll reach your teacher when you’re back online.';
        if (!message.isConnected) {
          bar.replaceChildren(message);
          bar.hidden = false;
        }
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void flush(), retry);
        return;
      }
    }
    if (!pending.size && state === 'ready') bar.hidden = true;
  }

  async function flush(): Promise<void> {
    window.clearTimeout(timer);
    if (sending) await sending;
    if (!pending.size || disposed) return;
    sending = sendAll().finally(() => {
      sending = null;
    });
    await sending;
  }

  const onHide = (): void => {
    if (document.hidden) void flush();
  };
  document.addEventListener('visibilitychange', onHide);
  setActivityListener(queue);
  void check().then(() => {
    if (state === 'ready') for (const [key, value] of heldParts(lessonId)) queue(key, value);
  });

  /** Written fields on this device, by block. */
  function writtenByBlock(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const [key, value] of heldParts(lessonId)) {
      const where = parseWorkKey(lessonId, key);
      if (where) counts.set(where.blockId, (counts.get(where.blockId) ?? 0) + Object.keys(writtenFields(value)).length);
    }
    return counts;
  }

  return {
    flush,
    progress() {
      const counts = writtenByBlock();
      return { written: [...counts.values()].reduce((a, b) => a + b, 0), toHandIn: marked.filter((id) => (counts.get(id) ?? 0) > 0).length };
    },
    async handInAll() {
      // Initials may have just been claimed by the footer or the quiz: look again before giving up.
      if (state !== 'ready') await check();
      if (state !== 'ready') return state === 'off';
      await flush();
      if (pending.size) return false;
      const counts = writtenByBlock();
      let ok = true;
      for (const id of marked) {
        if (!(counts.get(id) ?? 0)) continue;
        try {
          await call('handin', { block_id: id });
        } catch {
          ok = false;
        }
      }
      return ok;
    },
    dispose() {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
      setActivityListener(null);
      bar.remove();
    }
  };
}
