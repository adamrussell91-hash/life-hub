import type { ConceptMapContent, GraphNode, MindMapContent } from '@/blocks/graph-layout';

const PRESET_COLORS = ['#dceafa', '#dfe9e1', '#f2dfd0', '#f1e2b6', '#e8e0f1', '#f5f1e9', '#17375e', '#376fb7', '#f68620'];
const ROOT_COLOR = '#17375e';
const CONCEPT_GOLD = '#f1e2b6';

type MindMapEngineNode = {
  id: string;
  parentId: string | null;
  text: string;
  color: string;
  textColor: string;
  side: 'left' | 'right' | null;
  childIds: string[];
};

export type MindMapEngineState = {
  kind: 'mindmap';
  rootId: string;
  nodes: Record<string, MindMapEngineNode>;
};

type ConceptEngineNode = {
  id: string;
  text: string;
  color: string;
  textColor: string;
  x: number;
  y: number;
};

export type ConceptMapEngineState = {
  kind: 'conceptmap';
  nodes: Record<string, ConceptEngineNode>;
  edges: Array<{ id: string; from: string; to: string; label: string }>;
};

function textColorFor(bgHex: string): string {
  return bgHex.toLowerCase() === ROOT_COLOR.toLowerCase() ? '#ffffff' : '#13233a';
}

function defaultMindColor(index: number, isRoot: boolean): string {
  if (isRoot) return ROOT_COLOR;
  return PRESET_COLORS[index % PRESET_COLORS.length] ?? PRESET_COLORS[0]!;
}

function balancedSide(childIds: string[], nodes: Record<string, MindMapEngineNode>, id: string): 'left' | 'right' {
  const node = nodes[id];
  if (!node) return 'right';
  let left = 0;
  let right = 0;
  for (const childId of childIds) {
    const side = nodes[childId]?.side;
    if (side === 'left') left += 1;
    else right += 1;
  }
  return right <= left ? 'right' : 'left';
}

function assignSides(rootId: string, nodes: Record<string, MindMapEngineNode>): void {
  function walk(id: string, side: 'left' | 'right' | null): void {
    const node = nodes[id];
    if (!node) return;
    node.side = side;
    for (const childId of node.childIds) {
      walk(childId, id === rootId ? balancedSide(node.childIds, nodes, childId) : side);
    }
  }
  walk(rootId, null);
}

export function mindMapContentToEngineState(content: MindMapContent): MindMapEngineState {
  const sorted = [...content.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const root = sorted.find((node) => node.parent_id == null) ?? sorted[0];
  if (!root) {
    const rootId = 'root';
    return {
      kind: 'mindmap',
      rootId,
      nodes: {
        [rootId]: {
          id: rootId,
          parentId: null,
          text: 'Central idea',
          color: ROOT_COLOR,
          textColor: '#ffffff',
          side: null,
          childIds: []
        }
      }
    };
  }

  const nodes: Record<string, MindMapEngineNode> = {};
  sorted.forEach((node, index) => {
    const color = node.color ?? defaultMindColor(index, node.id === root.id);
    nodes[node.id] = {
      id: node.id,
      parentId: node.parent_id ?? null,
      text: node.label || 'Untitled',
      color,
      textColor: textColorFor(color),
      side: null,
      childIds: []
    };
  });

  for (const node of sorted) {
    if (node.parent_id && nodes[node.parent_id]) {
      nodes[node.parent_id]!.childIds.push(node.id);
    }
  }

  for (const node of Object.values(nodes)) {
    node.childIds.sort((a, b) => a.localeCompare(b));
  }

  assignSides(root.id, nodes);

  return { kind: 'mindmap', rootId: root.id, nodes };
}

export function engineStateToMindMapContent(state: MindMapEngineState): MindMapContent {
  const nodes: GraphNode[] = Object.values(state.nodes).map((node) => ({
    id: node.id,
    label: node.text.trim() || 'Untitled',
    parent_id: node.parentId,
    color: node.color
  }));
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  return { nodes, edges: [] };
}

function defaultConceptPositions(count: number, index: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  const radius = Math.max(140, count * 36);
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function conceptMapContentToEngineState(content: ConceptMapContent): ConceptMapEngineState {
  const sorted = [...content.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const nodes: Record<string, ConceptEngineNode> = {};

  sorted.forEach((node, index) => {
    const color = node.color ?? (index === 0 ? CONCEPT_GOLD : PRESET_COLORS[index % PRESET_COLORS.length]!);
    const pos =
      node.x != null && node.y != null
        ? { x: node.x, y: node.y }
        : defaultConceptPositions(sorted.length, index);
    nodes[node.id] = {
      id: node.id,
      text: node.label || 'Untitled',
      color,
      textColor: textColorFor(color),
      x: pos.x,
      y: pos.y
    };
  });

  const edges = content.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: edge.label?.trim() || 'relates to'
  }));

  return { kind: 'conceptmap', nodes, edges };
}

export function engineStateToConceptMapContent(state: ConceptMapEngineState): ConceptMapContent {
  const nodes: GraphNode[] = Object.values(state.nodes).map((node) => ({
    id: node.id,
    label: node.text.trim() || 'Untitled',
    color: node.color,
    x: node.x,
    y: node.y
  }));
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  const edges = state.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: edge.label.trim() || 'relates to'
  }));

  return { nodes, edges };
}
