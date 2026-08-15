export function packMasonry(items, { columns, gap, columnWidth }) {
  const colHeights = Array(columns).fill(0);
  const packed = [];

  for (const item of items) {
    const span = Math.min(Math.max(1, item.span || 1), columns);
    let columnIndex = 0;
    let y = Infinity;

    for (let start = 0; start <= columns - span; start++) {
      const top = Math.max(...colHeights.slice(start, start + span));
      if (top < y) {
        y = top;
        columnIndex = start;
      }
    }

    const width = columnWidth * span + gap * (span - 1);
    packed.push({
      id: item.id,
      x: columnIndex * (columnWidth + gap),
      y,
      width,
      height: item.height,
      span
    });

    const nextHeight = y + item.height + gap;
    for (let i = columnIndex; i < columnIndex + span; i++) {
      colHeights[i] = nextHeight;
    }
  }

  return packed;
}
