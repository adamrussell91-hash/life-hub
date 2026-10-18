import { apiPost } from '@/api/client';
import { button, el, errorText } from '@/blocks/peer-feedback-ui';
import { mountBoard, type BoardGroup, type Layout } from './board';
import { poller, formatCode, showCodeOverlay, type BrainstormBlock } from './shared';

type TeacherAnswer = { id: string; symbol: string; text: string; flagged: boolean; status: 'pending' | 'shown' | 'removed'; created_at: string };
type TeacherState =
  | { phase: 'idle' }
  | {
      phase: 'live';
      session: string;
      code: string;
      open: boolean;
      question: string;
      safety: 'instant' | 'approve' | 'reveal';
      per_student: number;
      revealed: boolean;
      layout: Layout;
      students_see: 'own' | 'all';
      show_symbols: boolean;
      symbols_on_cards: boolean;
      joined: number;
      answers: TeacherAnswer[];
      groups: BoardGroup[] | null;
    };
type Live = Extract<TeacherState, { phase: 'live' }>;

const LAYOUTS: Array<{ value: Layout; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'cloud', label: 'Word cloud' },
  { value: 'groups', label: 'Groups' }
];

/** Latest state per endpoint, so a re-rendered block paints at once. */
const lastState = new Map<string, TeacherState>();

