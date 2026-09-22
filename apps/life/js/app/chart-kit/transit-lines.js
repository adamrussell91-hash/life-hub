/**
 * Transit lines — promoted from the parked weight-line.
 * A project is a line. Tasks are stations. Geometry only; Tasks paints the page.
 */
import { fx, node, text } from './scene.js';

export const TRANSIT_STATION_R = 7;
export const TRANSIT_MILESTONE_R = 11;
export const TRANSIT_LINE_Y = 36;
export const TRANSIT_PAD_X = 28;

function stationX(index, count, width) {
  if (count <= 1) return width / 2;
  return TRANSIT_PAD_X + (index / (count - 1)) * (width - TRANSIT_PAD_X * 2);
}

export function buildTransitLine(input, { width = 720, height = 88, scale = false } = {}) {
  const stations = input.stations ?? [];
  const count = Math.max(1, stations.length);
  const dates = stations.map((s) => s.dateKey).filter(Boolean);
  const min = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  const max = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  const y = TRANSIT_LINE_Y;
  const placed = stations.map((station, index) => {
    let x = stationX(index, count, width);
    if (scale && min && max && station.dateKey) {
      const span = Math.max(1, Date.parse(`${max}T00:00:00Z`) - Date.parse(`${min}T00:00:00Z`));
      const t = (Date.parse(`${station.dateKey}T00:00:00Z`) - Date.parse(`${min}T00:00:00Z`)) / span;
      x = TRANSIT_PAD_X + t * (width - TRANSIT_PAD_X * 2);
    }
    return { ...station, x, y, r: station.kind === 'milestone' ? TRANSIT_MILESTONE_R : TRANSIT_STATION_R };
  });
  const path = placed.map((s, i) => `${i ? 'L' : 'M'}${fx(s.x)} ${fx(s.y)}`).join(' ');
  const nodes = [
    node('path', { d: path, fill: 'none' }, { cls: 'tl-track', anim: 'draw', delay: input.delay ?? 0, dur: 600 }),
    ...placed.map((s, i) =>
      node('circle', { cx: fx(s.x), cy: fx(s.y), r: s.r }, {
        cls: `tl-station tl-station--${s.state ?? 'open'}`,
        hit: s.id,
        anim: 'grow',
        delay: (input.delay ?? 0) + i * 40,
        origin: [s.x, s.y]
      })
    )
  ];
  if (input.terminusLabel) {
    const last = placed[placed.length - 1];
    if (last) {
      nodes.push(text(last.x + 18, y + 4, input.terminusLabel, { size: 11, cls: 'tl-terminus' }));
    }
  }
  return {
    width,
    height,
    label: input.label ?? 'Transit line',
    stations: placed,
    path,
    nodes,
    hits: placed.map((s) => ({ id: s.id, title: s.title }))
  };
}

export function wrapTransitStations(stations, width, rowGap = 56) {
  const usable = Math.max(160, width - TRANSIT_PAD_X * 2);
  const spacing = 56;
  const perRow = Math.max(2, Math.floor(usable / spacing));
  const rows = [];
  for (let i = 0; i < stations.length; i += perRow) {
    rows.push(stations.slice(i, i + perRow));
  }
  const points = [];
  rows.forEach((row, r) => {
    const y = TRANSIT_LINE_Y + r * rowGap;
    const reverse = r % 2 === 1;
    const ordered = reverse ? [...row].reverse() : row;
    ordered.forEach((station, i) => {
      const x = stationX(i, Math.max(row.length, 2), width);
      points.push({ ...station, x, y, row: r });
    });
  });
  return points;
}
