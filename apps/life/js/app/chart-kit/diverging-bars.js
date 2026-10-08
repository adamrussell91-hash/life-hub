/**
 * Diverging bars (`diverging-bars`): signed values either side of a zero line,
 * with an optional dashed "ghost" segment showing what moved a bar.
 * Used on Life → Property (tax result: as recorded vs corrected).
 */

function niceStep(span) {
  const raw = span / 4;
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

/**
 * @param {{ key: string, value: number, from?: number }[]} rows  `from` draws a ghost from `from` to `value`
 * @param {{ width?: number, left?: number, right?: number }} options  `left` reserves label space
 */
export function buildDivergingBars(rows, { width = 560, left = 150, right = 16 } = {}) {
  const values = rows.flatMap(row => [row.value, row.from ?? 0, 0]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const step = niceStep(Math.max(rawMax - rawMin, 1));
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step || step;
  const span = max - min || 1;
  const x = value => left + ((value - min) / span) * (width - left - right);
  const ticks = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push({ value, x: x(value) });
  return {
    zeroX: x(0),
    ticks,
    x,
    bars: rows.map(row => {
      const a = x(Math.min(0, row.value));
      const b = x(Math.max(0, row.value));
      // The ghost covers only the part of the move the solid bar doesn't already show.
      const near = row.from === undefined ? null : row.from > 0 && row.value < 0 ? 0 : row.from < 0 && row.value > 0 ? 0 : row.value;
      const ghost = row.from === undefined ? null : { x: Math.min(x(row.from), x(near)), width: Math.abs(x(row.from) - x(near)) };
      return { key: row.key, value: row.value, x: a, width: Math.max(b - a, 1), positive: row.value >= 0, ghost };
    })
  };
}