export function mountTeacher(block: BrainstormBlock, lessonId: string): HTMLElement {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/brainstorm/${encodeURIComponent(block.id)}`;
  const root = el('div', 'bs-run');
  const controls = el('div', 'bs-controls');
  const queue = el('div', 'bs-queue-wrap');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const board = mountBoard({
    remove: (id) => void send('remove', { id }),
    move: (id, group) => void send('move', { id, group }),
    rename: (group, name) => void send('rename_group', { group, name })
  });
  const idle = el('div', 'pf-panel pf-panel--start');
  root.append(controls, alert, idle, board.root, queue);

  let state = lastState.get(endpoint) ?? null;
  let busy = false;
  let paintedControls = '';
  let paintedQueue = '';
  let queueOpen = false;

  async function send(action: string, extra: Record<string, unknown> = {}, pressed?: HTMLButtonElement): Promise<void> {
    if (busy) return;
    busy = true;
    const label = pressed?.textContent;
    if (pressed) {
      pressed.disabled = true;
      pressed.textContent = action === 'group' ? 'Grouping…' : 'Working…';
    }
    try {
      state = await apiPost<TeacherState>(endpoint, { action, ...extra });
      lastState.set(endpoint, state);
      alert.hidden = true;
      paint();
    } catch (error) {
      if (action !== 'status' || !state) {
        alert.textContent = errorText(error);
        alert.hidden = false;
      }
    } finally {
      busy = false;
      if (pressed?.isConnected) {
        pressed.disabled = false;
        pressed.textContent = label ?? '';
      }
    }
  }

  function toggle(label: string, checked: boolean, title: string, onChange: (on: boolean) => void): HTMLElement {
    const wrap = el('label', 'pf-switch pf-switch--bar');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
    wrap.append(box, el('span', '', label));
    wrap.title = title;
    return wrap;
  }

  function paintControls(s: Live): void {
    const sig = JSON.stringify([s.code, s.open, s.revealed, s.layout, s.students_see, s.show_symbols, s.symbols_on_cards, !!s.groups, s.safety]);
    if (sig === paintedControls) return;
    paintedControls = sig;

    const bar = el('div', 'pf-bar bs-bar');
    const code = el('div', 'pf-code');
    if (s.open) code.append(el('span', 'pf-code__label', 'Code'), el('span', 'pf-code__value', formatCode(s.code)));
    else code.append(el('span', 'pf-code__label', 'Answering closed'));
    const main = el('div', 'bs-bar__main');
    const revealBtn = button(s.revealed ? 'Back to shapes' : 'Reveal answers', 'primary', function () {
      void send(s.revealed ? 'hide' : 'reveal', {}, this);
    });
    if (!s.revealed && s.safety === 'reveal' && s.open) revealBtn.title = 'Revealing also closes answering.';
    main.append(revealBtn);
    if (s.open) main.append(button('Show code on board', 'ghost', () => showCodeOverlay(s.code)));
    bar.append(code, main);

    const settings = el('div', 'bs-bar__settings');
    if (s.revealed) {
      const seg = el('div', 'bs-seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Layout');
      for (const l of LAYOUTS) {
        const b = button(l.label, 'ghost', () => l.value !== s.layout && void send('layout', { value: l.value }));
        b.className = 'bs-seg__option';
        b.setAttribute('aria-pressed', String(l.value === s.layout));
        seg.append(b);
      }
      settings.append(seg);
      if (s.layout === 'groups') {
        settings.append(
          button(s.groups ? 'Regroup' : 'Group answers', 'secondary', function () {
            void send('group', {}, this);
          })
        );
      }
    }
    settings.append(
      toggle('Symbols on cards', s.symbols_on_cards, 'Show who wrote each card by their symbol. Turn off to show answers with no hint of who wrote them.', (on) =>
        void send('symbols_on_cards', { show: on })
      ),
      toggle('Students see all answers', s.students_see === 'all', 'Students always see the shapes orbiting. Off: they see only their own answers. On: they also see everyone’s answers when you reveal, without symbols.', (on) =>
        void send('students_see', { value: on ? 'all' : 'own' })
      ),
      toggle('Show student symbols', s.show_symbols, 'Each student sees their own symbol in the corner of the block, so you can match a symbol to a student.', (on) =>
        void send('symbols', { show: on })
      )
    );
    const round = el('div', 'bs-bar__round');
    round.append(
      s.open
        ? button('Close answering', 'ghost', function () {
            void send('end', {}, this);
          })
        : button('Start a new round', 'ghost', function () {
            if (confirm('Start a new round? This board clears and students join again.')) void send('start', {}, this);
          })
    );
    controls.replaceChildren(bar, settings, round);
  }

  function paintQueue(s: Live): void {
    const waiting = s.answers.filter((a) => a.status === 'pending');
    const removed = s.answers.filter((a) => a.status === 'removed');
    const sig = JSON.stringify([waiting, removed]);
    if (sig === paintedQueue) return;
    paintedQueue = sig;
    if (!waiting.length && !removed.length) {
      queue.replaceChildren();
      return;
    }
    // Collapsed by default: the board is usually projected, and held text shouldn't be.
    const box = el('details', 'bs-queue');
    box.open = queueOpen;
    box.addEventListener('toggle', () => (queueOpen = box.open));
    const summary = el('summary', 'bs-queue__summary', `Waiting for you (${waiting.length})`);
    if (removed.length) summary.append(el('span', 'bs-queue__muted', ` · ${removed.length} removed`));
    box.append(summary);
    const row = (a: TeacherAnswer, restore: boolean) => {
      const r = el('div', 'bs-queue__row');
      r.append(el('p', 'bs-queue__text', a.text));
      if (a.flagged) r.append(el('span', 'pf-chip pf-chip--flag', 'Flagged'));
      const acts = el('div', 'bs-queue__actions');
      acts.append(button(restore ? 'Restore' : 'Show', 'secondary', function () {
        void send('approve', { id: a.id }, this);
      }));
      if (!restore) acts.append(button('Remove', 'ghost', function () {
        void send('remove', { id: a.id }, this);
      }));
      r.append(acts);
      return r;
    };
    box.append(...waiting.map((a) => row(a, false)));
    if (removed.length) {
      box.append(el('p', 'bs-queue__heading', 'Removed'), ...removed.map((a) => row(a, true)));
    }
    queue.replaceChildren(box);
  }

  function paint(): void {
    if (!state) {
      idle.hidden = false;
      idle.replaceChildren(el('p', 'pf-note', 'Loading…'));
      board.root.hidden = true;
      return;
    }
    if (state.phase === 'idle') {
      paintedControls = '';
      controls.replaceChildren();
      queue.replaceChildren();
      paintedQueue = '';
      board.root.hidden = true;
      idle.hidden = false;
      idle.replaceChildren(
        el('p', 'pf-panel__text', 'Students join on the lesson link with the code. No accounts, and they never pick or see a symbol.'),
        button('Start brainstorm', 'primary', function () {
          void send('start', {}, this);
        })
      );
      return;
    }
    const s = state;
    idle.hidden = true;
    board.root.hidden = false;
    paintControls(s);
    paintQueue(s);
    board.update({
      question: s.question,
      revealed: s.revealed,
      layout: s.layout,
      answers: s.answers.filter((a) => a.status === 'shown').map(({ id, text, symbol }) => ({ id, text, symbol })),
      symbolsOnCards: s.symbols_on_cards,
      groups: s.groups
    });
  }

  paint();
  poller(root, () => send('status'));
  return root;
}
