import {
  buildTree,
  colourOf,
  COLOURS,
  esc,
  flatten,
  LINK_VERBS,
  MAX_EDGES,
  MAX_NODES,
  nextId,
  type Colour,
  type GraphContent,
  type GraphEdge,
  type GraphKind,
  type GraphNode
} from './graph';
import { expandButton, openFullView, paintStage, watchStage } from './view';

export type GraphPatch = { nodes: GraphNode[]; edges: GraphEdge[] };
export type EditorHandle = { destroy: () => void };

const ICON = {
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>'
};

const cssId = (s: string) => (typeof globalThis.CSS?.escape === 'function' ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function miniButton(act: string, label: string, icon: string, title = label): HTMLButtonElement {
  const b = el('button', 'graph-mini', icon);
  b.type = 'button';
  b.dataset.act = act;
  b.setAttribute('aria-label', label);
  b.title = title;
  return b;
}

/** Phone-only Write / Map switch; on desktop the map and the outline sit together. */
function viewSwitch(root: HTMLElement, onShow: () => void): HTMLElement {
  const group = el('div', 'hub-pills graph-outline__view');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Show');
  group.innerHTML =
    '<button class="hub-pills__btn" type="button" data-view="write" aria-pressed="true">Write</button>' +
    '<button class="hub-pills__btn" type="button" data-view="map" aria-pressed="false">Map</button>';
  group.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-view]');
    if (btn) setView(root, btn.dataset.view as 'write' | 'map', onShow);
  });
  return group;
}

