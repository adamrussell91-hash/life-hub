import { el } from '@/quiz/dom';
import type { EventResult, FinishReply, GameClient, PlayScore, SoloEvent } from '../api';
import { GAME_KIND_INFO, type PublicGame } from '../core/schema';
import { calm, calmToggleOn, countUp, enter, loadCalm, pulse, setCalm } from '../motion/motion';
import { confetti } from '../motion/confetti';
import { sfx, soundToggle } from '../sound/sfx';
import { createEventQueue, type EventQueue, type QueueState } from './queue';
import { playerFor, type MountedPlayer, type PlayerContext } from './registry';

/**
 * The solo player shell (spec §3.6, §5). Full screen on a phone, a centred
 * panel on a laptop, with a docked 44 px action row (R4). It starts a play,
 * mounts the kind's player, batches its moves to the server, and on finish
 * saves every move before asking the server for the score, then shows the
 * shared finish card.
 */

export type SoloShellOptions = {
  game: PublicGame;
  client: GameClient;
  /** Where the overlay goes. Default: document.body. */
  host?: HTMLElement;
  /** This student's best and latest before this play (for the finish card if the server sends none). */
  best?: PlayScore | null;
  latest?: PlayScore | null;
  /** Called once the shell has closed; `finished` is true when at least one play finished. */
  onClose?(result: { finished: boolean }): void;
  /** Batch timing (tests). */
  queue?: { batchSize?: number; intervalMs?: number; retryDelaysMs?: number[]; drainAttempts?: number };
};

export type SoloShell = {
  root: HTMLElement;
  /** Saves waiting moves (best effort) and closes. */
  close(): Promise<void>;
};

