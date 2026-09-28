/**
 * Phase 3 — ELK layered flowchart for organisation structure.
 * Dynamically imports elkjs (not in the main bundle entry).
 */

import type { OrgStructurePayload } from '@/api/org-structure';

export interface FlowLayoutBox {
  id: string;
  kind: 'unit' | 'position' | 'person' | 'outside';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sublabel: string;
  dashed: boolean;
  you: boolean;
  alsoIn: string[];
  href: string | null;
  warmthBand: string | null;
  unitRef: string | null;
  /** Warmth bands for member dots when a unit is collapsed. */
  warmthDots?: string[];
  childCount?: number;
}

export interface FlowLayoutEdge {
  id: string;
  kind: string;
  points: Array<{ x: number; y: number }>;
  bold: boolean;
  cycle: boolean;
}

export interface FlowLayout {
  width: number;
  height: number;
  boxes: FlowLayoutBox[];
  edges: FlowLayoutEdge[];
  elapsedMs: number;
}

export interface FlowchartRenderOptions {
  collapsedUnits?: Set<string>;
  onToggleUnit?: (unitRef: string) => void;
  onVacantPosition?: (positionRef: string) => void;
}

const BOX_W = 160;
const BOX_H = 56;
const UNIT_PAD = 24;
const COLLAPSED_H = 48;

type ElkNode = {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
};

type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
  sections?: Array<{
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
  }>;
};

function personIdFromRef(ref: string): string | null {
  const m = /^shared:person:(.+)$/.exec(ref);
  return m?.[1] ?? null;
}

function collapsedSet(options: {
  collapsedUnits?: Set<string> | Iterable<string>;
}): Set<string> {
  if (!options.collapsedUnits) return new Set();
  return options.collapsedUnits instanceof Set
    ? options.collapsedUnits
    : new Set(options.collapsedUnits);
}

/**
 * Build ELK graph from derived structure. ponytail: no free x/y pinning —
 * unit `order` drives layer order via considerModelOrder.
 */
/**
 * Archived units/positions (removed from the chart) stay in the payload as
 * history; neither renderer may draw them.
 */
export function activeStructure(structure: OrgStructurePayload): OrgStructurePayload {
  return {
    ...structure,
    units: structure.units.filter((u) => u.lifecycle_status === 'active'),
    positions: structure.positions.filter((p) => p.lifecycle_status === 'active')
  };
}

