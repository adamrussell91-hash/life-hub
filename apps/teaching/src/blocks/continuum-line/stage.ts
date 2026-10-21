import { el, token } from '@/blocks/peer-feedback-ui';
import { lineMarks, type Phase, type Scale } from './shared';

/**
 * The projected line. While a statement collects, each placed symbol flies
 * in and roams the whole space on its own smooth path: nothing about the path
 * comes from where the student placed it. Reveal glides every symbol to its
 * place on the line, stacking upward where they bunch. In the re-place round,
 * shown moves leave a dashed copy where the symbol started and an arrow
 * arcing over the row to where it went.
 */

export type StageEntry = { symbol: string; pos?: number; new_pos?: number };
export type StageView = {
  /** Changes when the statement changes, so a new statement starts fresh. */
  key: string;
  scale: Scale;
  snap: boolean;
  phase: Phase;
  movesShown: boolean;
  entries: StageEntry[];
  picked: string | null;
};

type Item = {
  symbol: string;
  node: HTMLElement;
  x: number;
  y: number;
  tx: number;
  ty: number;
  w1: number;
  w2: number;
  p1: number;
  p2: number;
  q1: number;
  q2: number;
};
type Ghost = { symbol: string; node: HTMLElement; x: number; y: number };

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountStage(onPick: (symbol: string | null) => void): Stage {
  const root = el('div', 'cl-stage');
  const note = el('p', 'cl-stage__note', 'Placements hidden');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('cl-stage__arrows');
  svg.setAttribute('aria-hidden', 'true');
  const rail = el('div', 'cl-stage__rail');
  const track = el('div', 'cl-track');
  rail.append(track);
  root.append(note, svg, rail);
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target === rail) onPick(null);
  });

  const items = new Map<string, Item>();
  const ghosts = new Map<string, Ghost>();
  let view: StageView | null = null;
  let marksKey = '';
  let geom = { W: 0, H: 0, L: 0, R: 0, lineY: 0, s: 28 };
  let raf = 0;

  function measure(): void {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const s = W < 600 ? 20 : 28;
    const pad = W < 600 ? 24 : 48;
    geom = { W, H, L: pad, R: W - pad, lineY: H - 64, s };
    root.style.setProperty('--cl-size', `${s}px`);
    rail.style.left = `${pad}px`;
    rail.style.right = `${pad}px`;
    rail.style.top = `${geom.lineY}px`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  /** Roam: two sine waves per axis, a few seconds per sweep, covering the space above the line. */
  function roam(it: Item, now: number): { x: number; y: number } {
    const { L, R, lineY, s } = geom;
    const top = 40;
    const bottom = Math.max(top + 10, lineY - 50);
    const fx = 0.5 + 0.32 * Math.sin(now * it.w1 + it.p1) + 0.16 * Math.sin(now * it.w1 * 1.73 + it.q1);
    const fy = 0.5 + 0.32 * Math.sin(now * it.w2 + it.p2) + 0.16 * Math.sin(now * it.w2 * 2.11 + it.q2);
    return { x: L + fx * (R - L) - s / 2, y: top + fy * (bottom - top) - s / 2 };
  }

  /** Spots on the line: x from position; symbols that bunch stack upward. Snapped lines cluster at each stop. */
  function layout(entries: Array<{ symbol: string; pos: number }>): Map<string, { x: number; y: number }> {
    const { L, R, lineY, s } = geom;
    const out = new Map<string, { x: number; y: number }>();
    const sorted = [...entries].sort((a, b) => a.pos - b.pos || a.symbol.localeCompare(b.symbol));
    if (view?.snap) {
      const byStop = new Map<number, typeof sorted>();
      for (const e of sorted) byStop.set(e.pos, [...(byStop.get(e.pos) ?? []), e]);
      for (const [stop, list] of byStop) {
        const cols = Math.max(3, Math.ceil(Math.sqrt(list.length * 1.6)));
        const width = cols * (s + 3) - 3;
        const cx = L + stop * (R - L);
        const x0 = Math.max(4, Math.min(geom.W - width - 4, cx - width / 2));
        list.forEach((e, k) => out.set(e.symbol, { x: x0 + (k % cols) * (s + 3), y: lineY - 12 - s - Math.floor(k / cols) * (s + 3) }));
      }
      return out;
    }
    const placed: Array<{ x: number; level: number }> = [];
    for (const e of sorted) {
      const x = L + e.pos * (R - L);
      let level = 0;
      while (placed.some((p) => p.level === level && Math.abs(p.x - x) < s + 2)) level++;
      placed.push({ x, level });
      out.set(e.symbol, { x: x - s / 2, y: lineY - 10 - s - level * (s + 2) });
    }
    return out;
  }

  function targets(): void {
    if (!view || view.phase === 'collect') return;
    const moved = view.phase === 'replace' && view.movesShown;
    const now = layout(view.entries.map((e) => ({ symbol: e.symbol, pos: moved && e.new_pos != null ? e.new_pos : e.pos ?? 0.5 })));
    for (const it of items.values()) {
      const p = now.get(it.symbol);
      if (p) {
        it.tx = p.x;
        it.ty = p.y;
      }
    }
    const first = layout(view.entries.map((e) => ({ symbol: e.symbol, pos: e.pos ?? 0.5 })));
    const want = new Set(moved ? view.entries.filter((e) => e.new_pos != null).map((e) => e.symbol) : []);
    for (const [symbol, g] of ghosts) {
      if (!want.has(symbol)) {
        g.node.remove();
        ghosts.delete(symbol);
      }
    }
    for (const symbol of want) {
      const p = first.get(symbol)!;
      let g = ghosts.get(symbol);
      if (!g) {
        const node = token(symbol, 'md');
        node.classList.add('cl-ghost');
        root.insertBefore(node, svg);
        g = { symbol, node, x: 0, y: 0 };
        ghosts.set(symbol, g);
      }
      g.x = p.x;
      g.y = p.y;
      g.node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
  }

  function arrows(): void {
    const { s } = geom;
    const parts: string[] = [];
    for (const g of ghosts.values()) {
      const it = items.get(g.symbol);
      if (!it) continue;
      const x1 = g.x + s / 2;
      const y1 = g.y;
      const x2 = it.x + s / 2;
      const y2 = it.y;
      const span = Math.abs(x2 - x1);
      if (span < s && Math.abs(y2 - y1) < s) continue;
      const cx = (x1 + x2) / 2;
      const cy = Math.min(y1, y2) - 18 - span * 0.18;
      let ux = x2 - cx;
      let uy = y2 - cy;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len;
      uy /= len;
      const ax = x2 - ux * 3;
      const ay = y2 - uy * 3;
      const colour = getComputedStyle(it.node).getPropertyValue('--pf-token').trim() || 'currentColor';
      parts.push(
        `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ax.toFixed(1)} ${ay.toFixed(1)}" stroke="${colour}"/>`,
        `<path d="M${(ax - ux * 8 - uy * 5).toFixed(1)} ${(ay - uy * 8 + ux * 5).toFixed(1)} L${ax.toFixed(1)} ${ay.toFixed(1)} L${(ax - ux * 8 + uy * 5).toFixed(1)} ${(ay - uy * 8 - ux * 5).toFixed(1)}" stroke="${colour}"/>`
      );
    }
    svg.innerHTML = parts.join('');
  }

  function frame(now: number): void {
    if (!root.isConnected) {
      raf = 0;
      return;
    }
    if (!geom.W) {
      measure();
      targets();
    }
    const still = reduced();
    const collecting = view?.phase === 'collect';
    for (const it of items.values()) {
      let tx = it.tx;
      let ty = it.ty;
      if (collecting) ({ x: tx, y: ty } = roam(it, now));
      const k = still ? 1 : collecting ? 0.06 : 0.045;
      it.x += (tx - it.x) * k;
      it.y += (ty - it.y) * k;
      it.node.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
    }
    if (ghosts.size) arrows();
    else if (svg.firstChild) svg.replaceChildren();
    raf = requestAnimationFrame(frame);
  }

  function add(symbol: string): Item {
    const node = token(symbol, 'md');
    node.classList.add('cl-sym');
    node.setAttribute('role', 'button');
    node.tabIndex = -1;
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if (view && view.phase !== 'collect') onPick(view.picked === symbol ? null : symbol);
    });
    node.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && view && view.phase !== 'collect') {
        e.preventDefault();
        onPick(view.picked === symbol ? null : symbol);
      }
    });
    // Fly in from a random edge.
    const { W, H } = geom.W ? geom : { W: 600, H: 380 };
    const side = Math.floor(Math.random() * 4);
    const x = side === 0 ? -40 : side === 1 ? W + 40 : Math.random() * W;
    const y = side === 2 ? -40 : side === 3 ? H + 40 : Math.random() * H * 0.6;
    const r = () => Math.random();
    const it: Item = { symbol, node, x, y, tx: x, ty: y, w1: 0.0005 + r() * 0.0005, w2: 0.0006 + r() * 0.0006, p1: r() * 6.28, p2: r() * 6.28, q1: r() * 6.28, q2: r() * 6.28 };
    node.style.transform = `translate(${x}px, ${y}px)`;
    root.insertBefore(node, rail);
    items.set(symbol, it);
    return it;
  }

  function update(next: StageView): void {
    if (view && view.key !== next.key) {
      for (const it of items.values()) it.node.remove();
      items.clear();
      for (const g of ghosts.values()) g.node.remove();
      ghosts.clear();
    }
    view = next;
    const sig = JSON.stringify([next.scale, next.snap]);
    if (sig !== marksKey) {
      marksKey = sig;
      track.replaceChildren(lineMarks(next.scale, next.snap));
    }
    measure();
    const want = new Set(next.entries.map((e) => e.symbol));
    for (const [symbol, it] of items) {
      if (!want.has(symbol)) {
        it.node.remove();
        items.delete(symbol);
      }
    }
    for (const e of next.entries) if (!items.has(e.symbol)) add(e.symbol);
    for (const it of items.values()) {
      it.node.classList.toggle('is-picked', it.symbol === next.picked);
      it.node.tabIndex = next.phase === 'collect' ? -1 : 0;
      it.node.setAttribute('aria-label', next.phase === 'collect' ? 'A placed symbol' : 'Show this reason');
    }
    root.classList.toggle('is-collecting', next.phase === 'collect');
    targets();
    if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
  }

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      measure();
      targets();
    }).observe(root);
  }

  return { root, update, at: (symbol) => items.get(symbol) ?? null, size: () => geom };
}

export type Stage = {
  root: HTMLElement;
  update: (view: StageView) => void;
  /** Where a symbol sits now, for placing its reason card. */
  at: (symbol: string) => { x: number; y: number } | null;
  size: () => { W: number; H: number; s: number };
};
