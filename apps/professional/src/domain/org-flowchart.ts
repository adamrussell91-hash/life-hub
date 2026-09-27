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

const BOX_W = 160;
const BOX_H = 56;
const UNIT_PAD = 24;

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

/**
 * Build ELK graph from derived structure. ponytail: no free x/y pinning —
 * unit `order` drives layer order via considerModelOrder.
 */
export async function layoutOrgFlowchart(
  structure: OrgStructurePayload,
  options: {
    selfPersonRef?: string | null;
    highlightLine?: string | null; // person_ref or 'your_lines'
    compact?: boolean;
  } = {}
): Promise<FlowLayout> {
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
    const holder = (graph.nodes.find((n) => n.ref === pref) as { holder?: {
      person_ref: string;
      display_name: string | null;
      warmth_band: string | null;
    } | null })?.holder;
    const you = Boolean(holder && selfRef && holder.person_ref === selfRef);
    const memberships = holder
      ? graph.memberships_by_person[holder.person_ref] || []
      : [];
    const alsoIn = memberships
      .map((m) => {
        const u = structure.units.find((x) => `shared:unit:${x.id}` === m.unit_ref);
        return u?.name ?? null;
      })
      .filter((n): n is string => Boolean(n) && n !== structure.units.find((u) => `shared:unit:${u.id}` === pos.unit_ref)?.name);

    const node: ElkNode = { id: pref, width: w, height: h };
    boxMeta.set(pref, {
      id: pref,
      kind: 'position',
      label: holder?.display_name || 'not met',
      sublabel: pos.title,
      dashed: !holder,
      you,
      alsoIn: alsoIn.slice(0, 2),
      href: holder ? `#/people/${encodeURIComponent(personIdFromRef(holder.person_ref) || '')}` : null,
      warmthBand: holder?.warmth_band ?? null,
      unitRef: pos.unit_ref
    });

    if (pos.unit_ref && unitChildren.has(pos.unit_ref)) {
      unitChildren.get(pos.unit_ref)!.push(node);
    } else {
      topNodes.push(node);
    }
  }

  // Members without named position — warmth dots as small person cards
  for (const [unitRef, members] of Object.entries(graph.members_by_unit || {})) {
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
        label: pid || member.person_ref,
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
    const children = unitChildren.get(uref) || [];
    const compound: ElkNode = {
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
      sublabel: `${children.length}`,
      dashed: false,
      you: false,
      alsoIn: [],
      href: null,
      warmthBand: null,
      unitRef: uref
    });
    topNodes.push(compound);
  }

  const elkEdges: ElkEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.kind === 'reports_to' && edge.flag === 'derived' && String(edge.source).startsWith('shared:person:')) {
      // Person→head derived: layout uses membership containment; skip duplicate ELK edge
      continue;
    }
    const source = String(edge.source);
    const target = String(edge.target);
    // Only wire edges between nodes we placed
    const sourceOk =
      boxMeta.has(source) ||
      [...boxMeta.keys()].some((k) => k.includes(source));
    const targetOk = boxMeta.has(target);
    if (!sourceOk || !targetOk) continue;
    let srcId = source;
    if (!boxMeta.has(source) && source.startsWith('shared:person:')) {
      const alt = [...boxMeta.keys()].find((k) => k.includes(source));
      if (alt) srcId = alt;
      else continue;
    }
    elkEdges.push({
      id: String(edge.id),
      sources: [srcId],
      targets: [target]
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
        height: node.height ?? h
      });
    }
    for (const child of node.children || []) {
      walk(child, x, y);
    }
  }
  walk(result, 0, 0);

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
      const src = graph.edges.find((ge) => String(ge.id) === e.id);
      const bold =
        options.highlightLine === 'your_lines'
          ? Boolean(
              src &&
                selfRef &&
                (String(src.source) === selfRef ||
                  (graph.memberships_by_person[selfRef] || []).some(
                    (m) => m.unit_ref === String(src.via || '')
                  ))
            )
          : options.highlightLine
            ? Boolean(src && String(src.source) === options.highlightLine)
            : true;
      edges.push({
        id: e.id,
        kind: String(src?.kind || 'reports_to'),
        points,
        bold: options.highlightLine ? bold : Boolean(src?.flag === 'derived' && selfRef),
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
export function renderFlowchartSvg(layout: FlowLayout): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Organisation structure flowchart');
  svg.classList.add('orgs-flow__svg');

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
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(box.x));
      rect.setAttribute('y', String(box.y));
      rect.setAttribute('width', String(box.width));
      rect.setAttribute('height', String(box.height));
      rect.setAttribute('rx', '12');
      rect.setAttribute('fill', 'var(--cotton)');
      rect.setAttribute('stroke', 'var(--line)');
      svg.append(rect);
      const title = document.createElementNS(ns, 'text');
      title.setAttribute('x', String(box.x + 10));
      title.setAttribute('y', String(box.y + 16));
      title.setAttribute('fill', 'var(--depth)');
      title.setAttribute('font-size', '11');
      title.setAttribute('font-weight', '700');
      title.textContent = box.label;
      svg.append(title);
      continue;
    }

    const g = document.createElementNS(ns, 'g');
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
    name.textContent = box.you ? `${box.label} · You` : box.label;
    g.append(name);

    const sub = document.createElementNS(ns, 'text');
    sub.setAttribute('x', String(box.x + 10));
    sub.setAttribute('y', String(box.y + 38));
    sub.setAttribute('fill', 'var(--muted)');
    sub.setAttribute('font-size', '10');
    sub.textContent = box.alsoIn.length
      ? `${box.sublabel} · also in ${box.alsoIn[0]}`
      : box.sublabel;
    g.append(sub);

    if (box.href) {
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
  structure: OrgStructurePayload,
  selfPersonRef: string | null
): HTMLElement {
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
      const holderName = headNode?.holder?.display_name || 'not met';
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
      a.textContent = you
        ? `You${member.role ? ` · ${member.role}` : ''}`
        : member.role || pid || 'Member';
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
  if (!units.length) {
    root.append(Object.assign(document.createElement('p'), {
      className: 'people-pane__empty',
      textContent: 'No structure yet. Add units to show how this organisation is run.'
    }));
  }
  return root;
}
