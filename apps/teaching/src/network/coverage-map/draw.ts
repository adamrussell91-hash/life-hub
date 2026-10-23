import type { CoverageMap, MapGroup, MapItem, MapRow } from './model';
import type { NodeState, StudentRoute } from './student';
import './coverage-map.css';

/**
 * Draws the coverage map: week bands, a three-lane route gutter (support,
 * core, extension or option), lesson names with their tags, one branch per
 * item with a coverage bar above it, and an optional student layer.
 */

export type DrawState = {
  collapsed: ReadonlySet<string>;
  selected: string | null;
  focus: string | null;
  student: StudentRoute | null;
  /** Width of the lesson-name column; it gives way so the branches fit. */
  nameW: number;
};

type Lane = { x: number; group: MapGroup; items: MapItem[]; collapsed: boolean; id: string };

export const ROW_H = 24;
const HEAD_H = 150;
const LANE_W = 24;
const X_SUPPORT = 46;
const X_CORE = 68;
const X_SIDE = 90;
const NAME_X = 106;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fit = (s: string, chars: number) => (s.length > chars ? `${s.slice(0, Math.max(1, chars - 1))}…` : s);

const STATE_CLASS: Record<NodeState, string> = {
  struggling: 'cm-st--struggling',
  working: 'cm-st--working',
  secure: 'cm-st--secure',
  none: 'cm-st--none',
  skipped: 'cm-st--skipped',
  ahead: 'cm-st--ahead'
};
const STATE_RANK: NodeState[] = ['struggling', 'working', 'secure', 'none', 'skipped', 'ahead'];
const worst = (states: NodeState[]): NodeState => STATE_RANK.find((s) => states.includes(s)) ?? 'none';

export const isSideRow = (row: MapRow) => row.lane !== 'core' || (row.option !== undefined && row.option !== 'A');
const laneX = (row: MapRow) => (row.lane === 'support' ? X_SUPPORT : row.lane === 'core' ? X_CORE : X_SIDE);
export const rowTag = (row: MapRow): string | undefined =>
  row.lane === 'support' ? 'Support' : row.lane === 'extension' ? 'Extension' : row.option ? `Option ${row.option}` : row.lane === 'option' ? 'Optional' : undefined;
const tagClass = (row: MapRow) => (row.lane === 'support' ? 'support' : row.lane === 'core' ? 'option' : 'side');

/** The widest name column (and so map) that fits `available` pixels, between 120 and 200. */
export function fitNameWidth(map: CoverageMap, collapsed: ReadonlySet<string>, available: number): number {
  const branches = layoutLanes(map, { collapsed, nameW: 0 }).width - NAME_X - 14;
  return Math.max(120, Math.min(200, available - NAME_X - 14 - branches));
}

export function layoutLanes(map: CoverageMap, state: Pick<DrawState, 'collapsed' | 'nameW'>): { lanes: Lane[]; start: number; width: number } {
  const start = NAME_X + state.nameW + 14;
  const lanes: Lane[] = [];
  let slot = 0;
  map.groups.forEach((group, gi) => {
    if (gi) slot += 0.7;
    if (state.collapsed.has(group.id)) {
      lanes.push({ x: start + slot * LANE_W + LANE_W / 2, group, items: group.items, collapsed: true, id: `group:${group.id}` });
      slot++;
    } else {
      for (const item of group.items) {
        lanes.push({ x: start + slot * LANE_W + LANE_W / 2, group, items: [item], collapsed: false, id: item.id });
        slot++;
      }
    }
  });
  return { lanes, start, width: Math.ceil(start + slot * LANE_W + 12) };
}

