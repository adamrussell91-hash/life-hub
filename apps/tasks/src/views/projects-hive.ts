import type { Task } from '@/schemas/task';
import { projectPageHash } from '@/domain/cards';
import { LIFECYCLE_LABEL, type ProjectPulseCard, type PulseGroup } from '@/domain/projects-pulse';
import {
  HIVE_HEALTH_LABEL,
  MAX_PIPS,
  hiveTileCorners,
  hiveTileFacts,
  layoutHive,
  wrapHiveTitle,
  type HiveHealth,
  type HiveLayout,
  type HiveTileFacts
} from '@/domain/projects-hive';
import { SQRT3 } from '../../../../packages/walkthrus/board/hex';
import { el } from '@/views/hub-kit';

/**
 * The Projects landing view: a WalkThru-style hive of hexagons, one cluster
 * per group. Colour = the group, tab = time left, pips = scope, badge =
 * health; NSW HALT projects carry the HALT badge. Tap a hexagon for its
 * summary; the kanban board stays one toggle away.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Kit pastels, one per cluster, cycling when there are more groups than colours. */
const GROUP_FILLS = [
  'var(--pastel-gold)',
  'var(--pastel-blue)',
  'var(--pastel-peach)',
  'var(--pastel-lilac)',
  'var(--pastel-sage)'
];

export type HiveInput = {
  groups: PulseGroup[];
  tasks: Task[];
  now: Date;
  /** Shown when no group has a project (filters, or an empty portfolio). */
  emptyMessage: string;
};

export type ProjectsHive = {
  el: HTMLElement;
  update(input: HiveInput): void;
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return node;
}

export function groupFill(index: number): string {
  return GROUP_FILLS[index % GROUP_FILLS.length]!;
}

/** Health glyph: shape differs as well as colour (dot, triangle, square, dash). */
function healthGlyph(health: HiveHealth, cx: number, cy: number, r: number): SVGElement {
  const cls = `hive-health hive-health--${health}`;
  if (health === 'on_track') return svg('circle', { class: cls, cx, cy, r });
  if (health === 'slipping') {
    return svg('polygon', { class: cls, points: `${cx},${cy - r} ${cx + r * 1.1},${cy + r * 0.9} ${cx - r * 1.1},${cy + r * 0.9}` });
  }
  if (health === 'stalled') return svg('rect', { class: cls, x: cx - r * 0.9, y: cy - r * 0.9, width: r * 1.8, height: r * 1.8 });
  return svg('rect', { class: cls, x: cx - r * 1.1, y: cy - 1, width: r * 2.2, height: 2, rx: 1 });
}

/** The existing NSW HALT badge (blue HALT, magenta NSW), drawn in SVG for the hexagon. */
function haltBadgeSvg(cx: number, cy: number, fs: number): SVGElement {
  const g = svg('g', { class: 'hive-halt', 'aria-hidden': 'true' });
  const h = fs + 5;
  const haltW = fs * 3.2;
  const nswW = fs * 2.7;
  const x = cx - (haltW + nswW) / 2;
  g.append(
    svg('rect', { class: 'hive-halt__halt', x, y: cy - h / 2, width: haltW, height: h }),
    svg('rect', { class: 'hive-halt__nsw', x: x + haltW, y: cy - h / 2, width: nswW, height: h }),
    svg('text', { class: 'hive-halt__text', x: x + haltW / 2, y: cy + fs * 0.36, 'font-size': fs, 'text-anchor': 'middle' }, 'HALT'),
    svg('text', { class: 'hive-halt__text', x: x + haltW + nswW / 2, y: cy + fs * 0.36, 'font-size': fs, 'text-anchor': 'middle' }, 'NSW')
  );
  return g;
}

function scopeLabel(facts: HiveTileFacts): string {
  if (!facts.scopeTotal) return `no ${facts.scopeKind} yet`;
  return `${facts.scopeDone} of ${facts.scopeTotal} ${facts.scopeKind} done`;
}

