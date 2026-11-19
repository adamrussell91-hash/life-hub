/**
 * Fleet week signals (spec §2): something is waiting, without opening the game.
 *
 * - An anchor badge (inline SVG) that glows and carries a count while events wait.
 * - A toast, once per event on this device: "Fleet week" and the event's line. Tapping it
 *   opens the game at the right screen and marks the event seen on the server.
 * - Motion per §2: a round opening sends a small ship across the top of the page; a hit
 *   flashes the anchor and puffs smoke from it; anything else makes the anchor glow.
 *   Calm (reduced motion or the games' Calm toggle): the toast fades in, nothing else moves.
 *
 * Events come from one of two doors that share one seen list: the class-wide profile actions
 * (`fleet_signals`, now strip) or the lesson's game endpoint (`signals`, arcade card). They are
 * read when the page loads and when the window gets focus. Never on a timer.
 */
import { el } from '@/quiz/dom';
import { calm } from '../../motion/motion';
import './signals.css';

export type FleetSignalKind = 'round_open' | 'report_ready' | 'hit' | 'report_owed' | 'reveal';
export type FleetSignal = { id: string; kind: FleetSignalKind; line: string; game_id: string; lesson_id: string };
export type FleetSignalSource = {
  load(): Promise<{ events?: FleetSignal[] } | null | undefined>;
  seen(ids: string[]): Promise<unknown>;
};

/** The toast lines, as spec §2 and the server's SIGNAL_LINES. */
export const SIGNAL_LINES: Record<FleetSignalKind, string> = {
  round_open: 'Four shells ready.',
  report_ready: 'Dawn report is in.',
  hit: "You've been hit.",
  report_owed: 'Your partner hit something. Confirm it.',
  reveal: 'The fog is lifting.'
};
const KINDS = Object.keys(SIGNAL_LINES) as FleetSignalKind[];

/** The class-wide door, through the progress page's own profile client. */
export function classSignalSource(call: <T>(action: 'fleet_signals' | 'fleet_signals_seen', extra?: Record<string, unknown>) => Promise<T>): FleetSignalSource {
  return {
    load: () => call<{ events?: FleetSignal[] }>('fleet_signals'),
    seen: (ids) => call('fleet_signals_seen', { ids })
  };
}

// ------------------------------------------------------------ toasted on this device

const TOASTED_KEY = 'teaching-hub.fleet.toasted';
const TOASTED_MAX = 200;
const toastedHere = new Set<string>();