function setView(root: HTMLElement, view: 'write' | 'map', onShow: () => void): void {
  root.dataset.view = view;
  root.querySelectorAll<HTMLButtonElement>('.graph-outline__view [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  onShow();
}

/* ── Mind map: an indented outline, parent derived from depth ── */

type Row = { id: string; label: string; depth: number; color?: string; x?: number; y?: number };

function rowsFrom(nodes: GraphNode[]): Row[] {
  const root = buildTree(nodes);
  if (!root) return [{ id: 'n1', label: '', depth: 0 }];
  return flatten(root).map((n) => ({ id: n.id, label: n.label, depth: n.depth, color: n.color, x: n.x, y: n.y }));
}

function nodesFrom(rows: Row[]): GraphNode[] {
  const stack: string[] = [];
  return rows.map((r) => {
    stack[r.depth] = r.id;
    const node: GraphNode = { id: r.id, label: r.label, parent_id: r.depth === 0 ? null : stack[r.depth - 1]! };
    if (r.color) node.color = r.color;
    if (Number.isFinite(r.x) && Number.isFinite(r.y)) Object.assign(node, { x: r.x, y: r.y });
    return node;
  });
}

const subtreeEnd = (rows: Row[], i: number) => {
  let j = i + 1;
  while (j < rows.length && rows[j]!.depth > rows[i]!.depth) j++;
  return j;
};

/** Branches keep their colour when another branch is added or removed. */
function settleColours(rows: Row[]): void {
  const used = new Map<Colour, number>(COLOURS.map((c) => [c, 0]));
  for (const r of rows) if (r.depth === 1 && colourOf(r.color)) used.set(colourOf(r.color)!, used.get(colourOf(r.color)!)! + 1);
  for (const r of rows) {
    if (r.depth !== 1 || colourOf(r.color)) continue;
    const pick = [...used.entries()].sort((a, b) => a[1] - b[1])[0]![0];
    r.color = pick;
    used.set(pick, used.get(pick)! + 1);
  }
}

function branchOf(rows: Row[], i: number): Colour | 'navy' {
  if (rows[i]!.depth === 0) return 'navy';
  let k = i;
  while (k > 0 && rows[k]!.depth > 1) k--;
  return colourOf(rows[k]!.color) ?? 'blue';
}

function mountMindOutline(body: HTMLElement, content: GraphContent, emit: (p: GraphPatch) => void, idPrefix: string): EditorHandle {
  let rows = rowsFrom(content.nodes);
  let selected: string | null = null;
  const edges = content.edges ?? [];

  const root = el('div', 'graph-outline');
  root.dataset.kind = 'mind';
  root.dataset.view = 'write';
  const stage = el('div', 'graph-stage');
  stage.dataset.part = 'map';
  const build = el('div', 'graph-outline__build');
  build.dataset.part = 'build';
  const label = el('p', 'graph-block__label');
  label.textContent = 'Outline';
  const list = el('div', 'graph-outline__rows');
  list.setAttribute('role', 'tree');
  list.setAttribute('aria-label', 'Mind map outline');
  const foot = el('div', 'graph-outline__foot');
  const add = el('button', 'btn btn--secondary');
  add.type = 'button';
  add.textContent = '+ Add idea';
  const keys = el(
    'p',
    'graph-outline__keys',
    '<kbd>Enter</kbd> new idea · <kbd>Tab</kbd> sub-idea · <kbd>Shift</kbd>+<kbd>Tab</kbd> move out · <kbd>⌫</kbd> on an empty line deletes'
  );
  foot.append(add, keys);
  build.append(label, list, foot);
  const current = (): GraphContent => ({ ...content, nodes: nodesFrom(rows), edges });
  root.append(viewSwitch(root, () => paint()), stage, build);
  stage.append(expandButton(() => openFullView('mind', current())));
  body.replaceChildren(root);

  const paint = () => paintStage(stage, 'mind', current(), { selected, interactive: true });
  const commit = () => {
    settleColours(rows);
    emit({ nodes: nodesFrom(rows), edges });
  };

  function render(focusIndex?: number, caret?: number): void {
    settleColours(rows);
    list.replaceChildren(
      ...rows.map((r, i) => {
        const row = el('div', 'graph-outline__row');
        row.dataset.d = String(r.depth);
        row.dataset.c = branchOf(rows, i);
        row.style.setProperty('--d', String(r.depth));
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-level', String(r.depth + 1));
        const input = el('input', 'graph-outline__input');
        input.value = r.label;
        input.placeholder = r.depth ? 'New idea' : 'Central idea';
        input.setAttribute('aria-label', r.depth ? 'Idea' : 'Central idea');
        row.append(el('span', 'graph-outline__bullet'), input);
        if (r.depth) {
          const tools = el('span', 'graph-outline__tools');
          tools.append(
            miniButton('out', 'Move out', ICON.out, 'Move out (Shift+Tab)'),
            miniButton('in', 'Make sub-idea', ICON.in, 'Sub-idea (Tab)'),
            miniButton('del', 'Delete idea', ICON.del, 'Delete')
          );
          tools.addEventListener('click', (e) => {
            const act = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]')?.dataset.act;
            if (act === 'in') indent(i, 1);
            if (act === 'out') indent(i, -1);
            if (act === 'del') remove(i);
          });
          row.append(tools);
        }
        input.addEventListener('input', () => {
          rows[i]!.label = input.value;
          paint();
          commit();
        });
        input.addEventListener('focus', () => {
          selected = r.id;
          paint();
        });
        input.addEventListener('keydown', (e) => onKey(e, i, input));
        return row;
      })
    );
    add.disabled = rows.length >= MAX_NODES;
    paint();
    if (focusIndex != null) {
      const input = list.children[focusIndex]?.querySelector('input');
      input?.focus();
      if (input && caret != null) input.setSelectionRange(caret, caret);
    }
  }

  function insertAfter(i: number): void {
    if (rows.length >= MAX_NODES) return;
    const next = rows[i + 1];
    const depth = i === 0 ? 1 : next && next.depth > rows[i]!.depth ? rows[i]!.depth + 1 : rows[i]!.depth;
    rows.splice(i + 1, 0, { id: nextId(`${idPrefix}_n`, rows.map((r) => r.id)), label: '', depth });
    render(i + 1);
    commit();
  }

  function canIndent(i: number, by: number): boolean {
    if (i === 0) return false;
    return by > 0 ? rows[i - 1]!.depth >= rows[i]!.depth : rows[i]!.depth > 1;
  }

  function indent(i: number, by: number): void {
    if (!canIndent(i, by)) return;
    const end = subtreeEnd(rows, i);
    for (let j = i; j < end; j++) rows[j]!.depth += by;
    render(i);
    commit();
  }

  function remove(i: number): void {
    if (i === 0) return;
    const end = subtreeEnd(rows, i);
    for (let j = i + 1; j < end; j++) rows[j]!.depth -= 1;
    rows.splice(i, 1);
    render(Math.max(0, i - 1), rows[Math.max(0, i - 1)]?.label.length);
    commit();
  }

  function onKey(e: KeyboardEvent, i: number, input: HTMLInputElement): void {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      insertAfter(i);
    } else if (e.key === 'Tab' && canIndent(i, e.shiftKey ? -1 : 1)) {
      e.preventDefault();
      indent(i, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Backspace' && !input.value && i > 0) {
      e.preventDefault();
      remove(i);
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      render(i - 1);
    } else if (e.key === 'ArrowDown' && i < rows.length - 1) {
      e.preventDefault();
      render(i + 1);
    }
  }

  stage.addEventListener('click', (e) => {
    const id = (e.target as Element).closest<SVGGElement>('[data-id]')?.dataset.id;
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return;
    if (root.dataset.view === 'map') setView(root, 'write', paint);
    render(i);
  });
  add.addEventListener('click', () => insertAfter(rows.length - 1));
  watchStage(stage, paint);
  render();
  return { destroy: () => root.remove() };
}