function tileAria(card: ProjectPulseCard, facts: HiveTileFacts, halt: boolean): string {
  return [
    card.project.title,
    halt ? 'NSW HALT' : null,
    HIVE_HEALTH_LABEL[facts.health],
    facts.timeLeft,
    scopeLabel(facts)
  ]
    .filter(Boolean)
    .join(', ');
}

function drawTile(g: SVGGElement, card: ProjectPulseCard, facts: HiveTileFacts, size: number, selected: boolean): void {
  const h = SQRT3 * size;
  const halt = (card.project.job ?? 'teaching') === 'halt_board';
  const fs = Math.round(size * 0.21);
  const points = hiveTileCorners(size)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  g.replaceChildren();
  g.setAttribute('class', `hive-tile hive-tile--${facts.health}${selected ? ' is-selected' : ''}`);
  g.setAttribute('aria-label', tileAria(card, facts, halt));
  g.setAttribute('aria-pressed', selected ? 'true' : 'false');

  const hex = svg('polygon', { class: 'hive-tile__hex', points });
  hex.style.fill = groupFill(Number(g.dataset.groupIndex ?? 0));
  g.append(hex);
  if (facts.health === 'stalled') g.append(svg('polygon', { class: 'hive-tile__hatch', points }));

  // Tab: time left.
  const tabY = -h / 2 + size * 0.24;
  const tabW = Math.max(facts.timeLeft.length * fs * 0.62 + 10, size * 0.6);
  g.append(
    svg('rect', { class: 'hive-tile__tab', x: -tabW / 2, y: tabY - (fs + 3) / 2, width: tabW, height: fs + 3, rx: 1.5 }),
    svg('text', { class: 'hive-tile__tab-text', x: 0, y: tabY + fs * 0.34, 'font-size': fs - 1, 'text-anchor': 'middle' }, facts.timeLeft)
  );

  if (halt) g.append(haltBadgeSvg(0, -h / 2 + size * 0.56, fs - 2));

  // Title: two lines, nudged up when there is no HALT badge above it.
  const lines = wrapHiveTitle(card.project.title, Math.round(size * 0.27));
  const lead = fs * 1.12;
  const titleMid = halt ? size * 0.12 : size * 0.02;
  const title = svg('text', { class: 'hive-tile__title', 'font-size': fs, 'text-anchor': 'middle' });
  lines.forEach((line, index) => {
    const y = titleMid - ((lines.length - 1) * lead) / 2 + index * lead + fs * 0.35;
    title.append(svg('tspan', { x: 0, y: y.toFixed(1) }, line));
  });
  g.append(title);

  // Badge: health glyph plus scope pips (or "4/12" when there are too many).
  const badgeY = h / 2 - size * 0.24;
  const badgeH = fs + 3;
  const pips = facts.scopeTotal > 0 && facts.scopeTotal <= MAX_PIPS;
  const countText = facts.scopeTotal > MAX_PIPS ? `${facts.scopeDone}/${facts.scopeTotal}` : '';
  const pipStep = 6.5;
  const contentW = 10 + (pips ? facts.scopeTotal * pipStep : 0) + (countText ? countText.length * (fs - 2) * 0.62 + 4 : 0);
  const badgeW = contentW + 10;
  const left = -badgeW / 2;
  g.append(svg('rect', { class: 'hive-tile__badge', x: left, y: badgeY - badgeH / 2, width: badgeW, height: badgeH, rx: badgeH / 2 }));
  g.append(healthGlyph(facts.health, left + 9, badgeY, 3.4));
  if (pips) {
    for (let i = 0; i < facts.scopeTotal; i++) {
      g.append(
        svg('circle', {
          class: `hive-pip${i < facts.scopeDone ? ' is-done' : ''}`,
          cx: left + 17 + i * pipStep,
          cy: badgeY,
          r: 2.2
        })
      );
    }
  }
  if (countText) {
    g.append(svg('text', { class: 'hive-tile__count', x: left + 15, y: badgeY + (fs - 2) * 0.36, 'font-size': fs - 2 }, countText));
  }
}