export function drawCoverageMap(map: CoverageMap, state: DrawState): { svg: string; width: number; height: number } {
  const { rows } = map;
  const { lanes, start, width } = layoutLanes(map, state);
  const height = HEAD_H + rows.length * ROW_H + 8;
  const Y = (i: number) => HEAD_H + i * ROW_H + ROW_H / 2;
  const st = state.student;
  const nameChars = Math.floor(state.nameW / 6.6);
  const out: string[] = [];
  const push = (s: string) => out.push(s);

  /* Week bands and row tints. */
  let band = '';
  let shade = false;
  rows.forEach((row, i) => {
    const top = HEAD_H + i * ROW_H;
    if (row.band && row.band !== band) {
      band = row.band;
      shade = !shade;
      push(`<text class="cm-week" x="4" y="${top + 15}">${esc(row.band.replace('Wk ', 'Wk'))}</text>`);
    }
    if (shade) push(`<rect class="cm-band" x="0" y="${top}" width="${width}" height="${ROW_H}"/>`);
    if (row.lane === 'support') push(`<rect class="cm-tint cm-tint--support" x="34" y="${top + 1}" width="${width - 34}" height="${ROW_H - 2}"/>`);
    else if (isSideRow(row)) push(`<rect class="cm-tint cm-tint--side" x="34" y="${top + 1}" width="${width - 34}" height="${ROW_H - 2}"/>`);
    if (state.selected === row.id) push(`<rect class="cm-selected" x="0" y="${top}" width="${width}" height="${ROW_H}"/>`);
  });

  /* Lane headings for the gutter. */
  push(`<text class="cm-lane cm-lane--support" x="${X_SUPPORT}" y="${HEAD_H - 8}" text-anchor="middle">sup</text>`);
  push(`<text class="cm-lane" x="${X_CORE}" y="${HEAD_H - 8}" text-anchor="middle">core</text>`);
  push(`<text class="cm-lane cm-lane--side" x="${X_SIDE}" y="${HEAD_H - 8}" text-anchor="middle">ext</text>`);

  /* Header: group names, item labels, coverage bars or the student's state. */
  for (const group of map.groups) {
    const mine = lanes.filter((l) => l.group === group);
    if (!mine.length) continue;
    const x0 = mine[0]!.x;
    const x1 = mine[mine.length - 1]!.x;
    const collapsed = state.collapsed.has(group.id);
    push(`<g class="cm-hit" data-group="${esc(group.id)}" role="button" tabindex="0" aria-label="${collapsed ? 'Expand' : 'Collapse'} ${esc(group.name)}">`);
    if (collapsed) {
      // One lane: the name sits at an angle like an item label, so neighbours don't collide.
      push(`<rect x="${x0 - 10}" y="0" width="20" height="104" fill="transparent"/>`);
      push(`<text class="cm-group" transform="translate(${x0 + 3},92) rotate(-60)">${esc(fit(group.name, 13))}</text></g>`);
    } else {
      push(`<rect x="${x0 - 14}" y="0" width="${x1 - x0 + 28}" height="30" fill="transparent"/>`);
      push(`<text class="cm-group" x="${(x0 + x1) / 2}" y="16" text-anchor="middle">${esc(group.name)}</text></g>`);
    }
    push(`<line class="cm-bus" x1="${x0}" y1="26" x2="${x1}" y2="26" style="stroke:${group.items[0]?.colour ?? 'currentColor'}"/>`);
  }
  for (const lane of lanes) {
    const colour = lane.items[0]!.colour;
    if (lane.collapsed) push(`<text class="cm-count" x="${lane.x}" y="104" text-anchor="middle" style="fill:${colour}">${lane.items.length}</text>`);
    else {
      const item = lane.items[0]!;
      push(`<g class="cm-hit" data-item="${esc(item.id)}" role="button" tabindex="0" aria-label="Follow ${esc(item.label)}: ${esc(item.title)}">`);
      push(`<title>${esc(item.label)}: ${esc(item.title)}</title>`);
      push(`<rect x="${lane.x - 10}" y="30" width="20" height="74" fill="transparent"/>`);
      push(`<text class="cm-item${state.focus === item.id ? ' cm-item--on' : ''}" transform="translate(${lane.x + 3},92) rotate(-60)" style="fill:${colour}">${esc(fit(item.label, 9))}</text></g>`);
    }
    if (!st) {
      let core = 0;
      let optional = 0;
      let thin = false;
      if (lane.collapsed) {
        for (const row of rows) {
          if (!lane.items.some((it) => row.teaches.has(it.id))) continue;
          if (isSideRow(row) || row.option) optional++;
          else core++;
        }
        thin = lane.items.some((it) => map.coverage.get(it.id)?.thin);
      } else {
        const c = map.coverage.get(lane.id);
        core = c?.core ?? 0;
        optional = c?.optional ?? 0;
        thin = c?.thin ?? false;
      }
      const hc = Math.min(36, core * 3);
      const ho = Math.min(36 - hc, optional * 3);
      push(`<rect x="${lane.x - 4}" y="${128 - hc}" width="8" height="${hc}" style="fill:${colour}"/>`);
      push(`<rect class="cm-pale" x="${lane.x - 4}" y="${128 - hc - ho}" width="8" height="${ho}" style="fill:${colour}"/>`);
      if (thin && !lane.collapsed) {
        push(`<g class="cm-thin"><title>${core} core ${core === 1 ? 'lesson' : 'lessons'}${optional ? `, ${optional} for some students` : ''}</title>`);
        push(`<circle cx="${lane.x}" cy="${128 - hc - ho - 9}" r="6"/><text x="${lane.x}" y="${128 - hc - ho - 5}" text-anchor="middle">!</text></g>`);
      }
    } else {
      const states = lane.items.map((it) => st.current.get(it.id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
      const starred = lane.items.some((it) => [...st.stars].some((k) => k.endsWith(`|${it.id}`)));
      if (states.length) {
        push(`<circle class="cm-node ${STATE_CLASS[worst(states)]}" cx="${lane.x}" cy="116" r="7"/>`);
        if (starred && worst(states) === 'secure') push(`<text class="cm-star" x="${lane.x}" y="120" text-anchor="middle">★</text>`);
      } else push(`<circle class="cm-node cm-st--none" cx="${lane.x}" cy="116" r="6"/>`);
    }
  }
  push(`<line class="cm-rule" x1="${start}" y1="134" x2="${width - 4}" y2="134"/>`);

  /* Branches. */
  for (const lane of lanes) {
    const dim = state.focus !== null && lane.id !== state.focus;
    const colour = lane.items[0]!.colour;
    const pts = rows
      .map((row, i) => {
        const hits = lane.items.filter((it) => row.teaches.has(it.id));
        if (!hits.length) return null;
        const depth = Math.max(...hits.map((it) => row.teaches.get(it.id)!));
        return { row, i, hits, depth };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    const firstY = pts.length ? Y(pts[0]!.i) : height - 8;
    push(`<line class="cm-sprout${dim ? ' cm-dim' : ''}" x1="${lane.x}" y1="136" x2="${lane.x}" y2="${firstY}" style="stroke:${colour}"/>`);
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      const w = st ? 1.5 : lane.collapsed ? 2.5 : [0, 1.5, 2.5, 4][b.depth];
      const ahead = st !== null && b.i > st.now;
      push(`<line class="cm-branch${dim ? ' cm-dim' : ''}${ahead ? ' cm-ahead' : ''}${st ? ' cm-branch--quiet' : ''}" x1="${lane.x}" y1="${Y(a.i)}" x2="${lane.x}" y2="${Y(b.i)}" style="stroke:${colour};stroke-width:${w}"/>`);
    }
    for (const p of pts) {
      const x = lane.x;
      const y = Y(p.i);
      const side = isSideRow(p.row);
      const ring = p.row.lane === 'support' ? ' cm-node--support' : side ? ' cm-node--side' : '';
      push(`<g class="cm-hit${dim ? ' cm-dim' : ''}" data-row="${esc(p.row.id)}">`);
      if (!st) {
        const r = lane.collapsed ? Math.min(8, 3.5 + p.hits.length * 1.3) : [0, 4, 5.5, 7][p.depth]!;
        if (state.selected === p.row.id) push(`<circle class="cm-pick" cx="${x}" cy="${y}" r="${r + 4}"/>`);
        const hollow = !lane.collapsed && p.depth === 1;
        push(`<circle class="cm-node${hollow ? ' cm-node--hollow' : ''}${ring}" cx="${x}" cy="${y}" r="${r}" style="${hollow ? `stroke:${colour}` : `fill:${colour};stroke:${colour}`}"/>`);
        if (lane.collapsed && p.hits.length > 1) push(`<text class="cm-node-n" x="${x}" y="${y + 3.5}" text-anchor="middle">${p.hits.length}</text>`);
      } else {
        const states = p.hits.map((it) => st.nodes.get(`${p.row.id}|${it.id}`) ?? 'none');
        const s = worst(states);
        const star = p.hits.some((it) => st.stars.has(`${p.row.id}|${it.id}`));
        if (state.selected === p.row.id) push(`<circle class="cm-pick cm-pick--ink" cx="${x}" cy="${y}" r="10"/>`);
        if (star) push(`<circle class="cm-node cm-st--mastered" cx="${x}" cy="${y}" r="8"/><text class="cm-star" x="${x}" y="${y + 4}" text-anchor="middle">★</text>`);
        else push(`<circle class="cm-node ${STATE_CLASS[s]}" cx="${x}" cy="${y}" r="${s === 'struggling' ? 6.5 : s === 'none' || s === 'skipped' || s === 'ahead' ? 3.5 : 5}"/>`);
      }
      push('</g>');
    }
  }

  /* Route gutter: the core line, then detours and options looping out and back. */
  const coreIdx = rows.map((r, i) => (isSideRow(r) ? -1 : i)).filter((i) => i >= 0);
  const fadeAfter = (i: number) => st !== null && i > st.now;
  for (let k = 0; k + 1 < coreIdx.length; k++) {
    const a = coreIdx[k]!;
    const b = coreIdx[k + 1]!;
    push(`<line class="cm-route${fadeAfter(b) ? ' cm-ahead' : ''}" x1="${X_CORE}" y1="${Y(a)}" x2="${X_CORE}" y2="${Y(b)}"/>`);
  }
  for (let i = 0; i < rows.length; ) {
    const row = rows[i]!;
    if (!isSideRow(row)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < rows.length && isSideRow(rows[j + 1]!) && laneX(rows[j + 1]!) === laneX(row)) j++;
    const before = [...coreIdx].reverse().find((c) => c < i);
    const after = coreIdx.find((c) => c > j);
    const x = laneX(row);
    const ya = before !== undefined ? Y(before) : Y(i) - ROW_H / 2;
    const yb = after !== undefined ? Y(after) : Y(j) + ROW_H / 2;
    const xa = before !== undefined ? X_CORE : x;
    const xb = after !== undefined ? X_CORE : x;
    const took = st ? rows.slice(i, j + 1).some((r) => st.took.has(r.id)) : false;
    const skipped = st ? !took && i <= st.now : false;
    const cls = `cm-detour cm-detour--${row.lane === 'support' ? 'support' : 'side'}${took ? ' cm-detour--took' : ''}${skipped ? ' cm-skip' : ''}${st && i > st.now ? ' cm-ahead' : ''}`;
    push(`<path class="${cls}" d="M${xa} ${ya} C${xa} ${ya + 8},${x} ${Y(i) - 10},${x} ${Y(i)} L${x} ${Y(j)} C${x} ${Y(j) + 10},${xb} ${yb - 8},${xb} ${yb}"/>`);
    i = j + 1;
  }

  /* Stations and names. */
  rows.forEach((row, i) => {
    const x = laneX(row);
    const y = Y(i);
    const side = isSideRow(row);
    const took = st?.took.has(row.id) ?? false;
    const faded = st !== null && (i > st.now || (side && !took));
    const here = st !== null && i === st.now;
    const cls = `cm-station${row.lane === 'support' ? ' cm-station--support' : side ? ' cm-station--side' : ''}${state.selected === row.id ? ' cm-station--on' : ''}${st && took && side ? ' cm-station--took' : ''}${here ? ' cm-station--here' : ''}`;
    push(`<g class="cm-hit cm-row${faded ? ' cm-faded' : ''}" data-row="${esc(row.id)}" role="button" tabindex="0" aria-label="${esc(row.title)}">`);
    push(`<rect x="34" y="${HEAD_H + i * ROW_H}" width="${start - 40}" height="${ROW_H}" fill="transparent"/>`);
    if (row.kind === 'check') push(`<rect class="${cls}" x="${x - 5}" y="${y - 5}" width="10" height="10" transform="rotate(45 ${x} ${y})"/>`);
    else if (row.kind === 'goal') push(`<rect class="${cls}" x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2"/>`);
    else push(`<circle class="${cls}" cx="${x}" cy="${y}" r="${side ? 4.5 : 5}"/>`);
    const tag = rowTag(row);
    let tx = NAME_X;
    if (tag) {
      const tw = tag.length * 6 + 10;
      push(`<rect class="cm-tag cm-tag--${tagClass(row)}" x="${tx}" y="${y - 8}" width="${tw}" height="16" rx="4"/><text class="cm-tag-text" x="${tx + tw / 2}" y="${y + 4}" text-anchor="middle">${tag}</text>`);
      tx += tw + 5;
    }
    const room = Math.max(6, nameChars - Math.round((tx - NAME_X) / 6.3));
    push(`<text class="cm-name${side || row.kind === 'check' ? ' cm-name--quiet' : ''}" x="${tx}" y="${y + 4}">${esc(fit(row.title, room))}</text>`);
    const score = st?.scores.get(row.id);
    if (score && score.max > 0) {
      const pct = Math.round((score.score / score.max) * 100);
      push(`<text class="cm-score${pct < 70 ? ' cm-score--low' : ''}" x="${start - 8}" y="${y + 4}" text-anchor="end">${pct}%</text>`);
    }
    push('</g>');
  });

  return { svg: out.join(''), width, height };
}
