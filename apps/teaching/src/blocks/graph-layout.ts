export type GraphNode = {
  id: string;
  label: string;
  parent_id?: string | null;
  color?: string;
  x?: number;
  y?: number;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type MindMapContent = {
  title?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type ConceptMapContent = {
  title?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

function isRoot(node: GraphNode): boolean {
  return node.parent_id == null;
}

function hasCycle(nodes: GraphNode[]): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const start of nodes) {
    const seen = new Set<string>();
    let current: GraphNode | undefined = start;
    while (current) {
      if (seen.has(current.id)) return true;
      seen.add(current.id);
      if (isRoot(current) || !current.parent_id) break;
      current = byId.get(current.parent_id);
    }
  }

  return false;
}

export function validateMindMap(content: MindMapContent): string | null {
  const { nodes } = content;
  if (nodes.length === 0) {
    return 'Mind map requires at least one node';
  }

  if (hasCycle(nodes)) {
    return 'Mind map has a cycle in parent links';
  }

  const roots = nodes.filter(isRoot);
  if (roots.length !== 1) {
    return 'Mind map requires exactly one root node';
  }

  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    if (isRoot(node)) continue;
    if (!node.parent_id || !ids.has(node.parent_id)) {
      return `Mind map node "${node.id}" has a missing parent`;
    }
  }

  return null;
}

export function validateConceptMap(content: ConceptMapContent): string | null {
  const { nodes, edges } = content;

  if (nodes.length < 2) {
    return 'Concept map requires at least two nodes';
  }
  if (edges.length < 1) {
    return 'Concept map requires at least one edge';
  }

  const ids = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    const label = edge.label?.trim() ?? '';
    if (!label) {
      return 'Concept map edges require a non-empty label';
    }
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      return `Concept map edge "${edge.id}" has invalid endpoints`;
    }
  }

  return null;
}
