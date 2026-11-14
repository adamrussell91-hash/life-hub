import { el } from '@/quiz/dom';
import type { PublicRotation, PublicStation } from './schema';
import type { RotationClient, RotationStatus } from './api';

export type EvidenceBoardOptions = {
  rotation: PublicRotation;
  client: RotationClient;
  run: (go: () => Promise<RotationStatus>) => Promise<RotationStatus | null>;
  /** sessionStorage key for the cards already shown arriving, so each animates onto the board once. */
  storageKey?: string;
};
export type EvidenceBoard = { root: HTMLElement; update(status: RotationStatus): void; dispose(): void };

type Rect = { x: number; y: number; w: number; h: number };
const SVG = 'http://www.w3.org/2000/svg';

/** Where a line from a rect's centre towards (tx, ty) leaves the rect: arrows stop at card edges. */
export function edgePoint(r: Rect, tx: number, ty: number): { x: number; y: number } {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** A spot for a link label on the segment, clear of every card when one exists. */
export function labelSpot(a: { x: number; y: number }, b: { x: number; y: number }, cards: Rect[], size = { w: 90, h: 16 }): { x: number; y: number } {
  const hits = (p: { x: number; y: number }) => cards.some((r) => p.x + size.w / 2 > r.x && p.x - size.w / 2 < r.x + r.w && p.y + size.h / 2 > r.y && p.y - size.h / 2 < r.y + r.h);
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!hits(p)) return p;
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Cards already seen arriving on this board, this browser session. Storage can be missing or blocked. */
function readSeen(key: string | undefined): Set<string> | null {
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const list: unknown = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return null;
  }
}
function writeSeen(key: string | undefined, seen: Set<string>): void {
  if (!key) return;
  try { window.sessionStorage.setItem(key, JSON.stringify([...seen])); } catch { /* storage blocked: the card just animates again next time */ }
}

/** Default positions: a grid in collection order, for cards never dragged. */
function defaultPos(i: number): { x: number; y: number } {
  return { x: 4 + (i % 3) * 33, y: 6 + Math.floor(i / 3) * 34 };
}

