import {
  buildTree,
  COLOURS,
  colourOf,
  conceptCanvasPositions,
  drawConceptCanvas,
  drawMindCanvas,
  esc,
  LINK_VERBS,
  MAX_EDGES,
  MAX_NODES,
  mindCanvasPositions,
  nextId,
  type Colour,
  type GraphContent,
  type GraphEdge,
  type GraphKind,
  type GraphNode,
  type Scene
} from './graph';
import type { EditorHandle, GraphPatch } from './outline';

type Pt = { x: number; y: number };

const PHONE = '(max-width: 719px)';

const ICON = {
  child: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5v8a3 3 0 0 0 3 3h11M15 12l4 4-4 4"/></svg>',
  sibling: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
  fit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  tidy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/></svg>',
  concept: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="16" height="10" rx="4"/><path d="M12 10v4M10 12h4"/></svg>'
};

const swatches = () =>
  `<span class="graph-swatches">${COLOURS.map(
    (c) => `<button class="graph-swatch" type="button" data-c="${c}" data-colour="${c}" aria-label="${c[0]!.toUpperCase()}${c.slice(1)}" aria-pressed="false"></button>`
  ).join('')}</span>`;

const placed = (nodes: GraphNode[]) => nodes.length > 0 && nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));

export function mountCanvas(
  body: HTMLElement,
  kind: GraphKind,
  content: GraphContent,
  emit: (p: GraphPatch) => void,
  idPrefix: string
): EditorHandle {
  const isMind = kind === 'mind';
  const phoneQuery = typeof matchMedia === 'function' ? matchMedia(PHONE) : null;
  const phone = () => !!phoneQuery?.matches;

  let nodes: GraphNode[] = content.nodes.map((n) => ({ ...n }));
  let edges: GraphEdge[] = (content.edges ?? []).map((e) => ({ ...e }));
  if (!isMind) nodes.forEach((n, i) => (n.color = colourOf(n.color) ?? COLOURS[i % COLOURS.length]));
  /* Mind maps keep their automatic layout until someone drags; from then on every node keeps its own spot. */
  let pinned = placed(nodes);
  let pos = new Map<string, Pt>();
  let view = { x: 0, y: 0, k: 1 };
  let selected: string | null = null;
  let selectedEdge: string | null = null;
  let hover: string | null = null;
  let linkFrom: string | null = null;
  let linkTarget: string | null = null;
  let pointer: Pt | null = null;
  let scene: Scene | null = null;

  const host = document.createElement('div');
  host.className = 'graph-canvas';
  host.dataset.kind = kind;
  host.tabIndex = 0;
  host.setAttribute('aria-label', isMind ? 'Mind map canvas' : 'Concept map canvas');
  host.innerHTML =
    '<svg class="graph-svg graph-canvas__svg" xmlns="http://www.w3.org/2000/svg"><g data-role="world"></g></svg>' +
    `<div class="graph-tools" role="toolbar" aria-label="Map tools">
      <button class="graph-tool" type="button" data-act="zoom-out" aria-label="Zoom out" title="Zoom out">${ICON.minus}</button>
      <span class="graph-zoom" aria-live="polite"></span>
      <button class="graph-tool" type="button" data-act="zoom-in" aria-label="Zoom in" title="Zoom in">${ICON.plus}</button>
      <button class="graph-tool" type="button" data-act="fit" aria-label="Fit to view" title="Fit to view">${ICON.fit}</button>
      <span class="graph-tools__sep" aria-hidden="true"></span>
      ${
        isMind
          ? `<button class="graph-tool" type="button" data-act="tidy" aria-label="Tidy layout" title="Lay the map out again">${ICON.tidy}<span class="graph-tool__label">Tidy</span></button>`
          : `<button class="graph-tool" type="button" data-act="add-concept" aria-label="Add a concept" title="Add a concept">${ICON.concept}<span class="graph-tool__label">Concept</span></button>`
      }
    </div>
    <p class="graph-hint"></p>
    <div class="graph-float" role="toolbar" aria-label="Selected idea" hidden>
      <span class="graph-float__name"><span></span></span>
      <span class="graph-tools__sep" aria-hidden="true"></span>
      ${
        isMind
          ? `<button class="graph-tool" type="button" data-act="add-child" title="Add a sub-idea (Tab)">${ICON.child}<span>Sub-idea</span></button>
             <button class="graph-tool" type="button" data-act="add-sibling" title="Add an idea beside (Enter)">${ICON.sibling}<span>Beside</span></button>`
          : `<button class="graph-tool" type="button" data-act="link" title="Link to another concept">${ICON.link}<span>Link</span></button>`
      }
      <span class="graph-tools__sep" aria-hidden="true"></span>
      ${swatches()}
      <span class="graph-tools__sep" aria-hidden="true"></span>
      <button class="graph-tool is-danger" type="button" data-act="delete" aria-label="Delete" title="Delete (Del)">${ICON.del}</button>
    </div>
    <input class="graph-rename" hidden aria-label="Rename" />`;
  body.replaceChildren(host);

  const svg = host.querySelector('svg')!;
  const world = svg.querySelector('[data-role="world"]')!;
  const zoomLabel = host.querySelector<HTMLElement>('.graph-zoom')!;
  const hint = host.querySelector<HTMLElement>('.graph-hint')!;
  const float = host.querySelector<HTMLElement>('.graph-float')!;
  const rename = host.querySelector<HTMLInputElement>('.graph-rename')!;

  const verbs = document.createElement('div');
  verbs.className = 'graph-verbs';
  verbs.hidden = true;
  verbs.setAttribute('role', 'dialog');
  verbs.setAttribute('aria-label', 'Link label');
  verbs.innerHTML =
    '<p class="graph-verbs__label"></p>' +
    '<div class="graph-verbs__row"><input class="graph-verbs__input" placeholder="How are they linked?" aria-label="How are they linked?" />' +
    `<button class="graph-tool is-danger" type="button" data-act="delete-edge" aria-label="Delete link" title="Delete link">${ICON.del}</button></div>` +
    `<div class="graph-verbs__chips">${LINK_VERBS.map((v) => `<button type="button" data-verb="${esc(v)}">${esc(v)}</button>`).join('')}</div>` +
    `<button class="graph-tool is-danger graph-verbs__delete" type="button" data-act="delete-edge" aria-label="Delete link" title="Delete link">${ICON.del}</button>` +
    '<div class="graph-verbs__actions"><button class="btn btn--primary" type="button" data-act="verb-done">Done</button></div>';
  const verbInput = verbs.querySelector<HTMLInputElement>('.graph-verbs__input')!;
  host.append(verbs);

  const sheet = document.createElement('div');
  sheet.className = 'graph-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', isMind ? 'Edit idea' : 'Edit concept');
  sheet.innerHTML =
    '<div class="graph-sheet__grab" aria-hidden="true"></div>' +
    '<input class="graph-sheet__name" aria-label="Name" />' +
    swatches() +
    '<div class="graph-sheet__actions" data-part="form-actions">' +
    (isMind
      ? '<button class="btn btn--secondary" type="button" data-act="add-child">Sub-idea</button><button class="btn btn--secondary" type="button" data-act="add-sibling">Beside</button>'
      : '<button class="btn btn--secondary" type="button" data-act="link">Link</button><button class="btn btn--secondary" type="button" data-act="add-concept">Concept</button>') +
    '<button class="btn btn--secondary is-danger" type="button" data-act="delete">Delete</button>' +
    '</div>' +
    '<button class="btn btn--primary graph-sheet__done" type="button" data-act="deselect">Done</button>';
  const sheetName = sheet.querySelector<HTMLInputElement>('.graph-sheet__name')!;

  /* Phone panels live on <body> (above the hub tab bar) only while they are open, and leave with the editor. */
  let orphanWatch: MutationObserver | null = null;
  const dock = (panel: HTMLElement, open: boolean) => {
    if (open && panel.parentElement !== document.body) document.body.append(panel);
    if (!open && panel.parentElement === document.body) panel.remove();
    const anyOpen = sheet.isConnected || verbs.parentElement === document.body;
    if (anyOpen && !orphanWatch && typeof MutationObserver !== 'undefined') {
      orphanWatch = new MutationObserver(() => !host.isConnected && destroy());
      orphanWatch.observe(document.body, { childList: true, subtree: true });
    } else if (!anyOpen && orphanWatch) {
      orphanWatch.disconnect();
      orphanWatch = null;
    }
  };

  const current = (): GraphContent => ({ ...content, nodes, edges });
  const positions = (): Map<string, Pt> => (isMind ? mindCanvasPositions(nodes) : conceptCanvasPositions(current()));
  const refreshPositions = () => {
    pos = positions();
  };
  const commit = () => emit({ nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) });
  const pinAll = () => {
    pinned = true;
    nodes.forEach((n) => {
      const p = pos.get(n.id);
      if (p) Object.assign(n, { x: Math.round(p.x), y: Math.round(p.y) });
    });
  };

  function draw(): void {
    const state = { selected, selectedEdge, hover, linkFrom, linkTarget, pointer, interactive: true };
    scene = isMind ? drawMindCanvas(current(), pos, state) : drawConceptCanvas(current(), pos, state);
    world.innerHTML = scene.markup;
    world.setAttribute('transform', `translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`);
    zoomLabel.textContent = `${Math.round(view.k * 100)}%`;
    placeChrome();
  }

  function fit(animate: boolean): void {
    draw();
    const b = scene!.bounds;
    const W = host.clientWidth || 680;
    const H = host.clientHeight || 464;
    const top = 52;
    const bottom = 56;
    const k = Math.max(phone() ? 0.8 : 0.3, Math.min(1.15, W / b.w, (H - top - bottom) / b.h));
    const target = { k, x: W / 2 - (b.x + b.w / 2) * k, y: top + (H - top - bottom) / 2 - (b.y + b.h / 2) * k };
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce || typeof requestAnimationFrame !== 'function') {
      view = target;
      draw();
      return;
    }
    const from = { ...view };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, now - t0) / 260);
      const e = 1 - Math.pow(1 - t, 3);
      view = { k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
      draw();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const r = host.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
  };
  const toScreen = (x: number, y: number): Pt => ({ x: x * view.k + view.x, y: y * view.k + view.y });

  function zoomAt(f: number, cx = host.clientWidth / 2, cy = host.clientHeight / 2): void {
    const k = Math.min(2, Math.max(0.3, view.k * f));
    view = { k, x: cx - ((cx - view.x) * k) / view.k, y: cy - ((cy - view.y) * k) / view.k };
    draw();
  }

  const colourFor = (id: string): Colour | 'navy' | undefined => scene?.nodes.get(id)?.branch;

  function placeChrome(): void {
    hint.textContent = phone()
      ? 'Tap an idea to edit · drag to pan'
      : isMind
        ? 'Double-click to rename · drag to move · Tab adds a sub-idea'
        : 'Drag from ● to link · double-click to rename';
    const n = selected ? scene?.nodes.get(selected) : undefined;
    const usePhone = phone();
    float.hidden = !n || usePhone || !!linkFrom;
    dock(sheet, !!n && usePhone && !linkFrom && verbs.hidden);
    host.classList.toggle('has-context', !float.hidden || !verbs.hidden);
    if (!n) return;
    const c = colourFor(n.id);
    for (const root of [float, sheet]) {
      root.querySelectorAll<HTMLButtonElement>('[data-colour]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.colour === c));
        b.disabled = isMind && n.depth === 0;
      });
      const isRoot = isMind && n.depth === 0;
      root.querySelector<HTMLButtonElement>('[data-act="add-sibling"]')?.toggleAttribute('disabled', isRoot);
      root.querySelector<HTMLButtonElement>('[data-act="delete"]')?.toggleAttribute('disabled', isRoot || (!isMind && nodes.length <= 1));
      root.querySelector<HTMLButtonElement>('[data-act="add-child"]')?.toggleAttribute('disabled', nodes.length >= MAX_NODES);
      root.querySelector<HTMLButtonElement>('[data-act="add-concept"]')?.toggleAttribute('disabled', nodes.length >= MAX_NODES);
      root.querySelector<HTMLButtonElement>('[data-act="link"]')?.toggleAttribute('disabled', nodes.length < 2 || edges.length >= MAX_EDGES);
    }
    const name = float.querySelector<HTMLElement>('.graph-float__name')!;
    name.dataset.c = c ?? '';
    name.firstElementChild!.textContent = n.label || 'Untitled';
    if (usePhone && document.activeElement !== sheetName) sheetName.value = n.label;
  }

  function select(id: string | null): void {
    selected = id;
    selectedEdge = null;
    if (!verbs.hidden) closeVerbs(false);
    draw();
  }

  function addNode(how: 'child' | 'sibling' | 'concept'): void {
    if (nodes.length >= MAX_NODES) return;
    const id = nextId(`${idPrefix}_n`, nodes.map((n) => n.id));
    if (!isMind) {
      const used = new Set(nodes.map((n) => n.color));
      const node: GraphNode = { id, label: 'New concept', color: COLOURS.find((c) => !used.has(c)) ?? COLOURS[nodes.length % COLOURS.length] };
      if (pinned) {
        const c = { x: (host.clientWidth / 2 - view.x) / view.k, y: (host.clientHeight / 2 - view.y) / view.k };
        Object.assign(node, { x: Math.round(c.x + (nodes.length % 3) * 24), y: Math.round(c.y + 90) });
      }
      nodes.push(node);
    } else {
      const sel = nodes.find((n) => n.id === selected) ?? nodes.find((n) => n.parent_id == null);
      if (!sel || !scene) return;
      const parentId = how === 'child' || sel.parent_id == null ? sel.id : sel.parent_id;
      const node: GraphNode = { id, label: 'New idea', parent_id: parentId };
      if (pinned) {
        const parent = scene.nodes.get(parentId)!;
        const root = scene.root!;
        const siblings = nodes.filter((n) => n.parent_id === parentId).length;
        const base = parent.depth === 0 ? -Math.PI / 2 + siblings * 1.1 : Math.atan2(parent.y - root.y, parent.x - root.x);
        const spread = parent.depth === 0 ? 0 : (siblings % 2 ? 1 : -1) * Math.ceil(siblings / 2) * 0.32;
        const r = parent.depth === 0 ? 250 : 190;
        Object.assign(node, { x: Math.round(parent.x + Math.cos(base + spread) * r), y: Math.round(parent.y + Math.sin(base + spread) * r * 0.7) });
      }
      if (how === 'sibling' && sel.parent_id != null) nodes.splice(nodes.indexOf(sel) + 1, 0, node);
      else nodes.push(node);
    }
    refreshPositions();
    select(id);
    commit();
    if (!phone()) startRename(id);
    else
      requestAnimationFrame(() => {
        sheetName.focus();
        sheetName.select();
      });
  }

  function removeSelected(): void {
    const n = nodes.find((x) => x.id === selected);
    if (!n) return;
    if (isMind) {
      if (n.parent_id == null) return;
      const gone = new Set([n.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const x of nodes) if (!gone.has(x.id) && x.parent_id != null && gone.has(x.parent_id)) {
          gone.add(x.id);
          grew = true;
        }
      }
      nodes = nodes.filter((x) => !gone.has(x.id));
    } else {
      if (nodes.length <= 1) return;
      nodes = nodes.filter((x) => x !== n);
      edges = edges.filter((e) => e.from !== n.id && e.to !== n.id);
    }
    refreshPositions();
    select(null);
    commit();
    host.focus();
  }

  function setColour(c: Colour): void {
    const n = nodes.find((x) => x.id === selected);
    if (!n) return;
    if (!isMind) n.color = c;
    else {
      const root = buildTree(nodes);
      let top: GraphNode | undefined = n;
      while (top && top.parent_id != null && top.parent_id !== root?.id) top = nodes.find((x) => x.id === top!.parent_id);
      if (!top || top.parent_id == null) return;
      top.color = c;
    }
    draw();
    commit();
  }

  function startRename(id: string): void {
    const n = scene?.nodes.get(id);
    if (!n) return;
    const tl = toScreen(n.x - n.w / 2, n.y - n.h / 2);
    const w = Math.max(160, n.w * view.k + 24);
    Object.assign(rename.style, {
      left: `${tl.x - 12}px`,
      top: `${tl.y - 4}px`,
      width: `${w}px`,
      height: `${n.h * view.k + 8}px`,
      fontSize: `${Math.max(14, n.box.size * view.k)}px`
    });
    rename.value = n.label;
    rename.placeholder = isMind ? 'Idea' : 'Concept';
    rename.dataset.id = id;
    delete rename.dataset.edge;
    rename.hidden = false;
    placeChrome();
    rename.focus();
    rename.select();
  }

  function endRename(): void {
    if (rename.hidden) return;
    rename.hidden = true;
    if (rename.dataset.edge) {
      delete rename.dataset.edge;
      closeVerbs();
      return;
    }
    const n = nodes.find((x) => x.id === rename.dataset.id);
    if (n && rename.value.trim()) n.label = rename.value.trim();
    draw();
    commit();
  }

  function openVerbs(edgeId: string): void {
    const edge = edges.find((x) => x.id === edgeId);
    const chip = scene?.chips.find((c) => c.id === edgeId);
    if (!edge || !chip) return;
    selectedEdge = edgeId;
    selected = null;
    const name = (id: string) => esc(nodes.find((n) => n.id === id)?.label || 'Untitled');
    verbs.querySelector('.graph-verbs__label')!.innerHTML = `<strong>${name(edge.from)}</strong> → <strong>${name(edge.to)}</strong>`;
    verbInput.value = edge.label ?? '';
    verbs.hidden = false;
    if (phone()) dock(verbs, true);
    else if (verbs.parentElement !== host) host.append(verbs);
    draw();
    if (phone()) {
      verbInput.focus();
      return;
    }
    const p = toScreen(chip.x, chip.y);
    const w = Math.max(150, chip.w * view.k + 40);
    Object.assign(rename.style, { left: `${p.x - w / 2}px`, top: `${p.y - 17}px`, width: `${w}px`, height: '34px', fontSize: '14px' });
    rename.value = edge.label ?? '';
    rename.placeholder = 'How are they linked?';
    rename.dataset.edge = edgeId;
    rename.hidden = false;
    rename.focus();
    rename.select();
  }

  function closeVerbs(redraw = true): void {
    if (!rename.hidden && rename.dataset.edge) {
      rename.hidden = true;
      delete rename.dataset.edge;
    }
    verbs.hidden = true;
    if (verbs.parentElement === document.body) {
      dock(verbs, false);
      host.append(verbs);
    }
    selectedEdge = null;
    if (redraw) draw();
  }

  function setEdgeLabel(label: string): void {
    const edge = edges.find((x) => x.id === selectedEdge);
    if (!edge) return;
    edge.label = label;
    draw();
    commit();
  }

  function startLink(from: string): void {
    linkFrom = from;
    pointer = null;
    host.classList.add('is-linking');
    draw();
  }

  function finishLink(targetId: string | null | undefined): void {
    const from = linkFrom;
    linkFrom = null;
    linkTarget = null;
    pointer = null;
    host.classList.remove('is-linking');
    if (from && targetId && targetId !== from && edges.length < MAX_EDGES) {
      const id = nextId(`${idPrefix}_e`, edges.map((e) => e.id));
      edges.push({ id, from, to: targetId, label: '' });
      draw();
      commit();
      openVerbs(id);
    } else draw();
  }

  function onChromeClick(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act], [data-colour], [data-verb]');
    if (!b || b.disabled) return;
    if (b.dataset.colour) return setColour(b.dataset.colour as Colour);
    if (b.dataset.verb) {
      verbInput.value = b.dataset.verb;
      rename.value = b.dataset.verb;
      return setEdgeLabel(b.dataset.verb);
    }
    switch (b.dataset.act) {
      case 'zoom-in':
        return zoomAt(1.2);
      case 'zoom-out':
        return zoomAt(1 / 1.2);
      case 'fit':
        return fit(true);
      case 'tidy':
        pinned = false;
        nodes.forEach((n) => {
          delete n.x;
          delete n.y;
        });
        refreshPositions();
        fit(true);
        return commit();
      case 'add-concept':
        return addNode('concept');
      case 'add-child':
        return addNode('child');
      case 'add-sibling':
        return addNode('sibling');
      case 'delete':
        return removeSelected();
      case 'deselect':
        select(null);
        return host.focus();
      case 'link':
        if (selected) startLink(selected);
        return;
      case 'verb-done':
        closeVerbs();
        return host.focus();
      case 'delete-edge':
        edges = edges.filter((x) => x.id !== selectedEdge);
        closeVerbs();
        commit();
        return host.focus();
    }
  }
  host.addEventListener('click', onChromeClick);
  sheet.addEventListener('click', onChromeClick);
  verbs.addEventListener('click', (e) => {
    if (verbs.parentElement === document.body) onChromeClick(e);
  });

  sheetName.addEventListener('input', () => {
    const n = nodes.find((x) => x.id === selected);
    if (!n) return;
    n.label = sheetName.value;
    draw();
    commit();
  });
  sheetName.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.isComposing)) {
      e.preventDefault();
      e.stopPropagation();
      sheetName.blur();
      if (e.key === 'Escape') select(null);
    }
  });

  /* ── Pointer: pan, pinch, drag nodes (mind: with their sub-ideas), link from a port ── */
  type Drag =
    | { type: 'none' }
    | { type: 'link' }
    | { type: 'pan'; sx: number; sy: number; ox: number; oy: number; moved: boolean }
    | { type: 'node'; id: string; moving: string[]; start: Pt; orig: Pt[]; moved: boolean }
    | { type: 'pinch'; dist: number; k: number };
  let drag: Drag | null = null;
  const touches = new Map<number, Pt>();
  let lastTap = { id: '', at: 0 };

  const pinchDistance = () => {
    const [a, b] = [...touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  svg.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      if (drag?.type === 'link') finishLink(null);
      drag = { type: 'pinch', dist: pinchDistance(), k: view.k };
      return;
    }
    if (!rename.hidden) endRename();
    const target = e.target as Element;
    const port = target.closest<SVGGElement>('[data-port]');
    const handle = target.closest('[data-act="add-child"]');
    const chip = target.closest<SVGGElement>('[data-edge]');
    const node = target.closest<SVGGElement>('[data-id]');
    svg.setPointerCapture?.(e.pointerId);
    if (handle) {
      drag = { type: 'none' };
      addNode('child');
    } else if (port) {
      startLink(port.dataset.port!);
      pointer = toWorld(e);
      drag = { type: 'link' };
      draw();
    } else if (linkFrom) {
      drag = { type: 'none' };
      finishLink(node?.dataset.id);
    } else if (chip) {
      drag = { type: 'none' };
      openVerbs(chip.dataset.edge!);
    } else if (node) {
      const id = node.dataset.id!;
      const now = Date.now();
      if (lastTap.id === id && now - lastTap.at < 400 && !phone()) {
        lastTap = { id: '', at: 0 };
        drag = { type: 'none' };
        startRename(id);
        return;
      }
      lastTap = { id, at: now };
      const moving = [id];
      if (isMind) for (let i = 0; i < moving.length; i++) nodes.forEach((n) => n.parent_id === moving[i] && moving.push(n.id));
      drag = { type: 'node', id, moving, start: toWorld(e), orig: moving.map((m) => ({ ...(pos.get(m) ?? { x: 0, y: 0 }) })), moved: false };
      if (selected !== id || !verbs.hidden) select(id);
    } else {
      drag = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
      host.classList.add('is-panning');
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) {
      if (!isMind && e.pointerType === 'mouse') {
        const id = (e.target as Element).closest<SVGGElement>('[data-id]')?.dataset.id ?? null;
        if (id !== hover) {
          hover = id;
          draw();
        }
      }
      return;
    }
    if (drag.type === 'pinch') {
      const d = pinchDistance();
      if (!d || !drag.dist) return;
      const [a, b] = [...touches.values()];
      const r = host.getBoundingClientRect();
      zoomAt((drag.k * (d / drag.dist)) / view.k, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
    } else if (drag.type === 'pan') {
      view.x = drag.ox + e.clientX - drag.sx;
      view.y = drag.oy + e.clientY - drag.sy;
      drag.moved ||= Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3;
      draw();
    } else if (drag.type === 'node') {
      const p = toWorld(e);
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) * view.k <= 3) return;
      drag.moved = true;
      const { moving, orig } = drag;
      moving.forEach((m, i) => pos.set(m, { x: orig[i]!.x + dx, y: orig[i]!.y + dy }));
      draw();
    } else if (drag.type === 'link') {
      pointer = toWorld(e);
      const under = document.elementFromPoint?.(e.clientX, e.clientY)?.closest<SVGGElement>('[data-id]');
      linkTarget = under && under.dataset.id !== linkFrom ? under.dataset.id! : null;
      draw();
    }
  });

  const up = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (drag?.type === 'pinch') {
      if (touches.size < 2) drag = null;
      return;
    }
    if (drag?.type === 'link') finishLink(linkTarget);
    if (drag?.type === 'pan' && !drag.moved) select(null);
    if (drag?.type === 'node' && drag.moved) {
      lastTap = { id: '', at: 0 };
      pinAll();
      commit();
    }
    host.classList.remove('is-panning');
    drag = null;
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointerleave', () => {
    if (!drag && hover) {
      hover = null;
      draw();
    }
  });

  host.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = host.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false }
  );

  rename.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !rename.dataset.edge) rename.value = '';
      endRename();
      host.focus();
    }
  });
  rename.addEventListener('blur', (e) => {
    if (rename.dataset.edge && verbs.contains(e.relatedTarget as Node)) return;
    endRename();
  });
  rename.addEventListener('input', () => {
    if (rename.dataset.edge) setEdgeLabel(rename.value);
  });
  verbs.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('button')) e.preventDefault();
  });
  verbInput.addEventListener('input', () => setEdgeLabel(verbInput.value));
  verbInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeVerbs();
      host.focus();
    }
  });

  host.addEventListener('keydown', (e) => {
    if (e.target !== host) return;
    if (e.key === 'Escape' && (linkFrom || selected || selectedEdge)) {
      e.stopPropagation();
      if (linkFrom) finishLink(null);
      else if (selectedEdge) closeVerbs();
      else select(null);
      return;
    }
    if (!selected) return;
    if (e.key === 'Tab' && isMind && !e.shiftKey) {
      e.preventDefault();
      addNode('child');
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      if (isMind && e.key === 'Enter') addNode('sibling');
      else startRename(selected);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    }
  });

  const onMedia = () => {
    if (!verbs.hidden) closeVerbs(false);
    fit(false);
  };
  phoneQuery?.addEventListener?.('change', onMedia);

  let lastWidth = -1;
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!host.isConnected) return destroy();
          if (host.clientWidth === lastWidth) return;
          lastWidth = host.clientWidth;
          fit(false);
        })
      : null;
  ro?.observe(host);
  void document.fonts?.ready.then(() => host.isConnected && draw());

  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    ro?.disconnect();
    orphanWatch?.disconnect();
    orphanWatch = null;
    phoneQuery?.removeEventListener?.('change', onMedia);
    sheet.remove();
    verbs.remove();
    host.remove();
  }

  refreshPositions();
  fit(false);
  return { destroy };
}