export async function layoutOrgFlowchart(
  structureInput: OrgStructurePayload,
  options: {
    selfPersonRef?: string | null;
    highlightLine?: string | null; // 'your_lines' | person_ref | `line:${unit_ref}`
    compact?: boolean;
    peopleNames?: Record<string, string>;
    collapsedUnits?: Set<string> | Iterable<string>;
  } = {}
): Promise<FlowLayout> {
  const structure = activeStructure(structureInput);
  const t0 = performance.now();
  const mod = await import('elkjs/lib/elk.bundled.js');
  const ELK = (
    mod as { default: new () => { layout: (g: unknown) => Promise<ElkNode> } }
  ).default;
  const elk = new ELK();

  const graph = structure.graph;
  const selfRef = options.selfPersonRef ?? null;
  const w = options.compact ? 120 : BOX_W;
  const h = options.compact ? 44 : BOX_H;
  const names = options.peopleNames || {};
  const collapsed = collapsedSet(options);

  const unitChildren = new Map<string, ElkNode[]>();
  const topNodes: ElkNode[] = [];
  const boxMeta = new Map<string, Omit<FlowLayoutBox, 'x' | 'y' | 'width' | 'height'>>();

  for (const unit of structure.units) {
    const uref = `shared:unit:${unit.id}`;
    unitChildren.set(uref, []);
  }

  // Positions inside units
  for (const pos of structure.positions) {
    const pref = `shared:position:${pos.id}`;
    const holder = (
      graph.nodes.find((n) => n.ref === pref) as {
        holder?: {
          person_ref: string;
          display_name: string | null;
          warmth_band: string | null;
        } | null;
      }
    )?.holder;
    const you = Boolean(holder && selfRef && holder.person_ref === selfRef);
    const memberships = holder
      ? graph.memberships_by_person[holder.person_ref] || []
      : [];
    const alsoIn = memberships
      .map((m) => {
        const u = structure.units.find((x) => `shared:unit:${x.id}` === m.unit_ref);
        return u?.name ?? null;
      })
      .filter(
        (n): n is string =>
          Boolean(n) &&
          n !== structure.units.find((u) => `shared:unit:${u.id}` === pos.unit_ref)?.name
      );

    const holderPid = holder ? personIdFromRef(holder.person_ref) : null;
    const display =
      (holderPid && names[holderPid]) || holder?.display_name || (holder ? holderPid : null);

    const node: ElkNode = { id: pref, width: w, height: h };
    boxMeta.set(pref, {
      id: pref,
      kind: 'position',
      label: display || 'Vacant',
      sublabel: pos.title,
      dashed: !holder,
      you,
      alsoIn: alsoIn.slice(0, 2),
      href: holder
        ? `#/people/${encodeURIComponent(personIdFromRef(holder.person_ref) || '')}`
        : null,
      warmthBand: holder?.warmth_band ?? null,
      unitRef: pos.unit_ref
    });

    if (pos.unit_ref && collapsed.has(pos.unit_ref)) {
      // Collapsed: omit from ELK children; still keep meta for warmth dots.
      continue;
    }

    if (pos.unit_ref && unitChildren.has(pos.unit_ref)) {
      unitChildren.get(pos.unit_ref)!.push(node);
    } else {
      topNodes.push(node);
    }
  }

  // Members without named position — warmth dots as small person cards
  for (const [unitRef, members] of Object.entries(graph.members_by_unit || {})) {
    if (collapsed.has(unitRef)) continue;
    const headPos = structure.positions.find((p) => p.is_head && p.unit_ref === unitRef);
    const headHolderRef = headPos
      ? (
          graph.nodes.find((n) => n.ref === `shared:position:${headPos.id}`) as {
            holder?: { person_ref: string } | null;
          }
        )?.holder?.person_ref
      : null;
    for (const member of members) {
      if (headHolderRef && member.person_ref === headHolderRef) continue;
      // Skip if they hold any position in this unit
      const holdsHere = structure.positions.some((p) => {
        if (p.unit_ref !== unitRef) return false;
        const pref = `shared:position:${p.id}`;
        const holder = (
          graph.nodes.find((n) => n.ref === pref) as { holder?: { person_ref: string } | null }
        )?.holder;
        return holder?.person_ref === member.person_ref;
      });
      if (holdsHere) continue;

      const pid = personIdFromRef(member.person_ref);
      const id = `member:${unitRef}:${member.person_ref}`;
      const you = Boolean(selfRef && member.person_ref === selfRef);
      const memberships = graph.memberships_by_person[member.person_ref] || [];
      const alsoIn = memberships
        .filter((m) => m.unit_ref !== unitRef)
        .map((m) => structure.units.find((u) => `shared:unit:${u.id}` === m.unit_ref)?.name)
        .filter((n): n is string => Boolean(n));
      const node: ElkNode = { id, width: w, height: h };
      boxMeta.set(id, {
        id,
        kind: 'person',
        label: (pid && names[pid]) || pid || member.person_ref,
        sublabel: member.role || 'Member',
        dashed: false,
        you,
        alsoIn: alsoIn.slice(0, 2),
        href: pid ? `#/people/${encodeURIComponent(pid)}` : null,
        warmthBand: null,
        unitRef
      });
      unitChildren.get(unitRef)?.push(node);
    }
  }

  const sortedUnits = [...structure.units].sort((a, b) => a.order - b.order);
  for (const unit of sortedUnits) {
    const uref = `shared:unit:${unit.id}`;
    const isCollapsed = collapsed.has(uref);
    const children = isCollapsed ? [] : unitChildren.get(uref) || [];
    const allMembers = graph.members_by_unit[uref] || [];
    const warmthDots = allMembers
      .map((m) => {
        const node = graph.nodes.find(
          (n) =>
            n.kind === 'position' &&
            (n as { holder?: { person_ref?: string; warmth_band?: string | null } }).holder
              ?.person_ref === m.person_ref
        ) as { holder?: { warmth_band?: string | null } } | undefined;
        return node?.holder?.warmth_band || 'cold';
      })
      .slice(0, 12);
    const childCount =
      allMembers.length ||
      structure.positions.filter((p) => p.unit_ref === uref).length ||
      (unitChildren.get(uref) || []).length;

    const compound: ElkNode = isCollapsed
      ? {
          id: uref,
          width: Math.max(w + UNIT_PAD * 2, 180),
          height: COLLAPSED_H,
          layoutOptions: {
            'elk.padding': `[top=8,left=8,bottom=8,right=8]`
          }
        }
      : {
          id: uref,
          children,
          layoutOptions: {
            'elk.padding': `[top=${UNIT_PAD + 16},left=${UNIT_PAD},bottom=${UNIT_PAD},right=${UNIT_PAD}]`
          }
        };
    boxMeta.set(uref, {
      id: uref,
      kind: 'unit',
      label: unit.name,
      sublabel: `${childCount}`,
      dashed: false,
      you: false,
      alsoIn: [],
      href: null,
      warmthBand: null,
      unitRef: uref,
      warmthDots,
      childCount
    });
    topNodes.push(compound);
  }

  const elkEdges: ElkEdge[] = [];
  const reversedEdgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (
      edge.kind === 'reports_to' &&
      edge.flag === 'derived' &&
      String(edge.source).startsWith('shared:person:')
    ) {
      // Person→head derived: layout uses membership containment; skip duplicate ELK edge
      continue;
    }
    const source = String(edge.source);
    const target = String(edge.target);
    const sourceOk =
      boxMeta.has(source) || [...boxMeta.keys()].some((k) => k.includes(source));
    const targetOk = boxMeta.has(target);
    if (!sourceOk || !targetOk) continue;
    let srcId = source;
    if (!boxMeta.has(source) && source.startsWith('shared:person:')) {
      const alt = [...boxMeta.keys()].find((k) => k.includes(source));
      if (alt) srcId = alt;
      else continue;
    }
    // Skip edges into/out of collapsed unit children
    const srcMeta = boxMeta.get(srcId);
    const tgtMeta = boxMeta.get(target);
    if (srcMeta?.unitRef && collapsed.has(srcMeta.unitRef) && srcMeta.kind !== 'unit') continue;
    if (tgtMeta?.unitRef && collapsed.has(tgtMeta.unitRef) && tgtMeta.kind !== 'unit') continue;
    // Layered layout puts an edge's source above its target. A reporting
    // line runs report → boss, so feed it boss-first or every chart is drawn
    // upside down (the principal at the bottom). The points are flipped back
    // after layout so the arrow still points at the boss.
    const bossFirst = edge.kind === 'reports_to' || edge.kind === 'answers_to';
    if (bossFirst) reversedEdgeIds.add(String(edge.id));
    elkEdges.push({
      id: String(edge.id),
      sources: [bossFirst ? target : srcId],
      targets: [bossFirst ? srcId : target]
    });
  }

  const root: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.spacing.nodeNode': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '40'
    },
    children: topNodes,
    edges: elkEdges
  };

  const result = await elk.layout(root);
  const elapsedMs = performance.now() - t0;

  const boxes: FlowLayoutBox[] = [];
  function walk(node: ElkNode, ox: number, oy: number): void {
    const x = ox + (node.x ?? 0);
    const y = oy + (node.y ?? 0);
    const meta = boxMeta.get(node.id);
    if (meta && node.id !== 'root') {
      boxes.push({
        ...meta,
        x,
        y,
        width: node.width ?? w,
        height: node.height ?? (meta.kind === 'unit' && collapsed.has(node.id) ? COLLAPSED_H : h)
      });
    }
    for (const child of node.children || []) {
      walk(child, x, y);
    }
  }
  walk(result, 0, 0);

  const highlightLine = options.highlightLine || null;
  const lineUnit =
    highlightLine && highlightLine.startsWith('line:') ? highlightLine.slice(5) : null;

  const edges: FlowLayoutEdge[] = [];
  function collectEdges(node: ElkNode, ox: number, oy: number): void {
    for (const e of node.edges || []) {
      const section = e.sections?.[0];
      if (!section) continue;
      const points = [
        { x: ox + section.startPoint.x, y: oy + section.startPoint.y },
        ...(section.bendPoints || []).map((p) => ({ x: ox + p.x, y: oy + p.y })),
        { x: ox + section.endPoint.x, y: oy + section.endPoint.y }
      ];
      if (reversedEdgeIds.has(e.id)) points.reverse();
      const src = graph.edges.find((ge) => String(ge.id) === e.id);
      let bold = true;
      if (highlightLine === 'your_lines' || !highlightLine) {
        bold = Boolean(
          src &&
            selfRef &&
            (String(src.source) === selfRef ||
              (graph.memberships_by_person[selfRef] || []).some(
                (m) => m.unit_ref === String(src.via || '')
              ))
        );
        if (!highlightLine) bold = Boolean(src?.flag === 'derived' && selfRef) || true;
      } else if (lineUnit) {
        bold = Boolean(src && String(src.via || '') === lineUnit);
      } else if (highlightLine) {
        bold = Boolean(src && String(src.source) === highlightLine);
      }
      edges.push({
        id: e.id,
        kind: String(src?.kind || 'reports_to'),
        points,
        bold,
        cycle: Boolean(src?.cycle)
      });
    }
    for (const child of node.children || []) {
      collectEdges(child, ox + (node.x ?? 0), oy + (node.y ?? 0));
    }
  }
  collectEdges(result, 0, 0);

  return {
    width: Math.max(result.width ?? 400, 320),
    height: Math.max(result.height ?? 240, 200),
    boxes,
    edges,
    elapsedMs
  };
}

