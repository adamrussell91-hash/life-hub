/**
 * Screen-space label placement for the miniworld: greedy, highest priority
 * first, trying each candidate's anchors in turn and dropping any label that
 * would overlap one already placed. Zooming in spreads the anchors apart, so
 * more labels fit and hidden ones come back.
 */

export interface LabelCandidate {
  id: string;
  /** One or two lines, drawn centred on the anchor. */
  lines: string[];
  /** Higher places first. */
  priority: number;
  /** Screen-px anchors to try in order; y is the first line's baseline. */
  anchors: { x: number; y: number }[];
  /** Widest line in screen px. */
  width: number;
  lineHeight: number;
  /** Placed at its first anchor even if it collides (hovered / selected). */
  force?: boolean;
}

export interface PlacedLabel {
  candidate: LabelCandidate;
  x: number;
  y: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const PAD = 4;

function boxFor(c: LabelCandidate, x: number, y: number): Box {
  const h = c.lineHeight * c.lines.length;
  return {
    x0: x - c.width / 2 - PAD,
    x1: x + c.width / 2 + PAD,
    y0: y - c.lineHeight * 0.8 - PAD,
    y1: y - c.lineHeight * 0.8 + h + PAD
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * @param blocked — screen rects labels must stay off (the zoom buttons,
 * the key and hint chips floating over the map).
 */
export function placeLabels(
  candidates: LabelCandidate[],
  viewport: { width: number; height: number },
  blocked: ScreenRect[] = []
): PlacedLabel[] {
  const ordered = [...candidates].sort(
    (a, b) => Number(!!b.force) - Number(!!a.force) || b.priority - a.priority || a.id.localeCompare(b.id)
  );
  const placed: PlacedLabel[] = [];
  const boxes: Box[] = blocked.map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height }));
  for (const c of ordered) {
    for (let i = 0; i < c.anchors.length; i += 1) {
      const { x, y } = c.anchors[i];
      const box = boxFor(c, x, y);
      // Clipped labels read as broken, so a label must sit wholly on the map.
      const clipped = box.x0 < 0 || box.y0 < 0 || box.x1 > viewport.width || box.y1 > viewport.height;
      if (!c.force && clipped) continue;
      if (!c.force && boxes.some((b) => overlaps(b, box))) continue;
      placed.push({ candidate: c, x, y });
      boxes.push(box);
      break;
    }
  }
  return placed;
}

/**
 * Break `text` into at most `maxLines` lines no wider than `maxWidth`,
 * ending the last line with an ellipsis when words are left over.
 */
export function wrapLabel(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
  maxLines = 2
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i += 1) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (!line || measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    lines.push(line);
    if (lines.length === maxLines) break;
    line = words[i];
  }
  if (lines.length < maxLines && line) {
    lines.push(line);
    i = words.length;
  }
  if (i < words.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}
