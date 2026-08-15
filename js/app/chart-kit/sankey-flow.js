import { sankey } from './d3-layout.js';

function twoColumnFallback(flows, { width, height }) {
  const froms = [...new Set(flows.map(flow => flow.from))];
  const tos = [...new Set(flows.map(flow => flow.to))];
  const max = Math.max(1, ...flows.map(flow => Number(flow.count) || 0));
  const rowH = Math.max(8, height / Math.max(froms.length, tos.length, 1));
  return {
    nodes: [
      ...froms.map((id, index) => ({
        id,
        x0: 0,
        x1: 12,
        y0: index * rowH,
        y1: index * rowH + rowH * 0.7
      })),
      ...tos.map((id, index) => ({
        id,
        x0: width - 12,
        x1: width,
        y0: index * rowH,
        y1: index * rowH + rowH * 0.7
      }))
    ],
    links: flows.map(flow => ({
      source: flow.from,
      target: flow.to,
      width: Math.max(2, ((Number(flow.count) || 0) / max) * (height / 2)),
      value: Number(flow.count) || 0
    }))
  };
}

export function buildSankeyFlow(transitions, { width = 320, height = 80 } = {}) {
  const flows = (transitions ?? []).filter(flow => flow.from && flow.to);
  if (!flows.length) return { nodes: [], links: [] };
  const ids = [];
  for (const flow of flows) {
    if (!ids.includes(flow.from)) ids.push(flow.from);
    if (!ids.includes(flow.to)) ids.push(flow.to);
  }
  try {
    const layout = sankey()
      .size([width, height])
      .nodeId(node => node.id)
      .nodeWidth(12)
      .nodePadding(8);
    const graph = layout({
      nodes: ids.map(id => ({ id })),
      links: flows.map(flow => ({ source: flow.from, target: flow.to, value: Number(flow.count) || 0 }))
    });
    return {
      nodes: graph.nodes,
      links: graph.links.map(link => ({
        source: link.source.id ?? link.source,
        target: link.target.id ?? link.target,
        width: link.width,
        value: link.value,
        y0: link.y0,
        y1: link.y1,
        x0: link.source.x1,
        x1: link.target.x0
      }))
    };
  } catch {
    return twoColumnFallback(flows, { width, height });
  }
}