/** Render layout to an SVG element (S4: explicit fills/strokes). */
export function renderFlowchartSvg(
  layout: FlowLayout,
  options: FlowchartRenderOptions = {}
): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Organisation structure flowchart');
  svg.classList.add('orgs-flow__svg');

  const collapsed = options.collapsedUnits || new Set<string>();

  const defs = document.createElementNS(ns, 'defs');
  const marker = document.createElementNS(ns, 'marker');
  marker.setAttribute('id', 'orgs-arrow');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const tip = document.createElementNS(ns, 'path');
  tip.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
  tip.setAttribute('fill', 'var(--shallow)');
  marker.append(tip);
  const markerBoth = marker.cloneNode(true) as SVGMarkerElement;
  markerBoth.setAttribute('id', 'orgs-arrow-both');
  defs.append(marker, markerBoth);
  svg.append(defs);

  for (const edge of layout.edges) {
    const path = document.createElementNS(ns, 'path');
    const d = edge.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
      .join(' ');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    const stroke =
      edge.kind === 'works_with'
        ? 'var(--muted)'
        : edge.kind === 'answers_to'
          ? 'var(--muted)'
          : 'var(--shallow)';
    path.setAttribute('stroke', stroke);
    path.setAttribute('stroke-width', edge.bold ? '2.5' : '1.25');
    if (edge.kind === 'works_with') path.setAttribute('stroke-dasharray', '3 3');
    if (edge.kind === 'answers_to') path.setAttribute('stroke-dasharray', '6 4');
    if (edge.kind === 'reports_to' || edge.kind === 'answers_to') {
      path.setAttribute('marker-end', 'url(#orgs-arrow)');
    }
    if (edge.kind === 'shares_authority_with') {
      path.setAttribute('marker-end', 'url(#orgs-arrow)');
      path.setAttribute('marker-start', 'url(#orgs-arrow)');
    }
    svg.append(path);
  }

  for (const box of layout.boxes) {
    if (box.kind === 'unit') {
      const isCollapsed = collapsed.has(box.id);
      const g = document.createElementNS(ns, 'g');
      g.classList.add('orgs-flow__unit');
      g.dataset.unitRef = box.id;

      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(box.x));
      rect.setAttribute('y', String(box.y));
      rect.setAttribute('width', String(box.width));
      rect.setAttribute('height', String(box.height));
      rect.setAttribute('rx', '12');
      rect.setAttribute('fill', 'var(--cotton)');
      rect.setAttribute('stroke', 'var(--line)');
      g.append(rect);

      const title = document.createElementNS(ns, 'text');
      title.setAttribute('x', String(box.x + 28));
      title.setAttribute('y', String(box.y + 18));
      title.setAttribute('fill', 'var(--depth)');
      title.setAttribute('font-size', '11');
      title.setAttribute('font-weight', '700');
      title.textContent = box.label;
      g.append(title);

      // Collapse toggle (V1)
      const fo = document.createElementNS(ns, 'foreignObject');
      fo.setAttribute('x', String(box.x + 6));
      fo.setAttribute('y', String(box.y + 4));
      fo.setAttribute('width', '22');
      fo.setAttribute('height', '22');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'orgs-flow__collapse';
      toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', isCollapsed ? `Expand ${box.label}` : `Collapse ${box.label}`);
      toggle.textContent = isCollapsed ? '+' : '−';
      toggle.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        options.onToggleUnit?.(box.id);
      });
      fo.append(toggle);
      g.append(fo);

      if (isCollapsed) {
        const count = document.createElementNS(ns, 'text');
        count.setAttribute('x', String(box.x + 28));
        count.setAttribute('y', String(box.y + 36));
        count.setAttribute('fill', 'var(--muted)');
        count.setAttribute('font-size', '10');
        count.textContent = `${box.childCount ?? box.sublabel} people`;
        g.append(count);

        let dx = box.x + 100;
        for (const band of box.warmthDots || []) {
          const dot = document.createElementNS(ns, 'circle');
          dot.setAttribute('cx', String(dx));
          dot.setAttribute('cy', String(box.y + 34));
          dot.setAttribute('r', '4');
          dot.classList.add('orgs-flow__warmth-dot');
          const fill =
            band === 'warm'
              ? 'var(--wave)'
              : band === 'cooling'
                ? 'var(--shallow)'
                : 'var(--muted)';
          dot.setAttribute('fill', fill);
          g.append(dot);
          dx += 10;
        }
      }

      svg.append(g);
      continue;
    }

    // Hide member/position cards that somehow remain under a collapsed unit (V1)
    if (box.unitRef && collapsed.has(box.unitRef)) {
      const hidden = document.createElementNS(ns, 'g');
      hidden.setAttribute('hidden', '');
      hidden.classList.add('orgs-flow__member');
      hidden.dataset.unitRef = box.unitRef;
      svg.append(hidden);
      continue;
    }

    const vacant = box.kind === 'position' && box.dashed && !box.href;
    const g = document.createElementNS(ns, 'g');
    g.classList.add(vacant ? 'orgs-flow__vacant-card' : 'orgs-flow__card');
    if (box.unitRef) g.dataset.unitRef = box.unitRef;

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(box.x));
    rect.setAttribute('y', String(box.y));
    rect.setAttribute('width', String(box.width));
    rect.setAttribute('height', String(box.height));
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', box.you ? 'var(--pastel-blue)' : 'var(--paper)');
    rect.setAttribute('stroke', box.dashed ? 'var(--muted)' : 'var(--line)');
    if (box.dashed) rect.setAttribute('stroke-dasharray', '4 3');
    g.append(rect);

    const name = document.createElementNS(ns, 'text');
    name.setAttribute('x', String(box.x + 10));
    name.setAttribute('y', String(box.y + 22));
    name.setAttribute('fill', 'var(--ink)');
    name.setAttribute('font-size', '12');
    name.setAttribute('font-weight', '600');
    const nameRaw = box.you ? `${box.label} · You` : box.label;
    const nameMax = Math.max(10, Math.floor((box.width - 16) / 6.5));
    name.textContent =
      nameRaw.length > nameMax ? `${nameRaw.slice(0, Math.max(0, nameMax - 1))}…` : nameRaw;
    g.append(name);

    const sub = document.createElementNS(ns, 'text');
    sub.setAttribute('x', String(box.x + 10));
    sub.setAttribute('y', String(box.y + 38));
    sub.setAttribute('fill', 'var(--muted)');
    sub.setAttribute('font-size', '10');
    const subRaw = box.alsoIn.length
      ? `${box.sublabel} · also in ${box.alsoIn[0]}`
      : box.sublabel;
    // Keep label inside the card (C1) — long "also in …" lines truncate.
    const maxChars = Math.max(12, Math.floor((box.width - 16) / 5.5));
    sub.textContent =
      subRaw.length > maxChars ? `${subRaw.slice(0, Math.max(0, maxChars - 1))}…` : subRaw;
    g.append(sub);

    if (vacant) {
      // I2: vacant roles are focusable buttons
      const fo = document.createElementNS(ns, 'foreignObject');
      fo.setAttribute('x', String(box.x));
      fo.setAttribute('y', String(box.y));
      fo.setAttribute('width', String(box.width));
      fo.setAttribute('height', String(box.height));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'orgs-flow__vacant';
      btn.setAttribute('aria-label', `Assign someone to ${box.sublabel || 'this role'} (vacant)`);
      btn.title = 'Assign someone via Edit structure';
      const label = document.createElement('span');
      label.className = 'orgs-flow__vacant-label';
      label.textContent = 'Vacant';
      const role = document.createElement('span');
      role.className = 'orgs-flow__vacant-role';
      role.textContent = box.sublabel;
      btn.append(label, role);
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        options.onVacantPosition?.(box.id);
      });
      fo.append(btn);
      svg.append(fo);
    } else if (box.href) {
      const a = document.createElementNS(ns, 'a');
      a.setAttribute('href', box.href);
      a.append(g);
      svg.append(a);
    } else {
      svg.append(g);
    }
  }

  return svg;
}

