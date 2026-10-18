import { el, token } from '@/blocks/peer-feedback-ui';
import { cloudWords } from './cloud';

/**
 * The shared brainstorm board. Before reveal, each answer is its writer's
 * symbol on a slow orbit round the question. Reveal moves every shape into
 * its card in the chosen layout (FLIP: cards sit in normal flow and animate
 * from where their shape was), and Back to shapes reverses it.
 */

export type Layout = 'grid' | 'cloud' | 'groups';
export type BoardAnswer = { id: string; text: string; symbol?: string | null };
export type BoardGroup = { id: string; name: string; answer_ids: string[] };
export type BoardView = {
  question: string;
  revealed: boolean;
  layout: Layout;
  /** Answers on the board. Students before reveal get none, only `count`. */
  answers: BoardAnswer[];
  count?: number;
  symbolsOnCards: boolean;
  groups: BoardGroup[] | null;
};
/** Teacher-only controls; a student board passes none. */
export type BoardActions = {
  remove?: (id: string) => void;
  move?: (id: string, group: string) => void;
  rename?: (group: string, name: string) => void;
};

type Point = { x: number; y: number };
type Item = Point & { node: HTMLElement };

function option(text: string, value: string, selected = false): HTMLOptionElement {
  const o = el('option', undefined, text);
  o.value = value;
  o.selected = selected;
  return o;
}

