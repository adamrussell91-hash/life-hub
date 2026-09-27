import {
  assignEmploymentLanes,
  axisYearTicks,
  branchColour,
  branchPolyline,
  clampZoom,
  clusterMarks,
  pathFromPoints,
  riverHeightPx,
  roleBandExtraPx,
  timeToUnit,
  yearFraction,
  type RiverOrientation,
  type RiverZoom
} from '@/domain/career-river-geometry';
import type { CareerModel } from '@/domain/career-model';
import { careerFutureRoute } from '@/app/router';

type RiverState = {
  zoom: RiverZoom;
  orientation: RiverOrientation;
  width: number;
  selectedId: string | null;
  hoverId: string | null;
  locked: boolean;
  drag: {
    x0: number;
    y0: number;
    from0: number;
    to0: number;
    armed: boolean;
  } | null;
  pinch: { dist0: number; from0: number; to0: number } | null;
};

const stateByHost = new WeakMap<HTMLElement, RiverState>();

function svgEl(name: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function careerBounds(model: CareerModel, nowYear: number): { from: number; to: number } {
  const years: number[] = [nowYear - 3, nowYear + 3];
  for (const e of model.employment) {
    if (e.valid_from) years.push(yearFraction(e.valid_from));
    if (e.valid_to) years.push(yearFraction(e.valid_to));
  }
  for (const item of model.trunk_items) {
    years.push(yearFraction(item.occurred_on));
  }
  for (const f of model.futures) {
    if (f.arrival_date) years.push(yearFraction(f.arrival_date));
    years.push(nowYear + 5);
  }
  const finite = years.filter((y) => Number.isFinite(y));
  return {
    from: Math.floor(Math.min(...finite, nowYear - 1)),
    to: Math.ceil(Math.max(...finite, nowYear + 1))
  };
}

function presetZoom(
  key: 'whole' | 'pm3' | 'next3',
  bounds: { from: number; to: number },
  nowYear: number
): RiverZoom {
  if (key === 'whole') return { from: bounds.from, to: bounds.to };
  if (key === 'pm3') return { from: nowYear - 3, to: nowYear + 3 };
  return { from: nowYear, to: nowYear + 3 };
}

function activePreset(
  zoom: RiverZoom,
  bounds: { from: number; to: number },
  nowYear: number
): 'whole' | 'pm3' | 'next3' | null {
  const whole = presetZoom('whole', bounds, nowYear);
  const pm3 = presetZoom('pm3', bounds, nowYear);
  const next3 = presetZoom('next3', bounds, nowYear);
  const near = (a: RiverZoom, b: RiverZoom) =>
    Math.abs(a.from - b.from) < 0.05 && Math.abs(a.to - b.to) < 0.05;
  if (near(zoom, whole)) return 'whole';
  if (near(zoom, pm3)) return 'pm3';
  if (near(zoom, next3)) return 'next3';
  return null;
}

function shortName(title: string): string {
  const parts = title.trim().split(/\s+/);
  if (parts.length <= 1) return title;
  if (/^(head|deputy|leader|director|principal)\b/i.test(title)) {
    return parts.slice(0, 2).join(' ');
  }
  return parts[0]!;
}

/**
 * Full-bleed Career river. Re-renders on ResizeObserver and orientation change.
 */
export function mountCareerRiver(
  host: HTMLElement,
  model: CareerModel,
  options: { selectedFutureId?: string | null; onSelectFuture?: (id: string | null) => void } = {}
): { destroy: () => void } {
  const nowYear = yearFraction(model.now);
  const bounds = careerBounds(model, nowYear);
  let state = stateByHost.get(host);
  if (!state) {
    state = {
      zoom: clampZoom(presetZoom('pm3', bounds, nowYear), bounds.from, bounds.to),
      orientation: window.matchMedia('(min-width: 720px)').matches ? 'horizontal' : 'vertical',
      width: 0,
      selectedId: options.selectedFutureId ?? null,
      hoverId: null,
      locked: false,
      drag: null,
      pinch: null
    };
    stateByHost.set(host, state);
  } else if (options.selectedFutureId !== undefined) {
    state.selectedId = options.selectedFutureId;
  }

  const mq = window.matchMedia('(min-width: 720px)');
  const onMq = () => {
    state!.orientation = mq.matches ? 'horizontal' : 'vertical';
    paint();
  };
  mq.addEventListener?.('change', onMq);

  const toolbar = document.createElement('div');
  toolbar.className = 'career-river__toolbar';
  const pills = document.createElement('div');
  pills.className = 'hub-pills career-river__pills';
  pills.setAttribute('role', 'group');
  pills.setAttribute('aria-label', 'Career zoom');

  const legend = document.createElement('div');
  legend.className = 'career-river__legend';
  legend.setAttribute('role', 'list');

  const axisNote = document.createElement('p');
  axisNote.className = 'career-river__axis-note';

  const svgHost = document.createElement('div');
  svgHost.className = 'career-river__svg-host';

  host.replaceChildren();
  host.className = 'career-river';
  host.append(toolbar, svgHost, axisNote, legend);

  function setZoom(next: RiverZoom): void {
    state!.zoom = clampZoom(next, bounds.from, bounds.to);
    paint();
  }

  function selectFuture(id: string | null, navigate = false): void {
    state!.selectedId = id;
    options.onSelectFuture?.(id);
    if (navigate && id) location.hash = careerFutureRoute(id);
    else if (navigate && !id) location.hash = '#/career';
    paint();
  }

  function paintToolbar(): void {
    toolbar.replaceChildren();
    pills.replaceChildren();
    const active = activePreset(state!.zoom, bounds, nowYear);
    const entries: Array<{ key: 'whole' | 'pm3' | 'next3'; label: string }> = [
      { key: 'whole', label: 'Whole career' },
      { key: 'pm3', label: '±3 years' },
      { key: 'next3', label: 'Next 3 years' }
    ];
    for (const entry of entries) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hub-pills__btn';
      btn.textContent = entry.label;
      const on = active === entry.key;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.addEventListener('click', () => {
        setZoom(presetZoom(entry.key, bounds, nowYear));
      });
      pills.append(btn);
    }
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'btn btn--ghost';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Zoom out');
    minus.addEventListener('click', () => {
      const span = state!.zoom.to - state!.zoom.from;
      const mid = (state!.zoom.from + state!.zoom.to) / 2;
      setZoom({ from: mid - (span * 1.25) / 2, to: mid + (span * 1.25) / 2 });
    });
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'btn btn--ghost';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Zoom in');
    plus.addEventListener('click', () => {
      const span = state!.zoom.to - state!.zoom.from;
      const mid = (state!.zoom.from + state!.zoom.to) / 2;
      setZoom({ from: mid - (span / 1.25) / 2, to: mid + (span / 1.25) / 2 });
    });
    const nowBtn = document.createElement('button');
    nowBtn.type = 'button';
    nowBtn.className = 'btn btn--ghost';
    nowBtn.textContent = 'Back to now';
    nowBtn.addEventListener('click', () => {
      setZoom(presetZoom('pm3', bounds, nowYear));
    });
    if (state!.orientation === 'vertical') {
      const zoomSheet = document.createElement('button');
      zoomSheet.type = 'button';
      zoomSheet.className = 'btn btn--secondary';
      zoomSheet.textContent = 'Zoom';
      zoomSheet.addEventListener('click', () => {
        pills.hidden = !pills.hidden;
      });
      toolbar.append(zoomSheet, minus, plus, nowBtn);
      pills.hidden = true;
      toolbar.append(pills);
    } else {
      toolbar.append(pills, minus, plus, nowBtn);
    }
  }

  function paintLegend(): void {
    legend.replaceChildren();
    const chips: HTMLButtonElement[] = [];
    for (const future of model.futures) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'career-river__chip';
      chip.setAttribute('role', 'listitem');
      chip.style.setProperty('--chip-color', branchColour(future.colour_slot));
      if (future.status === 'suggested') chip.classList.add('career-river__chip--suggested');
      if (future.fading) chip.classList.add('career-river__chip--fading');
      chip.classList.toggle('is-selected', state!.selectedId === future.id);
      const fadingNote = future.fading ? ' · fading' : '';
      chip.textContent = `${shortName(future.title)} · ${future.readiness_label}${fadingNote}`;
      chip.addEventListener('click', () => {
        if (state!.locked && state!.selectedId === future.id) {
          state!.locked = false;
          selectFuture(null, true);
          return;
        }
        state!.locked = true;
        selectFuture(future.id, true);
      });
      chip.addEventListener('mouseenter', () => {
        if (state!.locked) return;
        state!.hoverId = future.id;
        paintSvg();
      });
      chip.addEventListener('mouseleave', () => {
        if (state!.locked) return;
        state!.hoverId = null;
        paintSvg();
      });
      chips.push(chip);
      legend.append(chip);
    }
    for (const parked of model.parked_futures) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'career-river__chip career-river__chip--parked';
      chip.textContent = `Parked: ${parked.title} · restore`;
      legend.append(chip);
    }
    legend.onkeydown = (event: KeyboardEvent) => {
      const active = model.futures;
      if (!active.length) return;
      const idx = Math.max(
        0,
        active.findIndex((f) => f.id === (state!.selectedId || state!.hoverId))
      );
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const next = active[(idx + 1) % active.length]!;
        selectFuture(next.id, true);
        chips[(idx + 1) % chips.length]?.focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = active[(idx - 1 + active.length) % active.length]!;
        selectFuture(prev.id, true);
        chips[(idx - 1 + chips.length) % chips.length]?.focus();
      } else if (event.key === 'Enter' && state!.selectedId) {
        event.preventDefault();
        location.hash = careerFutureRoute(state!.selectedId);
      }
    };
  }

  function paintSvg(): void {
    const width = Math.max(320, svgHost.clientWidth || state!.width || 800);
    state!.width = width;
    const futures = model.futures;
    const yearsInView = Math.max(1, state!.zoom.to - state!.zoom.from);
    const isHorizontal = state!.orientation === 'horizontal';
    const employmentJobs = isHorizontal
      ? model.employment.filter(
          (job): job is typeof job & { valid_from: string } => Boolean(job.valid_from)
        )
      : [];
    const employmentLanes = assignEmploymentLanes(employmentJobs);
    const laneCount = employmentLanes.length ? Math.max(...employmentLanes) + 1 : 0;
    const bandExtra = roleBandExtraPx(laneCount);
    const height =
      riverHeightPx(state!.orientation, futures.length, yearsInView) + bandExtra;
    const labelGutter = isHorizontal ? 200 : 48;
    const lengthPx = isHorizontal
      ? Math.max(100, width - labelGutter)
      : Math.max(100, height - 80);
    const midPx = isHorizontal ? (height - bandExtra) / 2 : width / 2;
    const nowU = timeToUnit(nowYear, state!.zoom, nowYear);
    const focusId = state!.hoverId || state!.selectedId;

    const svg = svgEl('svg', {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      class: 'career-river__svg',
      role: 'img',
      'aria-label': 'Career river'
    });

    // Headers
    const pastLabel = svgEl('text', {
      x: state!.orientation === 'horizontal' ? 8 : midPx,
      y: state!.orientation === 'horizontal' ? 18 : height - 12,
      fill: 'var(--muted)',
      'font-size': 11,
      'font-family': 'inherit'
    });
    pastLabel.textContent = 'What happened';
    svg.appendChild(pastLabel);
    const futureLabel = svgEl('text', {
      x:
        state!.orientation === 'horizontal'
          ? Math.min(width - 8, nowU * lengthPx + 12)
          : midPx,
      y: state!.orientation === 'horizontal' ? 18 : 18,
      fill: 'var(--muted)',
      'font-size': 11,
      'font-family': 'inherit',
      'text-anchor': state!.orientation === 'horizontal' ? 'start' : 'middle'
    });
    futureLabel.textContent = 'What could';
    svg.appendChild(futureLabel);

    // Role band (desktop): stacked bars only — Work list below is the reading surface.
    if (isHorizontal) {
      const bandBaseY = midPx + 20;
      const laneH = 14;
      for (let index = 0; index < employmentJobs.length; index++) {
        const job = employmentJobs[index]!;
        const u0 = timeToUnit(yearFraction(job.valid_from), state!.zoom, nowYear);
        const u1 = timeToUnit(
          yearFraction(job.valid_to || model.now),
          state!.zoom,
          nowYear
        );
        const x0 = Math.max(0, Math.min(lengthPx, u0 * lengthPx));
        const x1 = Math.max(0, Math.min(lengthPx, u1 * lengthPx));
        if (x1 - x0 < 4) continue;
        const bar = svgEl('rect', {
          x: x0,
          y: bandBaseY + (employmentLanes[index] ?? 0) * laneH,
          width: x1 - x0,
          height: 8,
          fill: 'var(--line)',
          stroke: 'var(--ink)',
          'stroke-width': 0.5,
          'stroke-opacity': 0.25,
          rx: 2
        });
        const tip =
          [job.role, job.display_label || job.label]
            .map((part) => (part || '').trim())
            .filter(Boolean)
            .join(' · ') || 'Role';
        const title = svgEl('title');
        title.textContent = tip;
        bar.appendChild(title);
        svg.appendChild(bar);
      }
    }

    // Trunk
    const trunkStart = Math.min(
      ...[
        nowYear - 1,
        ...model.employment.map((e) => (e.valid_from ? yearFraction(e.valid_from) : nowYear))
      ].filter(Number.isFinite)
    );
    const trunkU0 = timeToUnit(trunkStart, state!.zoom, nowYear);
    const trunkPts =
      state!.orientation === 'horizontal'
        ? [
            { x: trunkU0 * lengthPx, y: midPx },
            { x: nowU * lengthPx, y: midPx }
          ]
        : [
            { x: midPx, y: (1 - trunkU0) * lengthPx },
            { x: midPx, y: (1 - nowU) * lengthPx }
          ];
    svg.appendChild(
      svgEl('path', {
        d: pathFromPoints(trunkPts),
        fill: 'none',
        stroke: '#17375e',
        'stroke-width': state!.orientation === 'vertical' ? 11 : 13,
        'stroke-linecap': 'round'
      })
    );

    // Now line + label (top of dashed line — bottom row is for year axis ticks)
    const nowLine =
      state!.orientation === 'horizontal'
        ? `M${nowU * lengthPx} 24 L${nowU * lengthPx} ${height - 28}`
        : `M28 ${(1 - nowU) * lengthPx} L${width - 24} ${(1 - nowU) * lengthPx}`;
    svg.appendChild(
      svgEl('path', {
        d: nowLine,
        fill: 'none',
        stroke: 'var(--ink)',
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
        'stroke-opacity': '0.45'
      })
    );
    const nowText = svgEl('text', {
      x: state!.orientation === 'horizontal' ? nowU * lengthPx + 6 : 32,
      y: state!.orientation === 'horizontal' ? 34 : (1 - nowU) * lengthPx - 8,
      fill: 'var(--ink)',
      'font-size': 11,
      'font-family': 'inherit',
      'font-weight': 600,
      'data-part': 'now-label'
    });
    const nowTerm =
      model.futures[0]?.split_label?.replace(/^~/, '') ||
      (() => {
        const m = new Date(`${model.now}T12:00:00Z`).getUTCMonth() + 1;
        const y = new Date(`${model.now}T12:00:00Z`).getUTCFullYear();
        const term = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
        return `T${term} ${y}`;
      })();
    nowText.textContent = `Now · ${nowTerm}`;
    svg.appendChild(nowText);

    // Year / axis row — same job as Tasks timeline term/week axis labels.
    for (const year of axisYearTicks(state!.zoom)) {
      const u = timeToUnit(year, state!.zoom, nowYear);
      if (u < -0.02 || u > 1.02) continue;
      if (isHorizontal) {
        const x = u * lengthPx;
        svg.appendChild(
          svgEl('line', {
            x1: x,
            y1: height - 26,
            x2: x,
            y2: height - 22,
            stroke: 'var(--line)',
            'stroke-width': 1,
            'data-part': 'axis-tick'
          })
        );
        const label = svgEl('text', {
          x,
          y: height - 8,
          fill: 'var(--muted)',
          'font-size': 11,
          'font-family': 'inherit',
          'font-variant-numeric': 'tabular-nums',
          'text-anchor': 'middle',
          'data-part': 'axis-year',
          class: 'career-river__axis-year'
        });
        label.textContent = String(year);
        svg.appendChild(label);
      } else {
        const y = (1 - u) * lengthPx;
        const label = svgEl('text', {
          x: 6,
          y: y + 4,
          fill: 'var(--muted)',
          'font-size': 10,
          'font-family': 'inherit',
          'font-variant-numeric': 'tabular-nums',
          'data-part': 'axis-year',
          class: 'career-river__axis-year'
        });
        label.textContent = String(year);
        svg.appendChild(label);
      }
    }

    // Branch paths + labels
    const labelBoxes: Array<{ x: number; y: number; w: number; h: number; el: SVGElement }> = [];
    const sorted = [...futures].sort((a, b) => a.lane_order - b.lane_order);
    sorted.forEach((future, index) => {
      const colour =
        future.fading && future.status !== 'suggested'
          ? 'var(--career-fading)'
          : branchColour(future.colour_slot);
      const readiness = future.readiness ?? 0;
      const strokeW = 2 + (readiness / 100) * 9;
      const splitU = timeToUnit(yearFraction(future.split_date), state!.zoom, nowYear);
      const arrivalU = future.arrival_date
        ? timeToUnit(yearFraction(future.arrival_date), state!.zoom, nowYear)
        : Math.min(1, splitU + 0.2);
      const half = (state!.orientation === 'horizontal' ? height : width) / 2;
      const laneY =
        sorted.length <= 1
          ? 0
          : ((index / Math.max(1, sorted.length - 1)) * 2 - 1) * 0.86 * (half * 0.7);
      const bundleY = (index + 1) * 0.022 * half;
      const pts = branchPolyline({
        orientation: state!.orientation,
        lengthPx,
        midPx,
        nowUnit: nowU,
        splitUnit: splitU,
        arrivalUnit: arrivalU,
        laneY,
        bundleY
      });
      const op = focusId && focusId !== future.id ? 0.28 : future.fading ? 0.38 : 1;
      const path = svgEl('path', {
        d: pathFromPoints(pts),
        fill: 'none',
        stroke: colour,
        'stroke-width': strokeW,
        'stroke-opacity': op,
        'stroke-linecap': 'round'
      });
      if (future.status === 'suggested') path.setAttribute('stroke-dasharray', '2 6');
      svg.appendChild(path);

      // Cap
      const tip = pts[pts.length - 1]!;
      svg.appendChild(
        svgEl('circle', {
          cx: tip.x,
          cy: tip.y,
          r: 5,
          fill: colour,
          stroke: 'var(--paper)',
          'stroke-width': 1.5,
          'fill-opacity': op
        })
      );

      // Stones on this branch
      for (const stone of model.stones.filter((s) => s.future_ids.includes(future.id))) {
        if (!stone.target_term_start) continue;
        const su = timeToUnit(yearFraction(stone.target_term_start), state!.zoom, nowYear);
        const t = Math.min(
          1,
          Math.max(0, (su - splitU) / Math.max(0.001, arrivalU - splitU))
        );
        const sx =
          state!.orientation === 'horizontal'
            ? su * lengthPx
            : midPx + bundleY + (laneY - bundleY) * t;
        const sy =
          state!.orientation === 'horizontal'
            ? midPx + bundleY + (laneY - bundleY) * Math.min(1, Math.max(0, (su - splitU) / Math.max(0.001, arrivalU - splitU)))
            : (1 - su) * lengthPx;
        if (stone.shared) {
          svg.appendChild(
            svgEl('circle', {
              cx: sx,
              cy: sy,
              r: 7,
              fill: stone.done ? colour : 'var(--paper)',
              stroke: colour,
              'stroke-width': 2
            })
          );
          const st = svgEl('text', {
            x: sx,
            y: sy + 3,
            'text-anchor': 'middle',
            fill: stone.done ? 'var(--paper)' : colour,
            'font-size': 9,
            'font-family': 'inherit'
          });
          st.textContent = String(stone.helps_count);
          svg.appendChild(st);
        } else {
          const d = `M${sx} ${sy - 6} L${sx + 6} ${sy} L${sx} ${sy + 6} L${sx - 6} ${sy} Z`;
          svg.appendChild(
            svgEl('path', {
              d,
              fill: stone.done ? colour : 'var(--paper)',
              stroke: colour,
              'stroke-width': 1.5
            })
          );
        }
      }

      // Label
      const isVert = state!.orientation === 'vertical';
      let labelText = isVert
        ? `${shortName(future.title)} · ${future.readiness_label}`
        : `${future.title} · ${future.readiness_label}${future.arrival_label ? ` · ${future.arrival_label}` : ''}`;
      let lx = isVert ? tip.x : tip.x + 10;
      let ly = isVert ? tip.y - 10 : tip.y + 4;
      const approxW = Math.min(isVert ? 90 : 190, labelText.length * 6.2);
      for (const box of labelBoxes) {
        if (Math.abs(ly - box.y) < 14 && Math.abs(lx - box.x) < approxW) {
          ly = box.y + (ly >= box.y ? 14 : -14);
        }
      }
      if (lx + approxW > width - 4) {
        labelText = `${shortName(future.title)} · ${future.readiness_label}`;
      }
      if (ly < 12 || ly > height - 8) {
        // hide into title attribute only
      } else {
        const label = svgEl('text', {
          x: lx,
          y: ly,
          fill: colour,
          'font-size': 11,
          'font-family': 'inherit',
          'font-weight': 600,
          'fill-opacity': op,
          'text-anchor': isVert ? 'middle' : 'start'
        });
        label.textContent = labelText;
        label.setAttribute('title', future.title);
        svg.appendChild(label);
        labelBoxes.push({ x: lx, y: ly, w: approxW, h: 12, el: label });
      }

      const hit = svgEl('path', {
        d: pathFromPoints(pts),
        fill: 'none',
        stroke: 'transparent',
        'stroke-width': Math.max(18, strokeW + 10)
      });
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', () => {
        if (state!.locked && state!.selectedId === future.id) {
          state!.locked = false;
          selectFuture(null, true);
          return;
        }
        state!.locked = true;
        selectFuture(future.id, true);
      });
      hit.addEventListener('mouseenter', () => {
        if (state!.locked) return;
        state!.hoverId = future.id;
        paintSvg();
      });
      hit.addEventListener('mouseleave', () => {
        if (state!.locked) return;
        state!.hoverId = null;
        paintSvg();
      });
      svg.appendChild(hit);
    });

    // Skill dots + clusters
    const marks = model.trunk_items.map((item) => ({
      id: item.id,
      unit: timeToUnit(yearFraction(item.occurred_on), state!.zoom, nowYear),
      title: item.title,
      future_ids: item.future_ids ?? []
    }));
    const clusters = clusterMarks(marks, lengthPx, 10);
    for (const cluster of clusters) {
      const cx = state!.orientation === 'horizontal' ? cluster.unit * lengthPx : midPx;
      const cy =
        state!.orientation === 'horizontal' ? midPx : (1 - cluster.unit) * lengthPx;
      const supportsFocus =
        focusId &&
        cluster.ids.some((id) => {
          const item = marks.find((m) => m.id === id);
          return item?.future_ids.includes(focusId);
        });
      const dimmed = Boolean(focusId) && !supportsFocus;
      const grow = Boolean(supportsFocus);
      const fill = grow
        ? branchColour(
            sorted.find((f) => f.id === focusId)?.colour_slot ?? 1
          )
        : dimmed
          ? 'var(--career-fading)'
          : '#17375e';
      const r = grow ? (cluster.count > 1 ? 12 : 7) : dimmed ? 3.5 : cluster.count > 1 ? 10 : 5;
      const g = svgEl('g');
      g.style.cursor = 'pointer';
      g.appendChild(
        svgEl('circle', {
          cx,
          cy,
          r,
          fill,
          stroke: 'var(--paper)',
          'stroke-width': 2
        })
      );
      if (cluster.count > 1) {
        const t = svgEl('text', {
          x: cx,
          y: cy + 4,
          'text-anchor': 'middle',
          fill: 'var(--paper)',
          'font-size': 10,
          'font-family': 'inherit'
        });
        t.textContent = String(cluster.count);
        g.appendChild(t);
      }
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent =
        cluster.count > 1
          ? cluster.titles.join(', ')
          : `Skill card · ${cluster.titles[0]}`;
      g.appendChild(title);
      g.addEventListener('click', () => {
        if (cluster.count <= 1) return;
        const itemYears = cluster.ids
          .map((id) => model.trunk_items.find((t) => t.id === id)?.occurred_on)
          .filter(Boolean)
          .map((d) => yearFraction(d!));
        if (!itemYears.length) return;
        const lo = Math.min(...itemYears) - 0.25;
        const hi = Math.max(...itemYears) + 0.25;
        setZoom({ from: lo, to: Math.max(lo + 1, hi) });
      });
      svg.appendChild(g);
    }

    // Fork marker
    if (model.fork?.date) {
      const fu = timeToUnit(yearFraction(model.fork.date), state!.zoom, nowYear);
      const fx = state!.orientation === 'horizontal' ? fu * lengthPx : midPx;
      const fy = state!.orientation === 'horizontal' ? midPx : (1 - fu) * lengthPx;
      svg.appendChild(
        svgEl('circle', {
          cx: fx,
          cy: fy,
          r: 6,
          fill: 'var(--paper)',
          stroke: '#17375e',
          'stroke-width': 2
        })
      );
    }

    // Empty click unlocks
    svg.addEventListener('click', (event) => {
      if (event.target === svg && state!.locked) {
        state!.locked = false;
        selectFuture(null, true);
      }
    });

    svgHost.replaceChildren(svg);

    if (model.fork) {
      axisNote.textContent = `Last fork · ${model.fork.label ?? ''} · ${model.fork.caption}`;
    } else {
      axisNote.textContent = '';
    }
  }

  function paint(): void {
    paintToolbar();
    paintLegend();
    paintSvg();
  }

  paint();

  const ro = new ResizeObserver(() => paintSvg());
  ro.observe(svgHost);

  // Allow vertical page scroll over the river; only steal gestures for
  // ctrl/meta zoom, pinch, or a clear pan along the time axis (medical-strip pattern).
  // Anti-select: Safari click-drag must pan/zoom, not highlight page copy (Tasks gantt/map pattern).
  svgHost.style.touchAction = 'pan-y';

  const onSelectStart = (event: Event) => {
    event.preventDefault();
  };
  const clearNativeSelection = () => {
    const sel = globalThis.getSelection?.();
    if (sel && sel.rangeCount) sel.removeAllRanges();
  };

  const onWheel = (event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    clearNativeSelection();
    const span = state!.zoom.to - state!.zoom.from;
    const factor = event.deltaY > 0 ? 1.08 : 1 / 1.08;
    const mid = (state!.zoom.from + state!.zoom.to) / 2;
    setZoom({ from: mid - (span * factor) / 2, to: mid + (span * factor) / 2 });
  };
  svgHost.addEventListener('wheel', onWheel, { passive: false });
  svgHost.addEventListener('selectstart', onSelectStart);
  host.addEventListener('selectstart', onSelectStart);

  // Safari gesture events (non-standard)
  const onGestureStart = (event: Event) => {
    event.preventDefault?.();
    clearNativeSelection();
    state!.pinch = {
      dist0: 1,
      from0: state!.zoom.from,
      to0: state!.zoom.to
    };
  };
  const onGestureChange = (event: Event) => {
    if (!state!.pinch) return;
    event.preventDefault?.();
    const scale = (event as unknown as { scale?: number }).scale || 1;
    const mid = (state!.pinch.from0 + state!.pinch.to0) / 2;
    const span = (state!.pinch.to0 - state!.pinch.from0) / scale;
    setZoom({ from: mid - span / 2, to: mid + span / 2 });
  };
  svgHost.addEventListener('gesturestart', onGestureStart as EventListener);
  svgHost.addEventListener('gesturechange', onGestureChange as EventListener);

  const pointers = new Map<number, { x: number; y: number }>();
  const onPointerDown = (event: PointerEvent) => {
    // Mouse: kill native text-selection start (Safari blue highlight). Touch keeps
    // default so vertical page scroll still works until the gesture arms as pan.
    if (event.pointerType === 'mouse' && event.button === 0) {
      event.preventDefault();
    }
    clearNativeSelection();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      svgHost.setPointerCapture?.(event.pointerId);
      const pts = [...pointers.values()];
      state!.pinch = {
        dist0: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y),
        from0: state!.zoom.from,
        to0: state!.zoom.to
      };
      state!.drag = null;
    } else if (pointers.size === 1) {
      // Do not capture yet — let the browser scroll until the gesture proves pan.
      state!.drag = {
        x0: event.clientX,
        y0: event.clientY,
        from0: state!.zoom.from,
        to0: state!.zoom.to,
        armed: false
      };
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && state!.pinch?.dist0) {
      clearNativeSelection();
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (dist > 0) {
        const mid = (state!.pinch.from0 + state!.pinch.to0) / 2;
        const span = ((state!.pinch.to0 - state!.pinch.from0) * state!.pinch.dist0) / dist;
        setZoom({ from: mid - span / 2, to: mid + span / 2 });
      }
      return;
    }
    if (pointers.size === 1 && state!.drag) {
      const horizontal = state!.orientation === 'horizontal';
      const dx = event.clientX - state!.drag.x0;
      const dy = event.clientY - state!.drag.y0;
      if (!state!.drag.armed) {
        if (Math.hypot(dx, dy) < 8) return;
        // Steal only when movement is mostly along the time axis; else leave page scroll.
        const alongTime = horizontal
          ? Math.abs(dx) > Math.abs(dy) * 1.35
          : Math.abs(dy) > Math.abs(dx) * 1.35;
        if (!alongTime) {
          state!.drag = null;
          return;
        }
        state!.drag.armed = true;
        clearNativeSelection();
        svgHost.classList.add('is-panning');
        svgHost.setPointerCapture?.(event.pointerId);
      }
      clearNativeSelection();
      const delta = horizontal ? dx : dy;
      const plot = Math.max(1, horizontal ? state!.width - 200 : 400);
      const yearShift =
        -(delta / plot) * (state!.drag.to0 - state!.drag.from0) * (horizontal ? 1 : -1);
      setZoom({
        from: state!.drag.from0 + yearShift,
        to: state!.drag.to0 + yearShift
      });
    }
  };
  const onPointerEnd = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) state!.pinch = null;
    if (pointers.size === 0) {
      state!.drag = null;
      svgHost.classList.remove('is-panning');
    }
  };
  svgHost.addEventListener('pointerdown', onPointerDown);
  svgHost.addEventListener('pointermove', onPointerMove);
  svgHost.addEventListener('pointerup', onPointerEnd);
  svgHost.addEventListener('pointercancel', onPointerEnd);

  return {
    destroy() {
      mq.removeEventListener?.('change', onMq);
      ro.disconnect();
      svgHost.removeEventListener('wheel', onWheel);
      svgHost.removeEventListener('selectstart', onSelectStart);
      host.removeEventListener('selectstart', onSelectStart);
      svgHost.removeEventListener('gesturestart', onGestureStart as EventListener);
      svgHost.removeEventListener('gesturechange', onGestureChange as EventListener);
      svgHost.removeEventListener('pointerdown', onPointerDown);
      svgHost.removeEventListener('pointermove', onPointerMove);
      svgHost.removeEventListener('pointerup', onPointerEnd);
      svgHost.removeEventListener('pointercancel', onPointerEnd);
      host.replaceChildren();
      stateByHost.delete(host);
    }
  };
}