/** Phone outline: indented tree of units (Phase 3.5). */
export function renderStructureOutline(
  structureInput: OrgStructurePayload,
  selfPersonRef: string | null,
  peopleNames: Record<string, string> = {}
): HTMLElement {
  const structure = activeStructure(structureInput);
  const root = document.createElement('div');
  root.className = 'orgs-outline';
  const units = [...structure.units].sort((a, b) => a.order - b.order);
  for (const unit of units) {
    const uref = `shared:unit:${unit.id}`;
    const block = document.createElement('div');
    block.className = 'orgs-outline__unit';
    const h = document.createElement('div');
    h.className = 'orgs-outline__unit-name';
    h.textContent = unit.name;
    block.append(h);

    const head = structure.positions.find((p) => p.is_head && p.unit_ref === uref);
    if (head) {
      const headNode = structure.graph.nodes.find((n) => n.ref === `shared:position:${head.id}`) as {
        holder?: { display_name?: string | null; person_ref?: string } | null;
      } | undefined;
      const line = document.createElement('div');
      line.className = 'orgs-outline__line';
      const pid = headNode?.holder?.person_ref
        ? personIdFromRef(headNode.holder.person_ref)
        : null;
      const holderName =
        (pid && peopleNames[pid]) || headNode?.holder?.display_name || 'Vacant';
      line.textContent = `${head.title} — ${holderName}`;
      block.append(line);
    }

    for (const member of structure.graph.members_by_unit[uref] || []) {
      const row = document.createElement('div');
      row.className = 'orgs-outline__member';
      const you = selfPersonRef && member.person_ref === selfPersonRef;
      const also = (structure.graph.memberships_by_person[member.person_ref] || [])
        .filter((m) => m.unit_ref !== uref)
        .map((m) => structure.units.find((u) => `shared:unit:${u.id}` === m.unit_ref)?.name)
        .filter(Boolean);
      const pid = personIdFromRef(member.person_ref);
      const a = document.createElement('a');
      a.href = pid ? `#/people/${encodeURIComponent(pid)}` : '#';
      const display = (pid && peopleNames[pid]) || pid || 'Member';
      a.textContent = you
        ? `You${member.role ? ` · ${member.role}` : ''}`
        : member.role
          ? `${display} · ${member.role}`
          : display;
      row.append(a);
      if (also.length) {
        const hint = document.createElement('span');
        hint.className = 'orgs-outline__also';
        hint.textContent = `also in ${also.join(', ')}`;
        row.append(hint);
      }
      block.append(row);
    }
    root.append(block);
  }
  // Roles drawn on the chart without a unit — the drag-and-connect editor
  // starts from people and roles, so these are often the whole chart.
  const loose = structure.positions.filter((p) => !p.unit_ref);
  if (loose.length) {
    const block = document.createElement('div');
    block.className = 'orgs-outline__unit';
    const h = document.createElement('div');
    h.className = 'orgs-outline__unit-name';
    h.textContent = units.length ? 'Other roles' : 'Roles';
    block.append(h);
    const nameFor = (ref: string): string => {
      const node = structure.graph.nodes.find((n) => n.ref === ref) as
        | { title?: string; holder?: { display_name?: string | null; person_ref?: string } | null }
        | undefined;
      const pid = node?.holder?.person_ref ? personIdFromRef(node.holder.person_ref) : null;
      const holder = (pid && peopleNames[pid]) || node?.holder?.display_name || null;
      return holder ? `${holder} (${node?.title ?? 'role'})` : node?.title ?? 'a role';
    };
    for (const pos of loose) {
      const ref = `shared:position:${pos.id}`;
      const row = document.createElement('div');
      row.className = 'orgs-outline__member';
      row.textContent = nameFor(ref);
      const boss = structure.graph.edges.find(
        (e) => e.kind === 'reports_to' && e.flag === 'explicit' && e.source === ref
      );
      if (boss) {
        const hint = document.createElement('span');
        hint.className = 'orgs-outline__also';
        hint.textContent = `reports to ${nameFor(boss.target)}`;
        row.append(hint);
      }
      block.append(row);
    }
    root.append(block);
  }
  if (!units.length && !loose.length) {
    root.append(
      Object.assign(document.createElement('p'), {
        className: 'people-pane__empty',
        textContent: 'No chart yet. Use “Draw the chart” to add people and connect them.'
      })
    );
  }
  return root;
}