function readToasted(): string[] {
  try {
    const raw = localStorage.getItem(TOASTED_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function wasToasted(id: string): boolean {
  return toastedHere.has(id) || readToasted().includes(id);
}
function markToasted(ids: string[]): void {
  ids.forEach((id) => toastedHere.add(id));
  try {
    const kept = readToasted().filter((x) => !ids.includes(x));
    localStorage.setItem(TOASTED_KEY, JSON.stringify([...kept, ...ids].slice(-TOASTED_MAX)));
  } catch {
    // Storage off: once per page load instead.
  }
}

/** Tests only: forget which events this device has toasted. */
export function resetFleetSignals(): void {
  toastedHere.clear();
  queue.length = 0;
  current?.remove();
  current = null;
  try {
    localStorage.removeItem(TOASTED_KEY);
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------ glyphs

const SVG = 'http://www.w3.org/2000/svg';
function svg(viewBox: string, paths: string[], cls: string): SVGSVGElement {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  for (const d of paths) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}
/** An anchor: ring, stock, shank and the curved arms with flukes. */
export function anchorGlyph(cls = 'fws-anchor__glyph'): SVGSVGElement {
  return svg('0 0 24 24', ['M12 2.5a2.25 2.25 0 1 1 0 4.5a2.25 2.25 0 0 1 0-4.5z', 'M7.5 9.25h9', 'M12 7v13.5', 'M4 13.5c0 4 3.6 7 8 7s8-3 8-7', 'M2.5 15l1.5-1.5L5.5 15', 'M18.5 15l1.5-1.5l1.5 1.5'], cls);
}
function shipGlyph(): SVGSVGElement {
  return svg('0 0 64 32', ['M4 21h56l-7 8H11z', 'M14 21v-6h30v6', 'M22 15V9h10v6', 'M27 9V3', 'M48 21l4-6'], 'fws-ship__glyph');
}

// ------------------------------------------------------------ toasts

type Toast = { e: FleetSignal; open?: (e: FleetSignal) => void; seen?: (ids: string[]) => void; after?: (e: FleetSignal) => void };
const queue: Toast[] = [];
let current: HTMLElement | null = null;
/** How long a toast stays up before the next one, untapped. */
export const TOAST_MS = 7000;

function nextToast(): void {
  if (current) return;
  const t = queue.shift();
  if (!t) return;
  const quiet = calm();
  const box = el('div', `fws-toast${quiet ? ' fws-toast--calm' : ''}`);
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.dataset.kind = t.e.kind;
  box.dataset.signal = t.e.id;
  const go = el('button', 'fws-toast__go');
  go.type = 'button';
  const mark = el('span', 'fws-toast__mark');
  mark.append(anchorGlyph('fws-toast__glyph'));
  const words = el('span', 'fws-toast__words');
  words.append(el('span', 'fws-toast__label', 'Fleet week'), el('span', 'fws-toast__line', t.e.line));
  go.append(mark, words);
  const shut = el('button', 'fws-toast__close', '×');
  shut.type = 'button';
  shut.setAttribute('aria-label', 'Dismiss');
  box.append(go, shut);

  let timer = 0;
  const done = (): void => {
    window.clearTimeout(timer);
    box.remove();
    if (current === box) current = null;
    nextToast();
  };
  go.addEventListener('click', () => {
    done();
    // `open` marks it seen itself (it may leave the page and wait for that first).
    if (t.open) t.open(t.e);
    else t.seen?.([t.e.id]);
  });
  shut.addEventListener('click', () => {
    t.seen?.([t.e.id]);
    done();
  });
  // Shown is seen (§2): a toast that hides by itself is marked too, and clears the count.
  timer = window.setTimeout(() => {
    t.seen?.([t.e.id]);
    done();
  }, TOAST_MS);
  current = box;
  document.body.append(box);
  if (!quiet) t.after?.(t.e);
}

/**
 * Toasts, one after another, for events not yet toasted on this device. `open` runs when a
 * toast is tapped (and marks it seen); `seen` when it is dismissed, hides by itself, or is tapped with no `open`;
 * `after` (motion) when it slides in, unless calm.
 */
export function showFleetToasts(events: FleetSignal[], how: Omit<Toast, 'e'> = {}): FleetSignal[] {
  const fresh = events.filter((e) => !wasToasted(e.id) && !queue.some((q) => q.e.id === e.id) && current?.dataset.signal !== e.id);
  if (!fresh.length) return [];
  markToasted(fresh.map((e) => e.id));
  for (const e of fresh) queue.push({ e, ...how });
  nextToast();
  return fresh;
}

// ------------------------------------------------------------ motion

/** A small ship steams across the top of the page (round_open). */
export function steamShip(): HTMLElement | null {
  if (calm()) return null;
  document.querySelector('.fws-ship')?.remove();
  const ship = el('div', 'fws-ship');
  ship.setAttribute('aria-hidden', 'true');
  ship.append(shipGlyph());
  document.body.append(ship);
  const gone = (): void => ship.remove();
  ship.addEventListener('animationend', gone, { once: true });
  window.setTimeout(gone, 6000);
  return ship;
}

/** A short flash and smoke from each anchor on the page (hit); a glow pulse for the rest. */
function stir(anchors: HTMLElement[], kind: FleetSignalKind): void {
  if (calm()) return;
  for (const a of anchors) {
    if (!a.isConnected) continue;
    const cls = kind === 'hit' ? 'fws-anchor--hit' : 'fws-anchor--pulse';
    a.classList.remove(cls);
    void a.offsetWidth;
    a.classList.add(cls);
    if (kind === 'hit') {
      const smoke = el('span', 'fws-smoke');
      smoke.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) smoke.append(el('span', 'fws-smoke__puff'));
      a.append(smoke);
      window.setTimeout(() => smoke.remove(), 1800);
    }
    window.setTimeout(() => a.classList.remove(cls), 1800);
  }
}

// ------------------------------------------------------------ the controller

export type FleetSignalsOptions = {
  source: FleetSignalSource;
  /**
   * Open the game at the right screen for this event (the toast or badge was tapped). `seen`
   * settles once the server has the event as seen: wait for it before leaving the page.
   */
  open: (e: FleetSignal, seen: Promise<unknown>) => void;
  /** Read on start (default true). */
  load?: boolean;
};
export type FleetSignals = {
  /** An anchor badge counting waiting events (those `only` lets through). */
  badge(opts?: { only?: (e: FleetSignal) => boolean; label?: string; hideWhenQuiet?: boolean; onCount?: (n: number) => void }): HTMLButtonElement;
  /** Read the events again (page load, focus). */
  refresh(): Promise<void>;
  /** The events waiting now. */
  events(): FleetSignal[];
  /** Tell the server these were seen and drop them from the count. */
  seen(ids: string[]): void;
  dispose(): void;
};

const isSignal = (e: unknown): e is FleetSignal => {
  const s = e as FleetSignal;
  return !!s && typeof s === 'object' && typeof s.id === 'string' && KINDS.includes(s.kind) && typeof s.game_id === 'string' && typeof s.lesson_id === 'string';
};

export function createFleetSignals(options: FleetSignalsOptions): FleetSignals {
  let waiting: FleetSignal[] = [];
  let disposed = false;
  let inflight: Promise<void> | null = null;
  const badges: Array<{ node: HTMLButtonElement; only?: (e: FleetSignal) => boolean; label: string; hide: boolean; onCount?: (n: number) => void }> = [];

  const counted = (only?: (e: FleetSignal) => boolean) => (only ? waiting.filter(only) : waiting);

  function paintBadges(): void {
    for (let i = badges.length - 1; i >= 0; i--) {
      const b = badges[i];
      if (!b.node.isConnected && b.node.dataset.mounted === '1') {
        badges.splice(i, 1);
        continue;
      }
      const n = counted(b.only).length;
      const count = b.node.querySelector<HTMLElement>('.fws-anchor__count')!;
      count.textContent = n > 9 ? '9+' : String(n);
      count.hidden = n === 0;
      b.node.classList.toggle('fws-anchor--waiting', n > 0);
      b.node.disabled = n === 0;
      b.node.hidden = b.hide && n === 0;
      // For layouts that can't use :has(): the host toggles its own class.
      b.onCount?.(n);
      b.node.setAttribute('aria-label', n ? `${b.label}: ${n} waiting` : `${b.label}: nothing waiting`);
    }
  }

  function seen(ids: string[]): Promise<unknown> {
    if (!ids.length) return Promise.resolve();
    waiting = waiting.filter((e) => !ids.includes(e.id));
    paintBadges();
    return options.source.seen(ids).catch(() => undefined);
  }
  const openOne = (e: FleetSignal): void => options.open(e, seen([e.id]));

  const anchorsFor = (e: FleetSignal) => badges.filter((b) => !b.only || b.only(e)).map((b) => b.node);

  async function load(): Promise<void> {
    let events: FleetSignal[] = [];
    try {
      const r = await options.source.load();
      events = Array.isArray(r?.events) ? r!.events.filter(isSignal) : [];
    } catch {
      return; // Signals are a nicety: a failed read leaves the page as it was.
    }
    if (disposed) return;
    waiting = events;
    paintBadges();
    showFleetToasts(events, {
      open: openOne,
      seen: (ids) => void seen(ids),
      after: (e) => {
        if (e.kind === 'round_open') steamShip();
        stir(anchorsFor(e), e.kind);
      }
    });
  }

  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (!inflight) inflight = load().finally(() => (inflight = null));
    return inflight;
  }

  const onFocus = (): void => void refresh();
  window.addEventListener('focus', onFocus);
  if (options.load !== false) void refresh();

  return {
    badge(opts = {}) {
      const node = el('button', 'fws-anchor');
      node.type = 'button';
      node.append(anchorGlyph(), el('span', 'fws-anchor__count'));
      const label = opts.label ?? 'Fleet week';
      node.addEventListener('click', () => {
        const e = counted(opts.only)[0];
        if (e) openOne(e);
      });
      badges.push({ node, only: opts.only, label, hide: !!opts.hideWhenQuiet, onCount: opts.onCount });
      // Dropped from the list once it has been on the page and left it (a redraw).
      queueMicrotask(() => {
        if (node.isConnected) node.dataset.mounted = '1';
      });
      paintBadges();
      return node;
    },
    refresh,
    events: () => [...waiting],
    seen: (ids) => void seen(ids),
    dispose() {
      disposed = true;
      window.removeEventListener('focus', onFocus);
      badges.length = 0;
    }
  };
}

// ------------------------------------------------------------ where a tap goes

/** The lesson page that opens this event's game at the right screen (`?fleet=game&go=kind`). */
export function fleetHref(classId: string, e: FleetSignal): string {
  const q = new URLSearchParams({ fleet: e.game_id, go: e.kind });
  return `/s/classes/${encodeURIComponent(classId)}/lessons/${encodeURIComponent(e.lesson_id)}?${q.toString()}`;
}

/** Read `?fleet=game&go=kind` from a lesson page's address (the arcade opens that game). */
export function fleetTarget(search: string): { game: string; go: FleetSignalKind | null } | null {
  try {
    const p = new URLSearchParams(search);
    const game = p.get('fleet') ?? '';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(game)) return null;
    const go = p.get('go') as FleetSignalKind | null;
    return { game, go: go && KINDS.includes(go) ? go : null };
  } catch {
    return null;
  }
}
