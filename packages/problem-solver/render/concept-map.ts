// packages/problem-solver/render/concept-map.ts
// Concept mapping from the toolkit (p.49): the central theme with its key concepts
// and the links between them. The map itself is drawn by graph-blocks (it owns the
// layout and the read-only picture); this file adapts the run to its content and
// lists the concepts as pills underneath, where each one opens its details.
import type { GraphContent, GraphEdge, GraphNode } from '../../graph-blocks/graph';
import { renderGraphView } from '../../graph-blocks/view';
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type ConceptMapView = { el: HTMLDivElement; update(run: PsToolRun): void };

const EDGE_LABELS: Record<string, string> = { hierarchical: 'leads to', association: 'relates to', cross: 'links across' };
// An orphan concept still belongs to the theme (the step asks for concepts related to it).
const ORPHAN_LABEL = 'includes';

function slotName(node: PsNode): string | undefined {
  return parseSlot(node.slot)?.name;
}

/** The run as graph-blocks concept content: theme first, concepts alternating blue and gold. */
export function conceptContent(run: PsToolRun): GraphContent {
  const theme = run.nodes.find((node) => slotName(node) === 'theme');
  const concepts = run.nodes.filter((node) => slotName(node) === 'concept');
  const ids = new Set([theme, ...concepts].filter(Boolean).map((node) => node!.id));
  const edges: GraphEdge[] = run.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .map((edge) => ({ id: `${edge.kind}:${edge.from}:${edge.to}`, from: edge.from, to: edge.to, label: EDGE_LABELS[edge.kind] ?? EDGE_LABELS.association }));
  const parentOf = new Map(run.edges.filter((edge) => edge.kind === 'hierarchical' && ids.has(edge.from)).map((edge) => [edge.to, edge.from]));
  const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const nodes: GraphNode[] = [];
  if (theme) nodes.push({ id: theme.id, label: nodeTitle(theme), parent_id: null, color: 'peach' });
  concepts.forEach((node, i) => {
    nodes.push({ id: node.id, label: nodeTitle(node), parent_id: parentOf.get(node.id) ?? theme?.id ?? null, color: i % 2 === 0 ? 'blue' : 'gold' });
    if (theme && !linked.has(node.id)) edges.push({ id: `theme:${theme.id}:${node.id}`, from: theme.id, to: node.id, label: ORPHAN_LABEL });
  });
  return { title: theme ? nodeTitle(theme) : 'Concept map', nodes, edges, mode: 'outline' };
}

export function createConceptMapView(doc: Document = document): ConceptMapView {
  const root = doc.createElement('div');
  root.className = 'ps-cmap';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Concept mapping');
  const stage = doc.createElement('div');
  stage.className = 'ps-cmap__stage';
  stage.setAttribute('aria-hidden', 'true');
  const pills = doc.createElement('div');
  pills.className = 'ps-cmap__pills';
  const panel = doc.createElement('div');
  panel.className = 'ps-cmap__panel';
  const group = createDisclosureGroup();
  const drawn = new Map<string, HTMLElement>();
  let painted = '';

  function addPill(node: PsNode, index: number): HTMLElement {
    const isTheme = slotName(node) === 'theme';
    const accent: Accent = isTheme ? 'red' : index % 2 === 0 ? 'blue' : 'yellow';
    const id = nextId('ps-cmap-details');
    const item = doc.createElement('div');
    item.className = `ps-cmap__item ps-cmap__item--${accent}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'ps-cmap__shape';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id);
    const meta = isTheme ? 'Theme' : 'Concept';
    btn.setAttribute('aria-label', `${meta}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`);
    const label = doc.createElement('span');
    label.className = 'ps-cmap__meta';
    label.textContent = meta;
    const title = doc.createElement('span');
    title.className = 'ps-cmap__title';
    title.textContent = nodeTitle(node);
    btn.append(label, title);
    if (node.state === 'contested') btn.append(contestedTag(doc, node));
    item.append(btn);
    const card = detailsCard(doc, node, accent, id);
    panel.append(card);
    group.register(card, btn);
    if (isTheme) pills.prepend(item);
    else pills.append(item);
    if (canAnimate(item)) item.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE, fill: 'backwards' });
    return item;
  }

  function update(run: PsToolRun): void {
    const shown = run.nodes.filter((node) => ['theme', 'concept'].includes(slotName(node) ?? ''));
    if (!shown.length) return;
    if (!stage.isConnected) root.append(stage, pills, panel);
    let concept = 0;
    for (const node of shown) {
      const isConcept = slotName(node) === 'concept';
      let item = drawn.get(node.id);
      if (!item) {
        item = addPill(node, concept);
        drawn.set(node.id, item);
      }
      if (isConcept) concept += 1;
      item.classList.toggle('is-contested', node.state === 'contested');
    }
    const content = conceptContent(run);
    const signature = JSON.stringify(content);
    if (signature !== painted) {
      painted = signature;
      renderGraphView(stage, 'concept', content);
    }
  }

  return { el: root, update };
}