/** Clean = right with no hint on that item; hinted = right after a hint. */
export function cleanVsHinted(right: Set<string>, hinted: Set<string>): { clean: number; hinted: number } {
  let clean = 0;
  let withHints = 0;
  for (const id of right) {
    if (hinted.has(id)) withHints += 1;
    else clean += 1;
  }
  return { clean, hinted: withHints };
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const SYNC_TEXT: Record<QueueState, string> = {
  idle: 'Saved',
  waiting: 'Saved',
  sending: 'Saving…',
  retrying: 'Reconnecting…',
  offline: 'Offline: your answers are kept on this device until it reconnects'
};

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function openSoloPlayer(options: SoloShellOptions): SoloShell {
  const { client } = options;
  const host = options.host ?? document.body;
  const info = GAME_KIND_INFO[options.game.kind];
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  loadCalm();

  const root = el('div', 'gm gm-solo');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.classList.toggle('gm-calm', calm());
  const titleId = `gm-solo-title-${options.game.id}`;
  root.setAttribute('aria-labelledby', titleId);
  const panel = el('div', 'gm-solo__panel');
  panel.tabIndex = -1;

  const head = el('header', 'gm-solo__head');
  const back = el('button', 'gm-icon-btn gm-solo__back', 'Back to games');
  back.type = 'button';
  const titles = el('div', 'gm-solo__titles');
  const title = el('h2', 'gm-solo__title', options.game.title || info.label);
  title.id = titleId;
  const status = el('p', 'gm-solo__status');
  titles.append(title, status);
  const sync = el('span', 'gm-solo__sync');
  sync.setAttribute('aria-live', 'polite');
  const calmBtn = el('button', 'gm-icon-btn gm-calm-toggle');
  calmBtn.type = 'button';
  const paintCalm = () => {
    calmBtn.setAttribute('aria-pressed', String(calmToggleOn()));
    calmBtn.textContent = 'Calm';
    calmBtn.title = calmToggleOn() ? 'Calm is on: less movement' : 'Turn on Calm for less movement';
    root.classList.toggle('gm-calm', calm());
  };
  calmBtn.addEventListener('click', () => {
    setCalm(!calmToggleOn());
    paintCalm();
  });
  paintCalm();
  const tools = el('div', 'gm-solo__tools');
  tools.append(sync, calmBtn, soundToggle());
  head.append(back, titles, tools);

  const body = el('div', 'gm-solo__body');
  const stage = el('div', 'gm-solo__stage');
  body.append(stage);
  const dock = el('div', 'gm-solo__dock');
  dock.dataset.part = 'form-actions';
  const toastEl = el('div', 'gm-solo__toast');
  toastEl.setAttribute('role', 'status');
  panel.append(head, body, dock, toastEl);
  root.append(panel);

  let player: MountedPlayer | null = null;
  let queue: EventQueue | null = null;
  let playId: string | null = null;
  let startedAt = 0;
  let finishedAny = false;
  let closed = false;
  let finishing = false;
  let right = new Set<string>();
  let hinted = new Set<string>();
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function setDock(buttons: HTMLElement[]): void {
    dock.replaceChildren(...buttons);
    dock.hidden = buttons.length === 0;
  }

  function actionButton(text: string, kind: 'primary' | 'secondary', onClick: () => void): HTMLButtonElement {
    const b = el('button', `btn btn--${kind} gm-solo__action`, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function toast(text: string, tone: 'good' | 'bad' | 'plain' = 'plain'): void {
    toastEl.textContent = text;
    toastEl.dataset.tone = tone;
    toastEl.classList.add('is-shown');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2600);
  }

  function onQueueState(state: QueueState): void {
    sync.dataset.state = state;
    sync.textContent = playId ? SYNC_TEXT[state] : '';
    root.classList.toggle('gm-solo--sending', state === 'sending');
  }

  function disposePlayer(): void {
    try {
      player?.dispose();
    } catch {
      // A player's own tidy-up must not stop the shell.
    }
    player = null;
  }

  function showState(text: string, opts: { error?: boolean; retry?: () => void } = {}): void {
    const box = el('div', opts.error ? 'gm-solo__state gm-solo__state--error' : 'gm-solo__state');
    const p = el('p', '', text);
    if (opts.error) p.setAttribute('role', 'alert');
    box.append(p);
    stage.replaceChildren(box);
    setDock(opts.retry ? [actionButton('Try again', 'primary', opts.retry), actionButton('Back to games', 'secondary', () => void close())] : []);
    void enter(box);
  }

  async function start(): Promise<void> {
    disposePlayer();
    queue?.dispose();
    queue = null;
    playId = null;
    right = new Set();
    hinted = new Set();
    status.textContent = '';
    sync.textContent = '';
    showState('Getting your game ready…');
    let game = options.game;
    try {
      const reply = await client.start(options.game.id);
      if (closed) return;
      playId = reply.play_id;
      if (reply.game) game = reply.game;
    } catch (e) {
      if (closed) return;
      showState(message(e, 'The game didn’t start. Check your connection.'), { error: true, retry: () => void start() });
      return;
    }
    const module = playerFor(game.kind);
    if (!module || !playId) {
      showState('Coming next: this game opens here soon.');
      setDock([actionButton('Back to games', 'secondary', () => void close())]);
      return;
    }
    const id = playId;
    const q = createEventQueue({
      send: (events) => client.send(game.id, id, events),
      ...options.queue,
      onState: onQueueState
    });
    queue = q;
    startedAt = Date.now();
    finishing = false;
    const ctx: PlayerContext = {
      game,
      playId: id,
      emit(event: SoloEvent, opts) {
        if (event.move === 'hint') hinted.add(event.item);
        void pulse(sync);
        return q.push(event, opts).then((result: EventResult) => {
          if (result.correct === true) right.add(result.item ?? event.item);
          return result;
        });
      },
      finish: () => void finish(),
      setActions: setDock,
      setStatus: (text) => {
        status.textContent = text;
      },
      toast,
      elapsedMs: () => Date.now() - startedAt,
      calm,
      sfx
    };
    stage.replaceChildren();
    setDock([]);
    try {
      player = module.mount(stage, ctx);
    } catch (e) {
      showState(message(e, 'This game couldn’t open.'), { error: true, retry: () => void start() });
    }
  }

  async function finish(): Promise<void> {
    if (finishing || !queue || !playId) return;
    finishing = true;
    const q = queue;
    const id = playId;
    const elapsed = Date.now() - startedAt;
    status.textContent = '';
    setDock([]);
    const saving = el('p', 'gm-solo__saving', 'Saving your answers…');
    saving.setAttribute('role', 'status');
    stage.append(saving);
    let reply: FinishReply;
    try {
      // Every move reaches the server before the score is asked for.
      await q.drain();
      reply = await client.finish(options.game.id, id);
    } catch (e) {
      saving.remove();
      finishing = false;
      if (closed) return;
      const box = el('div', 'gm-solo__state gm-solo__state--error');
      const p = el('p', '', `${message(e, 'Your answers didn’t save.')} They’re kept here: try again when you’re back online.`);
      p.setAttribute('role', 'alert');
      box.append(p);
      stage.append(box);
      setDock([
        actionButton('Try again', 'primary', () => {
          box.remove();
          void finish();
        })
      ]);
      return;
    }
    if (closed) return;
    finishedAny = true;
    disposePlayer();
    q.dispose();
    showFinish(reply, elapsed);
  }

  function showFinish(reply: FinishReply, elapsed: number): void {
    const { score } = reply;
    const card = el('section', 'gm-finish');
    card.setAttribute('aria-labelledby', 'gm-finish-title');
    const heading = el('h3', 'gm-finish__title', score.total > 0 && score.right === score.total ? 'Every one right!' : 'Finished');
    heading.id = 'gm-finish-title';
    const big = el('p', 'gm-finish__score');
    const num = el('span', 'gm-finish__num', '0');
    big.append(num, el('span', 'gm-finish__of', ` / ${score.total || score.answered}`));
    big.setAttribute('aria-label', `${score.right} of ${score.total || score.answered} right`);
    const split = cleanVsHinted(right, hinted);
    const stats = el('dl', 'gm-finish__stats');
    const stat = (label: string, value: string) => {
      const d = el('div', 'gm-finish__stat');
      d.append(el('dt', '', label), el('dd', '', value));
      stats.append(d);
    };
    stat('Time', formatTime(elapsed));
    stat('Clean', String(split.clean));
    stat('With hints', String(split.hinted));
    const best = reply.best ?? options.best ?? null;
    const latest = reply.latest ?? options.latest ?? null;
    if (best) stat('Best', `${best.right}/${best.answered}`);
    if (latest) stat('Latest', `${latest.right}/${latest.answered}`);
    card.append(heading, big, stats);
    if (reply.boxed > 0) card.append(el('p', 'gm-note', `${reply.boxed} ${reply.boxed === 1 ? 'card goes' : 'cards go'} back to box 1 in your organiser for another look.`));
    stage.replaceChildren(card);
    sync.textContent = '';
    setDock([actionButton('Play again', 'primary', () => void start()), actionButton('Back to games', 'secondary', () => void close())]);
    void enter(card);
    countUp(num, 0, score.right);
    sfx.fanfare();
    if (score.total > 0 && score.right === score.total) void confetti(panel);
    heading.tabIndex = -1;
    heading.focus();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      void close();
      return;
    }
    if (player?.onKey?.(e)) e.preventDefault();
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') queue?.flush();
  }

  // No history entry: the Teaching router re-renders the whole page on any
  // popstate, so a pushed entry would remount the lesson when it pops. A
  // swipe-back leaves the lesson; the queue still sends every move first.

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    root.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    disposePlayer();
    if (toastTimer) clearTimeout(toastTimer);
    root.remove();
    document.documentElement.classList.remove('gm-solo-open');
    returnFocus?.focus?.();
    options.onClose?.({ finished: finishedAny });
    // Leaving mid-game keeps every move already made: the queue keeps sending
    // in the background (with its retries) until the server has them all.
    const q = queue;
    if (q?.size()) await q.drain().then(() => q.dispose(), () => undefined);
    else q?.dispose();
  }

  back.addEventListener('click', () => void close());
  root.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  host.append(root);
  document.documentElement.classList.add('gm-solo-open');
  panel.focus();
  void enter(panel);
  void start();

  return { root, close };
}