const EASE = 0.07;
const NEW_GROUP = '__new';

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function mountBoard(actions: BoardActions = {}): { root: HTMLElement; update: (view: BoardView) => void } {
  const root = el('div', 'bs-board');
  const orbit = el('div', 'bs-orbit');
  const centre = el('div', 'bs-orbit__centre');
  const question = el('p', 'bs-orbit__question');
  const hint = el('p', 'bs-orbit__hint');
  centre.append(question, hint);
  orbit.append(centre);
  const reveal = el('div', 'bs-reveal');
  reveal.hidden = true;
  root.append(orbit, reveal);

  const items = new Map<string, Item>();
  let mode: 'orbit' | 'reveal' = 'orbit';
  let painted = '';
  let shownIds = new Set<string>();
  let raf = 0;

  function frame(t: number): void {
    if (!root.isConnected) {
      raf = 0;
      return;
    }
    if (mode === 'orbit' && items.size) placeOrbit(t);
    raf = requestAnimationFrame(frame);
  }
  const run = () => {
    if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
  };

  function placeOrbit(t: number): void {
    const W = orbit.clientWidth;
    const H = orbit.clientHeight;
    if (!W || !H) return;
    const list = [...items.values()];
    const rings = list.length > 30 ? 3 : 2;
    const fractions = rings === 2 ? [0.68, 1] : [0.6, 0.8, 1];
    // Fit the widest ellipse the box allows; narrow boxes go rounder rather than smaller.
    const R = Math.max(60, Math.min(W / 2 - 20, (H / 2 - 20) / 0.78));
    const squash = Math.min(1, (H / 2 - 20) / R);
    // Shapes shrink until the inner ring has room for its share.
    const perRing = Math.ceil(list.length / rings);
    const inner = R * fractions[0]!;
    const size = Math.round(Math.max(14, Math.min(32, ((2 * Math.PI * inner * (1 + squash)) / 2 / perRing) * 0.8)));
    if (orbit.style.getPropertyValue('--bs-size') !== `${size}px`) {
      orbit.style.setProperty('--bs-size', `${size}px`);
      centre.style.width = `${Math.max(110, Math.round(inner * 1.5 - size))}px`;
    }
    const still = prefersReducedMotion();
    list.forEach((it, i) => {
      const ring = i % rings;
      const inRing = Math.ceil((list.length - ring) / rings);
      const slot = Math.floor(i / rings);
      const radius = R * fractions[ring]!;
      const dir = ring % 2 ? -1 : 1;
      const speed = still ? 0 : 0.00011 - ring * 0.00002;
      const a = (slot / inRing) * Math.PI * 2 + ring * 0.7 + dir * t * speed;
      const tx = W / 2 + Math.cos(a) * radius;
      const ty = H / 2 + Math.sin(a) * radius * squash;
      const k = still ? 1 : EASE;
      it.x += (tx - it.x) * k;
      it.y += (ty - it.y) * k;
      it.node.style.transform = `translate(${(it.x - size / 2).toFixed(1)}px, ${(it.y - size / 2).toFixed(1)}px)`;
    });
  }

  function shape(symbol: string | null | undefined): HTMLElement {
    if (!symbol) return el('span', 'bs-dot');
    const t = token(symbol, 'md');
    t.classList.add('bs-shape');
    return t;
  }

  /** Orbit ids: real answers, or placeholders when only a count is known. */
  function orbitAnswers(view: BoardView): BoardAnswer[] {
    if (view.answers.length || !view.count) return view.answers;
    return Array.from({ length: view.count }, (_, i) => ({ id: `n${i}`, text: '' }));
  }

  function syncOrbit(view: BoardView, from?: Map<string, Point>): void {
    const answers = orbitAnswers(view);
    const ids = new Set(answers.map((a) => a.id));
    for (const [id, it] of items) {
      if (!ids.has(id)) {
        it.node.remove();
        items.delete(id);
      }
    }
    const W = orbit.clientWidth || 600;
    const H = orbit.clientHeight || 400;
    for (const a of answers) {
      if (items.has(a.id)) continue;
      const node = shape(a.symbol);
      node.classList.add('bs-orbit__item');
      const start = from?.get(a.id) ?? { x: W / 2, y: H + 24 };
      node.style.transform = `translate(${start.x}px, ${start.y}px)`;
      orbit.append(node);
      items.set(a.id, { node, ...start });
    }
    question.textContent = view.question || 'Brainstorm';
    const n = answers.length;
    hint.textContent = n ? `${n} ${n === 1 ? 'answer' : 'answers'}` : 'Answers will appear here.';
  }

  function card(a: BoardAnswer, view: BoardView, groups: BoardGroup[] | null): HTMLElement {
    const c = el('div', 'bs-card');
    c.dataset.id = a.id;
    if (!shownIds.has(a.id) && painted) c.classList.add('bs-card--new');
    if (view.symbolsOnCards && a.symbol) c.append(token(a.symbol, 'sm'));
    c.append(el('p', 'bs-card__text', a.text));
    if (actions.move && groups) {
      c.draggable = true;
      c.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', a.id));
      const pick = el('select', 'bs-card__move');
      pick.setAttribute('aria-label', 'Move to group');
      pick.append(option('Move…', ''), ...groups.map((g) => option(g.name, g.id)));
      pick.addEventListener('change', () => pick.value && actions.move?.(a.id, pick.value));
      c.append(pick);
    }
    if (actions.remove) {
      const x = el('button', 'bs-card__remove', '×');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove answer: ${a.text}`);
      x.addEventListener('click', () => actions.remove?.(a.id));
      c.append(x);
    }
    return c;
  }

  function gridOf(answers: BoardAnswer[], view: BoardView, groups: BoardGroup[] | null = null): HTMLElement {
    const grid = el('div', 'bs-grid');
    grid.append(...answers.map((a) => card(a, view, groups)));
    return grid;
  }

  function cloudOf(view: BoardView): HTMLElement {
    const words = cloudWords(view.answers.map((a) => a.text));
    const cloud = el('div', 'bs-cloud');
    const top = words[0]?.count ?? 1;
    // Biggest in the middle, then alternating either side.
    const ordered: typeof words = [];
    words.forEach((w, i) => (i % 2 ? ordered.push(w) : ordered.unshift(w)));
    for (const w of ordered) {
      const span = el('span', 'bs-cloud__word', w.text);
      const weight = top > 1 ? (w.count - 1) / (top - 1) : 0;
      span.style.fontSize = `${(1 + weight * 1.6).toFixed(2)}rem`;
      span.title = `${w.count} ${w.count === 1 ? 'time' : 'times'}`;
      cloud.append(span);
    }
    return cloud;
  }

  function groupsOf(view: BoardView): HTMLElement {
    const groups = view.groups ?? [];
    const byId = new Map(view.answers.map((a) => [a.id, a]));
    const placed = new Set(groups.flatMap((g) => g.answer_ids));
    const fresh = view.answers.filter((a) => !placed.has(a.id));
    const wrap = el('div', 'bs-groups');
    const columns = [...groups, ...(fresh.length ? [{ id: NEW_GROUP, name: 'New', answer_ids: fresh.map((a) => a.id) }] : [])];
    for (const g of columns) {
      const col = el('section', 'bs-group');
      col.dataset.group = g.id;
      if (actions.rename && g.id !== NEW_GROUP) {
        const name = el('input', 'bs-group__name');
        name.value = g.name;
        name.maxLength = 40;
        name.setAttribute('aria-label', 'Group name');
        name.addEventListener('change', () => name.value.trim() && actions.rename?.(g.id, name.value.trim()));
        col.append(name);
      } else {
        col.append(el('h4', 'bs-group__title', g.name));
      }
      if (actions.move && g.id !== NEW_GROUP) {
        col.addEventListener('dragover', (e) => {
          e.preventDefault();
          col.classList.add('bs-group--over');
        });
        col.addEventListener('dragleave', () => col.classList.remove('bs-group--over'));
        col.addEventListener('drop', (e) => {
          e.preventDefault();
          col.classList.remove('bs-group--over');
          const id = e.dataTransfer?.getData('text/plain');
          if (id) actions.move?.(id, g.id);
        });
      }
      const answers = g.answer_ids.map((id) => byId.get(id)).filter((a): a is BoardAnswer => !!a);
      col.append(gridOf(answers, view, groups));
      wrap.append(col);
    }
    return wrap;
  }

  function paintReveal(view: BoardView): void {
    const sig = JSON.stringify([view.layout, view.answers, view.groups, view.symbolsOnCards]);
    if (sig === painted) return;
    let body: HTMLElement;
    if (!view.answers.length) body = el('p', 'bs-empty', 'No answers on the board yet.');
    else if (view.layout === 'cloud') body = cloudOf(view);
    else if (view.layout === 'groups' && view.groups) body = groupsOf(view);
    else body = gridOf(view.answers, view);
    reveal.replaceChildren(body);
    painted = sig;
    shownIds = new Set(view.answers.map((a) => a.id));
  }

  /** Shapes fly from the orbit into their cards. */
  function toReveal(view: BoardView): void {
    const box = orbit.getBoundingClientRect();
    const from = new Map([...items].map(([id, it]) => [id, { x: box.left + it.x, y: box.top + it.y }]));
    for (const it of items.values()) it.node.remove();
    items.clear();
    mode = 'reveal';
    orbit.hidden = true;
    reveal.hidden = false;
    painted = '';
    paintReveal(view);
    if (prefersReducedMotion()) return;
    const cards = [...reveal.querySelectorAll<HTMLElement>('.bs-card[data-id]')];
    for (const c of cards) {
      const p = from.get(c.dataset.id ?? '');
      const r = c.getBoundingClientRect();
      const dx = p ? p.x - (r.left + r.width / 2) : 0;
      const dy = p ? p.y - (r.top + r.height / 2) : 40;
      c.style.transition = 'none';
      c.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.3)`;
      c.style.opacity = '0.3';
    }
    void reveal.offsetWidth;
    requestAnimationFrame(() => {
      for (const c of cards) {
        c.style.transition = '';
        c.style.transform = '';
        c.style.opacity = '';
      }
    });
  }

  /** Cards fold back into shapes where they stood, then ease into orbit. */
  function toOrbit(view: BoardView): void {
    const box = reveal.getBoundingClientRect();
    const from = new Map<string, Point>();
    for (const c of reveal.querySelectorAll<HTMLElement>('.bs-card[data-id]')) {
      const r = c.getBoundingClientRect();
      from.set(c.dataset.id ?? '', { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top });
    }
    mode = 'orbit';
    reveal.hidden = true;
    reveal.replaceChildren();
    painted = '';
    orbit.hidden = false;
    syncOrbit(view, from);
  }

  function update(view: BoardView): void {
    root.classList.toggle('bs-board--revealed', view.revealed);
    if (view.revealed && mode === 'orbit') toReveal(view);
    else if (!view.revealed && mode === 'reveal') toOrbit(view);
    else if (mode === 'reveal') paintReveal(view);
    else syncOrbit(view);
    run();
  }

  return { root, update };
}