/* ── Concept map: concept chips and "A — verb → B" sentences ── */

function mountConceptOutline(body: HTMLElement, content: GraphContent, emit: (p: GraphPatch) => void, idPrefix: string): EditorHandle {
  const nodes: GraphNode[] = content.nodes.map((n) => ({ ...n }));
  const edges: GraphEdge[] = (content.edges ?? []).map((e) => ({ ...e }));
  nodes.forEach((n, i) => (n.color = colourOf(n.color) ?? COLOURS[i % COLOURS.length]));
  let menu: HTMLElement | null = null;

  const root = el('div', 'graph-outline');
  root.dataset.kind = 'concept';
  root.dataset.view = 'write';
  const stage = el('div', 'graph-stage');
  stage.dataset.part = 'map';
  const build = el('div', 'graph-outline__build');
  build.dataset.part = 'build';
  const conceptsLabel = el('p', 'graph-block__label');
  conceptsLabel.textContent = 'Concepts';
  const conceptsEl = el('div', 'graph-concepts');
  const linksLabel = el('p', 'graph-block__label');
  linksLabel.textContent = 'Links';
  const linksEl = el('div', 'graph-links');
  const foot = el('div', 'graph-outline__foot');
  const addLink = el('button', 'btn btn--secondary');
  addLink.type = 'button';
  addLink.textContent = '+ Add link';
  const keys = el('p', 'graph-outline__keys');
  keys.textContent = 'Tap the dot on a concept to change its colour.';
  foot.append(addLink, keys);
  build.append(conceptsLabel, conceptsEl, linksLabel, linksEl, foot);
  const current = (): GraphContent => ({ ...content, nodes, edges });
  root.append(viewSwitch(root, () => paint()), stage, build);
  stage.append(expandButton(() => openFullView('concept', current())));
  body.replaceChildren(root);

  const paint = () => paintStage(stage, 'concept', current(), { interactive: true });
  const commit = () => emit({ nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) });
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label.trim() || 'Pick a concept';
  const colour = (id: string) => colourOf(nodes.find((n) => n.id === id)?.color) ?? 'blue';
  const changed = () => {
    paint();
    commit();
  };

  function renderConcepts(focusId?: string): void {
    const chips = nodes.map((n) => {
      const chip = el('span', 'graph-concept');
      chip.dataset.c = colour(n.id);
      chip.dataset.id = n.id;
      const swatch = el('button', 'graph-concept__swatch');
      swatch.type = 'button';
      swatch.setAttribute('aria-label', `Change colour of ${n.label || 'concept'}`);
      swatch.title = 'Change colour';
      const input = el('input', 'graph-concept__input');
      input.value = n.label;
      input.placeholder = 'Concept';
      input.setAttribute('aria-label', 'Concept');
      input.size = Math.max(6, n.label.length + 1);
      const del = miniButton('del', `Delete ${n.label || 'concept'}`, ICON.del, 'Delete');
      del.disabled = nodes.length <= 1;
      chip.append(swatch, input, del);
      swatch.addEventListener('click', () => {
        n.color = COLOURS[(COLOURS.indexOf(colour(n.id)) + 1) % COLOURS.length];
        chip.dataset.c = n.color;
        renderLinks();
        changed();
      });
      input.addEventListener('input', () => {
        n.label = input.value;
        input.size = Math.max(6, n.label.length + 1);
        renderLinks();
        changed();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          addConcept();
        }
      });
      del.addEventListener('click', () => {
        if (nodes.length <= 1) return;
        nodes.splice(nodes.indexOf(n), 1);
        for (let i = edges.length - 1; i >= 0; i--) if (edges[i]!.from === n.id || edges[i]!.to === n.id) edges.splice(i, 1);
        renderConcepts();
        renderLinks();
        changed();
      });
      if (n.id === focusId) requestAnimationFrame(() => input.focus());
      return chip;
    });
    const add = el('button', 'btn btn--ghost graph-concepts__add');
    add.type = 'button';
    add.textContent = '+ Concept';
    add.disabled = nodes.length >= MAX_NODES;
    add.addEventListener('click', addConcept);
    conceptsEl.replaceChildren(...chips, add);
    addLink.disabled = edges.length >= MAX_EDGES || nodes.length < 2;
  }

  function addConcept(): void {
    if (nodes.length >= MAX_NODES) return;
    const id = nextId(`${idPrefix}_n`, nodes.map((n) => n.id));
    const used = new Set(nodes.map((n) => n.color));
    nodes.push({ id, label: '', color: COLOURS.find((c) => !used.has(c)) ?? COLOURS[nodes.length % COLOURS.length] });
    renderConcepts(id);
    changed();
  }

  function closeMenu(): void {
    menu?.remove();
    menu = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onMenuKey, true);
  }
  const onOutside = (e: Event) => {
    if (menu && !menu.contains(e.target as Node)) closeMenu();
  };
  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenu();
    }
  };

  function openMenu(btn: HTMLButtonElement, edge: GraphEdge, end: 'from' | 'to'): void {
    closeMenu();
    menu = el('div', 'graph-menu');
    menu.setAttribute('role', 'menu');
    for (const n of nodes) {
      const item = el('button', 'graph-menu__item');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(edge[end] === n.id));
      item.dataset.c = colour(n.id);
      item.textContent = n.label.trim() || 'Untitled';
      item.addEventListener('click', () => {
        edge[end] = n.id;
        closeMenu();
        renderLinks();
        changed();
        linksEl.querySelector<HTMLButtonElement>(`[data-edge="${cssId(edge.id)}"] [data-end="${end}"]`)?.focus();
      });
      menu.append(item);
    }
    document.body.append(menu);
    const r = btn.getBoundingClientRect();
    const below = innerHeight - r.bottom > menu.offsetHeight + 12;
    menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${below ? r.bottom + 4 : Math.max(8, r.top - menu.offsetHeight - 4)}px`;
    (menu.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu.querySelector<HTMLButtonElement>('button'))?.focus();
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onMenuKey, true);
  }

  function renderLinks(focusId?: string): void {
    linksEl.replaceChildren(
      ...edges.map((edge) => {
        const row = el('div', 'graph-link');
        row.dataset.edge = edge.id;
        const pick = (end: 'from' | 'to') =>
          `<button class="graph-link__pick" type="button" data-end="${end}" data-c="${colour(edge[end])}" aria-haspopup="menu" aria-label="${end === 'from' ? 'From' : 'To'}: ${esc(labelOf(edge[end]))}"><span>${esc(labelOf(edge[end]))}</span></button>`;
        row.innerHTML =
          pick('from') +
          `<input class="graph-link__verb${edge.label?.trim() ? '' : ' is-empty'}" value="${esc(edge.label ?? '')}" placeholder="how are they linked?" aria-label="Relationship" />` +
          '<span class="graph-link__arrow" aria-hidden="true">→</span>' +
          pick('to') +
          `<div class="graph-link__suggest">${LINK_VERBS.map((v) => `<button type="button">${esc(v)}</button>`).join('')}</div>`;
        const swap = miniButton('swap', 'Swap direction', ICON.swap);
        swap.classList.add('graph-link__swap');
        const del = miniButton('del', 'Delete link', ICON.del, 'Delete');
        del.classList.add('graph-link__remove');
        row.querySelector('.graph-link__suggest')!.before(swap, del);
        const verb = row.querySelector<HTMLInputElement>('.graph-link__verb')!;
        row.querySelectorAll<HTMLButtonElement>('.graph-link__pick').forEach((b) =>
          b.addEventListener('click', () => (menu ? closeMenu() : openMenu(b, edge, b.dataset.end as 'from' | 'to')))
        );
        verb.addEventListener('input', () => {
          edge.label = verb.value;
          verb.classList.toggle('is-empty', !verb.value.trim());
          changed();
        });
        swap.addEventListener('click', () => {
          [edge.from, edge.to] = [edge.to, edge.from];
          renderLinks();
          changed();
        });
        del.addEventListener('click', () => {
          edges.splice(edges.indexOf(edge), 1);
          renderLinks();
          renderConcepts();
          changed();
        });
        row.querySelectorAll<HTMLButtonElement>('.graph-link__suggest button').forEach((b) =>
          b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            verb.value = b.textContent ?? '';
            verb.dispatchEvent(new Event('input'));
          })
        );
        if (edge.id === focusId) requestAnimationFrame(() => verb.focus());
        return row;
      })
    );
    addLink.disabled = edges.length >= MAX_EDGES || nodes.length < 2;
  }

  addLink.addEventListener('click', () => {
    if (edges.length >= MAX_EDGES || nodes.length < 2) return;
    const linked = new Set(edges.map((e) => `${e.from}>${e.to}`));
    let from = nodes[0]!.id;
    let to = nodes[1]!.id;
    outer: for (const a of nodes) for (const b of nodes) if (a !== b && !linked.has(`${a.id}>${b.id}`)) {
      from = a.id;
      to = b.id;
      break outer;
    }
    const edge = { id: nextId(`${idPrefix}_e`, edges.map((e) => e.id)), from, to, label: '' };
    edges.push(edge);
    renderLinks(edge.id);
    changed();
  });

  stage.addEventListener('click', (e) => {
    const id = (e.target as Element).closest<SVGGElement>('[data-id]')?.dataset.id;
    if (!id) return;
    if (root.dataset.view === 'map') setView(root, 'write', paint);
    conceptsEl.querySelector<HTMLInputElement>(`[data-id="${cssId(id)}"] input`)?.focus();
  });

  watchStage(stage, paint);
  renderConcepts();
  renderLinks();
  paint();
  return {
    destroy: () => {
      closeMenu();
      root.remove();
    }
  };
}

export function mountOutline(
  body: HTMLElement,
  kind: GraphKind,
  content: GraphContent,
  emit: (p: GraphPatch) => void,
  idPrefix: string
): EditorHandle {
  return kind === 'mind' ? mountMindOutline(body, content, emit, idPrefix) : mountConceptOutline(body, content, emit, idPrefix);
}

