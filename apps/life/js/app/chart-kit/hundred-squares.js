/**
 * hundred-squares — one composition reading as 100 squares, each 1% of body
 * weight: fat fills from the top, skeletal muscle from the bottom, everything
 * else (bone, organs, water) sits between. chart.index picks the reading; the
 * Body page scrubs it and marks the squares that changed.
 */
import { formatDisplayDate } from '../../core/time.js';
import { formatNumber, fx, legend, node, text } from './scene.js';

export const SQUARE_KINDS = ['fat', 'muscle', 'rest'];
/** Wide grid so the chart sits as short as Carved away, not a tall 10×10. */
export const SQUARE_COLS = 20;

/** Kind of each of the 100 squares, row-major from the top left. */
export function squareKinds(squares) {
  return Array.from({ length: 100 }, (_, i) => (
    i < squares.fat ? 'fat' : i >= 100 - squares.muscle ? 'muscle' : 'rest'
  ));
}

export function buildHundredSquares(chart, { width = 520 } = {}) {
  const label = 'Body weight as 100 squares split into fat, skeletal muscle and everything else.';
  if (chart?.status !== 'ready') {
    const readout = chart?.reason ?? 'No composition readings yet.';
    return { width, height: 64, label, readout, nodes: [text(0, 30, readout, { size: 12, cls: 'hc-text hc-text--muted' })], hits: {} };
  }
  const reading = chart.readings[Math.max(0, Math.min(chart.readings.length - 1, chart.index ?? chart.readings.length - 1))];
  const kinds = squareKinds(reading.squares);
  const gap = 2.2;
  const pad = 2;
  const cell = Math.max(7, Math.min(16, (width - pad * 2 - gap * (SQUARE_COLS - 1)) / SQUARE_COLS));
  const rows = Math.ceil(100 / SQUARE_COLS);
  const x0 = pad;
  const y0 = 4;
  const gridH = rows * cell + (rows - 1) * gap;
  const nodes = [];
  const hits = {};

  kinds.forEach((kind, i) => {
    const r = Math.floor(i / SQUARE_COLS);
    const c = i % SQUARE_COLS;
    nodes.push(node('rect', {
      x: fx(x0 + c * (cell + gap)), y: fx(y0 + r * (cell + gap)), width: fx(cell), height: fx(cell), rx: 2, 'data-cell': i
    }, { cls: `bc-cell bc-cell--${kind}`, hit: `sq-${kind}`, anim: 'fade', delay: c * 10 + r * 12, dur: 260 }));
  });

  const pct = n => `${n} square${n === 1 ? '' : 's'}`;
  const kg = n => formatNumber((reading.weightKg * n) / 100, 1);
  hits['sq-fat'] = {
    id: 'sq-fat', title: `Fat · ${pct(reading.squares.fat)}`,
    lines: [`${formatNumber(reading.fatPct, 1)}% of ${formatNumber(reading.weightKg, 1)} kg`, `About ${kg(reading.squares.fat)} kg`],
    detail: `Fat is ${formatNumber(reading.fatPct, 1)}% of your weight on ${formatDisplayDate(reading.date)}.`
  };
  hits['sq-muscle'] = {
    id: 'sq-muscle', title: `Skeletal muscle · ${pct(reading.squares.muscle)}`,
    lines: [`${formatNumber(reading.muscleKg, 1)} kg of ${formatNumber(reading.weightKg, 1)} kg`],
    detail: `Skeletal muscle is ${reading.squares.muscle}% of your weight on ${formatDisplayDate(reading.date)}.`
  };
  hits['sq-rest'] = {
    id: 'sq-rest', title: `Everything else · ${pct(reading.squares.rest)}`,
    lines: ['Bone, organs, water and other lean tissue'],
    detail: 'Everything that is neither fat nor skeletal muscle.'
  };

  const keyY = y0 + gridH + 16;
  nodes.push(text(x0, keyY, `${formatDisplayDate(reading.date)} · ${formatNumber(reading.weightKg, 1)} kg`, { size: 12, weight: 700 }));
  const key = legend([
    ['bc-cell bc-cell--fat', `${reading.squares.fat} fat`],
    ['bc-cell bc-cell--muscle', `${reading.squares.muscle} muscle`],
    ['bc-cell bc-cell--rest', `${reading.squares.rest} else`]
  ], { x: x0, y: keyY + 16, width: width - pad * 2, swatch: [10, 10] });
  nodes.push(...key.nodes);
  nodes.push(text(x0, keyY + 16 + key.height + 6, 'Each square is 1% of your weight.', { size: 10, cls: 'hc-text hc-text--muted' }));
  const height = keyY + 16 + key.height + 18;

  const first = chart.readings[0];
  const share = r => r.squares.muscle;
  return {
    width,
    height,
    label,
    readout: chart.readings.length > 1
      ? `Muscle ${share(first)} → ${share(chart.readings.at(-1))} squares and fat ${first.squares.fat} → ${chart.readings.at(-1).squares.fat} since ${formatDisplayDate(first.date)}. Drag the slider to move between readings.`
      : 'One reading so far. More readings add a slider to move between them.',
    nodes,
    hits
  };
}