function healthDot(health: HiveHealth): HTMLElement {
  const dot = el('span', `hive-dot hive-dot--${health}`);
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

function haltBadgeHtml(): HTMLElement {
  const badge = el('span', 'halt-badge');
  badge.setAttribute('aria-label', 'NSW HALT');
  badge.append(el('span', 'halt-badge__halt', 'HALT'), el('span', 'halt-badge__nsw', 'NSW'));
  return badge;
}

export function createProjectsHive(): ProjectsHive {
  const root = el('section', 'projects-hive');
  root.id = 'projects-hive';
  const stage = el('div', 'projects-hive__stage');
  const svgRoot = svg('svg', { class: 'projects-hive__svg', role: 'group', 'aria-label': 'Projects hive' });
  const defs = svg('defs');
  const hatch = svg('pattern', { id: 'hive-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  hatch.append(svg('rect', { class: 'hive-hatch__line', x: 0, y: 0, width: 2, height: 8 }));
  defs.append(hatch);
  const labelLayer = svg('g', { class: 'projects-hive__labels' });
  const tileLayer = svg('g', { class: 'projects-hive__tiles' });
  svgRoot.append(defs, labelLayer, tileLayer);
  const empty = el('p', 'empty-state');
  empty.hidden = true;
  stage.append(svgRoot, empty);
  const panel = el('aside', 'projects-hive__panel');
  panel.setAttribute('aria-live', 'polite');
  root.append(stage, panel);

  const nodes = new Map<string, SVGGElement>();
  let input: HiveInput | null = null;
  let selectedId: string | null = null;
  let layout: HiveLayout | null = null;
  let lastWidth = 0;

  const cardsById = () => new Map((input?.groups ?? []).flatMap((group) => group.cards).map((card) => [card.project.id, card]));

  function measure(): number {
    return Math.max(260, Math.floor(stage.clientWidth || 860));
  }

  function select(id: string | null): void {
    selectedId = id;
    draw(false);
  }

  function tileNode(id: string): SVGGElement {
    let g = nodes.get(id);
    if (g) return g;
    g = svg('g', { role: 'button', tabindex: 0 });
    g.dataset.projectId = id;
    g.addEventListener('click', () => select(selectedId === id ? null : id));
    g.addEventListener('dblclick', () => {
      location.hash = projectPageHash(id);
    });
    g.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(selectedId === id ? null : id);
      }
    });
    nodes.set(id, g);
    return g;
  }

  function paintPanel(): void {
    const cards = cardsById();
    const card = selectedId ? cards.get(selectedId) : undefined;
    panel.replaceChildren();
    root.classList.toggle('has-selection', Boolean(card));
    if (!input) return;
    if (!card) {
      selectedId = null;
      const all = [...cards.values()];
      panel.append(el('h2', 'projects-hive__panel-title', `${all.length} project${all.length === 1 ? '' : 's'}`));
      const list = el('ul', 'projects-hive__summary');
      for (const health of ['on_track', 'slipping', 'stalled', 'parked'] as const) {
        const count = all.filter((item) => hiveTileFacts(item, input!.tasks, input!.now).health === health).length;
        const row = el('li', 'projects-hive__summary-row');
        row.append(healthDot(health), el('span', undefined, HIVE_HEALTH_LABEL[health]), el('strong', undefined, String(count)));
        list.append(row);
      }
      panel.append(list, el('p', 'projects-hive__hint', 'Tap a hexagon for its next action. Colour is the group, the tab is time left, dots are milestones.'));
      return;
    }
    const facts = hiveTileFacts(card, input.tasks, input.now);
    const head = el('div', 'projects-hive__panel-head');
    const titleWrap = el('div', 'projects-hive__panel-titles');
    if ((card.project.job ?? 'teaching') === 'halt_board') titleWrap.append(haltBadgeHtml());
    titleWrap.append(el('h2', 'projects-hive__panel-title', card.project.title));
    const close = el('button', 'btn btn--ghost projects-hive__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close project summary');
    close.addEventListener('click', () => {
      select(null);
      nodes.get(card.project.id)?.focus();
    });
    head.append(titleWrap, close);

    const status = el('p', 'projects-hive__status');
    status.append(
      healthDot(facts.health),
      el('strong', undefined, HIVE_HEALTH_LABEL[facts.health]),
      el('span', undefined, ` · ${LIFECYCLE_LABEL[card.lifecycle]} · ${facts.timeLeft}`)
    );

    const scope = el('div', 'projects-hive__scope');
    scope.append(el('span', 'projects-hive__label', scopeLabel(facts)));
    const bar = el('div', 'projects-hive__bar');
    const fill = el('span', 'projects-hive__bar-fill');
    fill.style.width = facts.scopeTotal ? `${Math.round((facts.scopeDone / facts.scopeTotal) * 100)}%` : '0%';
    bar.append(fill);
    scope.append(bar);

    const next = el('div', 'projects-hive__next');
    next.append(el('span', 'projects-hive__label', 'Next action'));
    next.append(el('p', 'projects-hive__next-text', facts.nextAction ?? 'None set yet'));

    const actions = el('div', 'projects-hive__actions');
    const open = el('button', 'btn btn--primary', 'Open page');
    open.type = 'button';
    open.addEventListener('click', () => {
      location.hash = projectPageHash(card.project.id);
    });
    actions.append(open);
    panel.append(head, status, scope, next, actions);
  }

  /** `animate` slides existing tiles to their new cells on the next frame. */
  function draw(animate: boolean): void {
    if (!input) return;
    const width = measure();
    lastWidth = width;
    layout = layoutHive(input.groups, width);
    const cards = cardsById();
    empty.hidden = layout.tiles.length > 0;
    empty.textContent = input.emptyMessage;
    svgRoot.style.display = layout.tiles.length ? '' : 'none';
    svgRoot.setAttribute('viewBox', `-4 -4 ${width + 8} ${layout.height + 8}`);
    svgRoot.setAttribute('width', String(width + 8));
    svgRoot.setAttribute('height', String(layout.height + 8));

    labelLayer.replaceChildren();
    for (const label of layout.labels) {
      const g = svg('g', { class: 'hive-label', transform: `translate(${label.x} ${label.y})` });
      const swatch = svg('polygon', {
        class: 'hive-label__swatch',
        points: '0,9 4,2 12,2 16,9 12,16 4,16'
      });
      swatch.style.fill = groupFill(label.groupIndex);
      g.append(
        swatch,
        svg('text', { class: 'hive-label__title', x: 24, y: 14 }, label.title),
        svg('text', { class: 'hive-label__count', x: 24 + label.title.length * 8.6 + 8, y: 14 }, String(label.count))
      );
      labelLayer.append(g);
    }

    const live = new Set(layout.tiles.map((tile) => tile.id));
    for (const [id, node] of nodes) {
      if (!live.has(id)) {
        node.remove();
        nodes.delete(id);
      }
    }
    const moves: Array<() => void> = [];
    for (const tile of layout.tiles) {
      const card = cards.get(tile.id);
      if (!card) continue;
      const fresh = !nodes.has(tile.id);
      const g = tileNode(tile.id);
      g.dataset.groupIndex = String(tile.groupIndex);
      g.dataset.group = tile.group;
      drawTile(g, card, hiveTileFacts(card, input.tasks, input.now), layout.size, tile.id === selectedId);
      if (!g.isConnected || g.parentNode !== tileLayer) tileLayer.append(g);
      const place = () => {
        g.style.transform = `translate(${tile.x.toFixed(1)}px, ${tile.y.toFixed(1)}px)`;
      };
      if (animate && !fresh) moves.push(place);
      else place();
    }
    if (moves.length) requestAnimationFrame(() => moves.forEach((move) => move()));
    paintPanel();
  }

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (!input || !root.isConnected) return;
      if (Math.abs(measure() - lastWidth) > 24) draw(false);
    });
    observer.observe(stage);
  }

  return {
    el: root,
    update(next) {
      const animate = input !== null;
      input = next;
      draw(animate);
    }
  };
}
