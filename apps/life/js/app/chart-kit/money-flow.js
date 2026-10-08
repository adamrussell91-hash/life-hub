/**
 * Money flow (`money-flow`): a two-column Sankey with a fixed node order.
 * Sources fill targets greedily top to bottom, so ribbons never cross.
 * Used on Life → Property ("Where the money goes").
 */

/**
 * @param {{ id: string, value: number }[]} sources  left column, top to bottom
 * @param {{ id: string, value: number }[]} targets  right column, top to bottom
 * @param {{ height?: number, top?: number, gap?: number, xLeft?: number, xRight?: number, nodeWidth?: number }} options
 */
export function buildMoneyFlow(sources, targets, { height = 300, top = 8, gap = 14, xLeft = 112, xRight = 380, nodeWidth = 12 } = {}) {
  const left = (sources ?? []).map(node => ({ ...node, value: Math.max(0, Number(node.value) || 0) })).filter(node => node.value > 0);
  const right = (targets ?? []).map(node => ({ ...node, value: Math.max(0, Number(node.value) || 0) })).filter(node => node.value > 0);
  const total = right.reduce((sum, node) => sum + node.value, 0);
  const leftTotal = left.reduce((sum, node) => sum + node.value, 0);
  if (!total || !leftTotal) return { nodes: [], ribbons: [], scale: 0 };

  const usable = height - top * 2 - gap * Math.max(right.length - 1, left.length - 1, 0);
  const scale = usable / Math.max(total, leftTotal);
  const place = (column, x) => {
    const span = column.reduce((sum, node) => sum + node.value * scale, 0) + gap * (column.length - 1);
    let y = top + (height - top * 2 - span) / 2;
    return column.map(node => {
      const placed = { ...node, x, y, h: node.value * scale, cursor: y };
      y += placed.h + gap;
      return placed;
    });
  };
  const leftNodes = place(left, xLeft);
  const rightNodes = place(right, xRight);

  const ribbons = [];
  let li = 0;
  let remaining = leftNodes[0]?.value ?? 0;
  for (const target of rightNodes) {
    let need = target.value;
    while (need > 1e-6 && li < leftNodes.length) {
      const take = Math.min(need, remaining);
      const source = leftNodes[li];
      const h = take * scale;
      const y0 = source.cursor;
      const y1 = target.cursor;
      source.cursor += h;
      target.cursor += h;
      const x0 = xLeft + nodeWidth;
      const x1 = xRight;
      const mid = (x0 + x1) / 2;
      ribbons.push({
        source: source.id,
        target: target.id,
        value: take,
        path: `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1} L${x1},${y1 + h} C${mid},${y1 + h} ${mid},${y0 + h} ${x0},${y0 + h} Z`
      });
      need -= take;
      remaining -= take;
      if (remaining <= 1e-6) {
        li++;
        remaining = leftNodes[li]?.value ?? 0;
      }
    }
  }
  const strip = ({ cursor, ...node }) => node;
  return {
    nodes: [...leftNodes.map(node => ({ ...strip(node), side: 'left' })), ...rightNodes.map(node => ({ ...strip(node), side: 'right' }))],
    ribbons,
    scale
  };
}

/** Label baselines that never collide: each label sits at its node's centre or `minGap` below the previous one. */
export function spaceLabels(nodes, { minGap = 38, minY = 14 } = {}) {
  let last = -Infinity;
  return nodes.map(node => {
    const centre = node.y + Math.max(node.h, 2) / 2;
    const y = Math.max(centre, last + minGap, minY);
    last = y;
    return y;
  });
}
