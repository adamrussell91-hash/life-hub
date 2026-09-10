import { escapeXml } from '@/blocks/chart-svg';
import {
  GRAPH_NODE_R,
  layoutConceptMap,
  layoutMindMap,
  type ConceptMapContent,
  type GraphNode,
  type MindMapContent,
  type PositionedNode
} from '@/blocks/graph-layout';

function wrapLabel(label: string, maxChars = 14): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function labelledText(opts: {
  x: number;
  y: number;
  label: string;
  anchor?: 'start' | 'middle' | 'end';
  fontSize?: number;
}): string {
  const lines = wrapLabel(opts.label);
  const anchor = opts.anchor ?? 'middle';
  const fontSize = opts.fontSize ?? 11;
  if (lines.length <= 1) {
    return `<text x="${opts.x.toFixed(1)}" y="${opts.y.toFixed(1)}" text-anchor="${anchor}" font-size="${fontSize}" fill="currentColor">${escapeXml(lines[0] ?? '')}</text>`;
  }
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : fontSize + 2;
      return `<tspan x="${opts.x.toFixed(1)}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');
  return `<text x="${opts.x.toFixed(1)}" y="${opts.y.toFixed(1)}" text-anchor="${anchor}" font-size="${fontSize}" fill="currentColor">${tspans}</text>`;
}

function viewBoxFor(nodes: PositionedNode[]): { minX: number; minY: number; width: number; height: number } {
  const pad = 88;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs, 0) - pad;
  const minY = Math.min(...ys, 0) - pad;
  const maxX = Math.max(...xs, 0) + pad;
  const maxY = Math.max(...ys, 0) + pad;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function outwardLabel(node: PositionedNode, cx: number, cy: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const dx = node.x - cx;
  const dy = node.y - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    return { x: node.x, y: node.y + GRAPH_NODE_R + 14, anchor: 'middle' };
  }
  const x = node.x + (dx / len) * (GRAPH_NODE_R + 10);
  const y = node.y + (dy / len) * (GRAPH_NODE_R + 10);
  const anchor = Math.abs(dx) < 12 ? 'middle' : dx > 0 ? 'start' : 'end';
  return { x, y, anchor };
}

function centreOf(nodes: PositionedNode[]): { cx: number; cy: number } {
  if (nodes.length === 0) return { cx: 0, cy: 0 };
  const cx = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
  const cy = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;
  return { cx, cy };
}

export function buildMindMapSvg(content: MindMapContent): string {
  const positioned = layoutMindMap(content.nodes);
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const { cx, cy } = centreOf(positioned);
  const box = viewBoxFor(positioned);
  const lines: string[] = [];
  for (const node of content.nodes) {
    if (node.parent_id == null) continue;
    const child = byId.get(node.id);
    const parent = byId.get(node.parent_id);
    if (!child || !parent) continue;
    lines.push(
      `<line x1="${parent.x}" y1="${parent.y}" x2="${child.x}" y2="${child.y}" stroke="var(--orca)" stroke-width="1.5" />`
    );
  }
  const root = content.nodes.find((node) => node.parent_id == null);
  const nodesMarkup = positioned
    .map((node) => {
      const isRoot = node.id === root?.id;
      const label = isRoot
        ? labelledText({
            x: node.x,
            y: node.y + GRAPH_NODE_R + 14,
            label: node.label,
            fontSize: 11
          })
        : labelledText({ ...outwardLabel(node, cx, cy), label: node.label });
      return (
        `<circle cx="${node.x}" cy="${node.y}" r="${GRAPH_NODE_R}" fill="var(--pastel-blue)" stroke="var(--wave)" stroke-width="1.5" />` +
        label
      );
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${box.minY} ${box.width} ${box.height}" width="100%" overflow="visible" role="img">${lines.join('')}${nodesMarkup}</svg>`;
}

export function buildConceptMapSvg(content: ConceptMapContent): string {
  const layout = layoutConceptMap(content.nodes, content.edges);
  const { cx, cy } = centreOf(layout.nodes);
  const box = viewBoxFor(layout.nodes);
  const edgesMarkup = layout.edges
    .map((edge) => {
      const midX = (edge.x1 + edge.x2) / 2;
      const midY = (edge.y1 + edge.y2) / 2;
      const label = edge.label
        ? labelledText({ x: midX, y: midY - 8, label: edge.label, fontSize: 10 })
        : '';
      return (
        `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="var(--orca)" stroke-width="1.5" />` +
        label
      );
    })
    .join('');
  const nodesMarkup = layout.nodes
    .map((node) => {
      const label = labelledText({ ...outwardLabel(node, cx, cy), label: node.label });
      return (
        `<circle cx="${node.x}" cy="${node.y}" r="${GRAPH_NODE_R}" fill="var(--pastel-gold)" stroke="var(--pastel-gold-ink)" stroke-width="1.5" />` +
        label
      );
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${box.minY} ${box.width} ${box.height}" width="100%" overflow="visible" role="img">${edgesMarkup}${nodesMarkup}</svg>`;
}

export type { GraphNode };