export function mountEvidenceBoard(o: EvidenceBoardOptions): EvidenceBoard {
  const stations = o.rotation.stations;
  const byId = new Map(stations.map((s) => [s.id, s]));
  const root = el('div', 'rot-grid rot-board-wrap');
  root.style.gap = '8px';
  const top = el('div', 'rot-row rot-row--between');
  const hint = el('p', 'rot-small rot-muted rot-board-hint', 'Drag your evidence to arrange it. Tap one card, then another, to link them.');
  hint.style.margin = '0';
  const saved = el('span', 'rot-saved');
  saved.setAttribute('role', 'status');
  top.append(hint, saved);
  const board = el('div', 'rot-board');
  board.setAttribute('aria-label', 'Evidence board');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'rot-board__links');
  svg.setAttribute('aria-hidden', 'true');
  board.append(svg);
  const linker = el('div', 'rot-linker');
  linker.hidden = true;
  const list = el('div', 'rot-board-list');
  root.append(top, board, linker, list);

  let status: RotationStatus | null = null;
  let pos: Record<string, { x: number; y: number }> = {};
  let links: RotationStatus['board']['links'] = [];
  let collected: string[] = [];
  let selected: string | null = null;
  let second: string | null = null;
  let dragging = false;
  let sig = '';
  const cardEls = new Map<string, HTMLElement>();
  /** Null until the first update. */
  let seen: Set<string> | null = null;
  let fresh = new Set<string>();
  let kit: RotationStatus['kit'] = [];
  const kitLines = (id: string) => kit.filter((k) => k.station === id);
  const add = { from: '', to: '', word: '' };

  const label = (s: PublicStation | undefined) => s?.title || 'Station';
  const say = (text: string, bad = false) => { saved.textContent = text; saved.dataset.bad = String(bad); };

  async function save(go: () => Promise<RotationStatus>): Promise<boolean> {
    say('Saving…');
    try {
      const next = await o.run(go);
      if (!next) { say('Not saved. Check your connection and try again.', true); return false; }
      say('Saved to your account');
      return true;
    } catch (e) {
      say(`Not saved: ${e instanceof Error ? e.message : 'try again.'}`, true);
      return false;
    }
  }

  function rectOf(id: string): Rect | null {
    const c = cardEls.get(id);
    if (!c || !board.isConnected) return null;
    const b = board.getBoundingClientRect();
    const r = c.getBoundingClientRect();
    if (!b.width) return null;
    return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
  }

  function drawLinks(): void {
    svg.replaceChildren();
    const defs = document.createElementNS(SVG, 'defs');
    const marker = document.createElementNS(SVG, 'marker');
    marker.setAttribute('id', 'rot-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M0 0 L10 5 L0 10 z');
    path.setAttribute('fill', 'var(--navy-2)');
    marker.append(path);
    defs.append(marker);
    svg.append(defs);
    const rects = collected.map(rectOf).filter((r): r is Rect => !!r);
    for (const l of links) {
      const a = rectOf(l.from);
      const b = rectOf(l.to);
      if (!a || !b) continue;
      const p1 = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2);
      const p2 = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', String(p1.x));
      line.setAttribute('y1', String(p1.y));
      line.setAttribute('x2', String(p2.x));
      line.setAttribute('y2', String(p2.y));
      line.setAttribute('marker-end', 'url(#rot-arrow)');
      svg.append(line);
      const spot = labelSpot(p1, p2, rects, { w: l.word.length * 6.5 + 8, h: 16 });
      const text = document.createElementNS(SVG, 'text');
      text.setAttribute('x', String(spot.x));
      text.setAttribute('y', String(spot.y + 4));
      text.setAttribute('text-anchor', 'middle');
      text.textContent = l.word;
      svg.append(text);
    }
  }

  function paintLinker(): void {
    linker.replaceChildren();
    if (!selected || !second) { linker.hidden = true; return; }
    linker.hidden = false;
    const from = selected;
    const to = second;
    const line = el('span', 'rot-small');
    line.append(el('b', '', label(byId.get(from))), document.createTextNode(' → '), el('b', '', label(byId.get(to))));
    const words = el('div', 'rot-row');
    for (const w of o.rotation.link_words) {
      const b = el('button', 'rot-btn rot-btn--small', w);
      b.type = 'button';
      b.addEventListener('click', () => { selected = null; second = null; paintLinker(); paintSelection(); void save(() => o.client.link(from, to, w)); });
      words.append(b);
    }
    const existing = links.find((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
    if (existing) {
      const rm = el('button', 'rot-btn rot-btn--small rot-btn--danger', 'Remove link');
      rm.type = 'button';
      rm.addEventListener('click', () => { selected = null; second = null; paintLinker(); paintSelection(); void save(() => o.client.unlink(from, to)); });
      words.append(rm);
    }
    const cancel = el('button', 'rot-link', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { selected = null; second = null; paintLinker(); paintSelection(); });
    linker.append(line, words, cancel);
  }

  function paintSelection(): void {
    for (const [id, c] of cardEls) c.dataset.sel = String(id === selected || id === second);
  }

  function makeCard(id: string, i: number): HTMLElement {
    const s = byId.get(id);
    const card = el('button', 'rot-ev');
    card.type = 'button';
    card.dataset.station = id;
    const head = el('b');
    head.append(el('i', '', s?.token || String(stations.filter((x) => x.kind !== 'teacher').findIndex((x) => x.id === id) + 1)), document.createTextNode(label(s)));
    card.append(head, document.createTextNode(s?.piece || 'Evidence collected.'));
    const lines = kitLines(id);
    if (lines.length) {
      const ul = el('ul', 'rot-ev__kit');
      ul.setAttribute('aria-label', 'Viva Kit cards');
      for (const k of lines) ul.append(el('li', '', k.title));
      card.append(ul);
    }
    if (fresh.has(id)) card.classList.add('rot-ev--new');
    const p = pos[id] ?? defaultPos(i);
    card.style.left = `${p.x}%`;
    card.style.top = `${p.y}%`;
    card.setAttribute('aria-label', `${label(s)}: ${s?.piece ?? ''}. Tap to link.`);
    let start: { x: number; y: number; left: number; top: number } | null = null;
    let moved = false;
    card.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, left: card.offsetLeft, top: card.offsetTop };
      moved = false;
      card.setPointerCapture?.(e.pointerId);
    });
    card.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      dragging = true;
      const bw = board.clientWidth;
      const bh = board.clientHeight;
      const left = Math.max(0, Math.min(bw - card.offsetWidth, start.left + dx));
      const top = Math.max(0, Math.min(bh - card.offsetHeight, start.top + dy));
      card.style.left = `${(left / bw) * 100}%`;
      card.style.top = `${(top / bh) * 100}%`;
      drawLinks();
    });
    const end = () => {
      if (!start) return;
      start = null;
      if (!moved) return;
      dragging = false;
      const x = (card.offsetLeft / board.clientWidth) * 100;
      const y = (card.offsetTop / board.clientHeight) * 100;
      pos = { ...pos, [id]: { x, y } };
      // A drag saves straight away; nothing else waits on it.
      void save(() => o.client.move(id, x, y));
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
    card.addEventListener('click', () => {
      if (moved) { moved = false; return; }
      if (!selected || selected === id) { selected = selected === id ? null : id; second = null; }
      else second = id;
      paintSelection();
      paintLinker();
    });
    return card;
  }

  function paintList(): void {
    list.replaceChildren();
    if (!collected.length) { list.append(el('p', 'rot-note', 'Collect pieces at the stations and they land here.')); return; }
    for (const id of collected) {
      const s = byId.get(id);
      const item = el('div', 'rot-bl-item');
      item.append(el('b', '', `${s?.token ? `${s.token} · ` : ''}${label(s)}`), el('span', '', s?.piece || 'Evidence collected.'));
      const lines = kitLines(id);
      if (lines.length) {
        const ul = el('ul', 'rot-ev__kit');
        ul.setAttribute('aria-label', 'Viva Kit cards');
        for (const k of lines) { const li = el('li'); li.append(el('b', '', `${k.title}: `), document.createTextNode(k.text)); ul.append(li); }
        item.append(ul);
      }
      if (fresh.has(id)) item.classList.add('rot-ev--new');
      list.append(item);
    }
    for (const l of links) {
      const row = el('div', 'rot-bl-link');
      row.append(el('span', '', `${label(byId.get(l.from))} ${l.word} ${label(byId.get(l.to))}`));
      const rm = el('button', 'rot-btn rot-btn--small', 'Remove');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Remove the link ${label(byId.get(l.from))} ${l.word} ${label(byId.get(l.to))}`);
      rm.addEventListener('click', () => void save(() => o.client.unlink(l.from, l.to)));
      row.append(rm);
      list.append(row);
    }
    if (collected.length < 2) return;
    const box = el('div', 'rot-bl-add');
    box.append(el('b', 'rot-small', 'Add a link'));
    const sel = (value: string, items: Array<[string, string]>, aria: string, onPick: (v: string) => void) => {
      const s = el('select');
      s.setAttribute('aria-label', aria);
      for (const [v, t] of items) { const op = el('option', '', t); op.value = v; op.selected = v === value; s.append(op); }
      s.addEventListener('change', () => onPick(s.value));
      return s;
    };
    const cards: Array<[string, string]> = [['', 'Pick a card'], ...collected.map((id): [string, string] => [id, label(byId.get(id))])];
    const go = el('button', 'rot-btn rot-btn--small rot-btn--primary', 'Add link');
    go.type = 'button';
    go.addEventListener('click', () => {
      if (!add.from || !add.to || !add.word) { say('Pick two cards and a word.', true); return; }
      if (add.from === add.to) { say('Pick two different cards.', true); return; }
      const { from, to, word } = add;
      void save(() => o.client.link(from, to, word)).then((ok) => { if (ok) { add.from = ''; add.to = ''; add.word = ''; } });
    });
    box.append(
      sel(add.from, cards, 'First card', (v) => { add.from = v; }),
      sel(add.word, [['', 'Pick a word'], ...o.rotation.link_words.map((w): [string, string] => [w, w])], 'Link word', (v) => { add.word = v; }),
      sel(add.to, cards, 'Second card', (v) => { add.to = v; }),
      go
    );
    list.append(box);
  }

  function paint(): void {
    for (const c of cardEls.values()) c.remove();
    cardEls.clear();
    collected.forEach((id, i) => { const c = makeCard(id, i); cardEls.set(id, c); board.append(c); });
    if (!collected.length) {
      const empty = el('p', 'rot-note', 'Collect pieces at the stations and they land here.');
      empty.style.padding = '16px';
      cardEls.set('__empty', empty);
      board.append(empty);
    }
    paintSelection();
    paintList();
    requestAnimationFrame(drawLinks);
  }

  const onResize = () => drawLinks();
  window.addEventListener('resize', onResize);

  return {
    root,
    dispose(): void { window.removeEventListener('resize', onResize); },
    update(next: RotationStatus): void {
      status = next;
      if (dragging) return;
      const nextCollected = (status.work?.collected ?? []).filter((id) => byId.get(id)?.kind !== 'teacher');
      const nextKit = status.kit ?? [];
      const nextSig = JSON.stringify([nextCollected, status.board, nextKit.map((k) => `${k.station}:${k.lock}`)]);
      if (nextSig === sig) { requestAnimationFrame(drawLinks); return; }
      sig = nextSig;
      collected = nextCollected;
      kit = nextKit;
      // A card animates in the first time this board sees it, once per browser session.
      if (!seen) {
        // No record yet this session: what is already on the board when it first loads doesn't animate.
        seen = readSeen(o.storageKey) ?? new Set(collected);
        writeSeen(o.storageKey, seen);
      }
      fresh = new Set(collected.filter((id) => !seen!.has(id)));
      if (fresh.size) { for (const id of fresh) seen.add(id); writeSeen(o.storageKey, seen); }
      pos = { ...status.board.pos };
      links = status.board.links;
      if (selected && !collected.includes(selected)) selected = null;
      paint();
      paintLinker();
    }
  };
}
