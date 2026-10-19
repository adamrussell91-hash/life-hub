import {
  approxLabelWidth,
  assignEmploymentLanes,
  axisYearTicks,
  branchColour,
  branchPolyline,
  clampZoom,
  clusterMarks,
  layoutRoleSwimlanes,
  pastShareFor,
  pathFromPoints,
  placeBarLabel,
  riverHeightPx,
  riverJobShortLabel,
  SWIMLANE_BAR_PX,
  SWIMLANE_GROUP_GAP_PX,
  SWIMLANE_ROW_PX,
  swimlaneBlockPx,
  timeToUnit,
  truncateRiverLabel,
  yearFraction,
  type RiverOrientation,
  type RiverZoom,
  type SwimlaneLayout
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
  /** Last orientation we scrolled Now into view for (phone vertical). */
  scrolledNowFor: RiverOrientation | null;
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

function jobTip(job: CareerModel['employment'][number]): string {
  return (
    [job.role, job.display_label || job.label]
      .map((part) => (part || '').trim())
      .filter(Boolean)
      .join(' · ') || 'Role'
  );
}

type RiverJob = CareerModel['employment'][number] & { valid_from: string };

function workplaceName(job: RiverJob): string {
  return (job.display_label || job.label || '').trim();
}

/** Label candidates, longest first; placement takes the first that fits. */
function roleLabelCandidates(job: RiverJob, withWorkplace: boolean): string[] {
  const role = (job.role || '').trim();
  const short = riverJobShortLabel(role || workplaceName(job) || 'Role');
  const place = workplaceName(job);
  const out: string[] = [];
  if (withWorkplace && place) {
    if (role) out.push(`${role} · ${place}`, `${short} · ${place}`);
    else out.push(place);
  }
  if (role) out.push(role);
  out.push(short);
  return [...new Set(out)];
}

function svgTitle(node: SVGElement, text: string): void {
  const title = svgEl('title');
  title.textContent = text;
  node.appendChild(title);
}

function roleDates(job: RiverJob): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  return `${fmt(job.valid_from)} – ${job.valid_to ? fmt(job.valid_to) : 'now'}`;
}

type RoleSpan = {
  job: RiverJob;
  index: number;
  group: string;
  x0: number;
  x1: number;
  /** First role at its workplace: its label also names the workplace. */
  firstInGroup: boolean;
  /** x1 plus room for a beside-the-bar label, so rows only share when labels fit. */
  reserveEnd: number;
};

function roleSpans(jobs: RiverJob[], T: (year: number) => number, lengthPx: number): RoleSpan[] {
  const now = new Date().toISOString().slice(0, 10);
  const groupKey = (job: RiverJob) => job.ref || job.display_label || job.label || '';
  const firstOf = new Map<string, number>();
  jobs.forEach((job, index) => {
    const key = groupKey(job);
    const prev = firstOf.get(key);
    if (prev === undefined || job.valid_from < jobs[prev]!.valid_from) firstOf.set(key, index);
  });
  return jobs.map((job, index) => {
    const x0 = Math.max(0, Math.min(lengthPx, T(yearFraction(job.valid_from)) * lengthPx));
    const rawX1 = T(yearFraction(job.valid_to || now)) * lengthPx;
    const x1 = Math.max(x0 + 4, Math.min(lengthPx, rawX1));
    const firstInGroup = firstOf.get(groupKey(job)) === index;
    const shortest = roleLabelCandidates(job, false).pop() || '';
    const w = approxLabelWidth(shortest);
    const fitsInside = x1 - x0 >= w + 12;
    // A workplace's first bar labels to its left (always free in its row),
    // unless the bar starts at the river's edge.
    const leftFree = firstInGroup && x0 - 6 - approxLabelWidth(roleLabelCandidates(job, true)[0] || '') >= 2;
    const reserveEnd = fitsInside || leftFree ? x1 : x1 + 6 + w + 8;
    return { job, index, group: groupKey(job), x0, x1, firstInGroup, reserveEnd };
  });
}

/**
 * Desktop past: one swimlane group per workplace under the trunk, concurrent
 * roles stacked in their group. Labels sit inside the bar, else in free row
 * space beside it, else only in the tooltip — never overlapping.
 */
function paintSwimlanes(
  svg: SVGElement,
  spans: RoleSpan[],
  swim: SwimlaneLayout,
  geo: { lengthPx: number; lanesTop: number; width: number }
): void {
  if (!spans.length) return;
  const rowTop = (row: number) =>
    geo.lanesTop + row * SWIMLANE_ROW_PX + (swim.rowGroup[row] ?? 0) * SWIMLANE_GROUP_GAP_PX;
  for (let row = 1; row < swim.rowCount; row++) {
    if (!swim.rowStartsGroup[row]) continue;
    const y = rowTop(row) - SWIMLANE_GROUP_GAP_PX / 2;
    svg.appendChild(
      svgEl('line', {
        x1: 0,
        y1: y,
        x2: geo.lengthPx,
        y2: y,
        class: 'career-river__lane-rule',
        'data-part': 'lane-rule'
      })
    );
  }
  const placedSpans = spans.map((span) => ({ ...span, row: swim.jobRow[span.index] ?? 0 }));
  for (let row = 0; row < swim.rowCount; row++) {
    const inRow = placedSpans.filter((s) => s.row === row).sort((a, b) => a.x0 - b.x0);
    const blocked: Array<[number, number]> = inRow.map((s) => [s.x0, s.x1]);
    const y = rowTop(row) + (SWIMLANE_ROW_PX - SWIMLANE_BAR_PX) / 2;
    const side = !swim.rowStartsGroup[row];
    for (const span of inRow) {
      const { job } = span;
      const current = !job.valid_to;
      const group = svgEl('g', { class: 'career-river__role', 'data-part': 'role-span' });
      const bar = svgEl('rect', {
        x: span.x0,
        y,
        width: span.x1 - span.x0,
        height: SWIMLANE_BAR_PX,
        rx: 4,
        class: `career-river__role-bar${side ? ' career-river__role-bar--side' : ''}${
          current ? ' career-river__role-bar--current' : ''
        }`,
        'data-part': 'role-bar'
      });
      const tip = `${jobTip(job)} · ${roleDates(job)}`;
      svgTitle(bar, tip);
      group.appendChild(bar);
      const otherBlocked = blocked.filter(([a, b]) => !(a === span.x0 && b === span.x1));
      for (const text of roleLabelCandidates(job, span.firstInGroup)) {
        const textW = approxLabelWidth(text);
        const place = placeBarLabel({
          x0: span.x0,
          x1: span.x1,
          textW,
          maxX: geo.width - 4,
          minX: 2,
          blocked: otherBlocked,
          preferLeft: span.firstInGroup
        });
        if (!place) continue;
        const label = svgEl('text', {
          x: place.x,
          y: y + SWIMLANE_BAR_PX / 2 + 4,
          'text-anchor': place.anchor,
          class: `career-river__role-label${place.inside ? ' career-river__role-label--inside' : ''}${
            place.inside && (side || current) ? ` career-river__role-label--on-${current ? 'current' : 'side'}` : ''
          }`,
          'data-part': 'role-label',
          'data-place': place.inside ? 'inside' : place.anchor === 'start' ? 'right' : 'left'
        });
        label.textContent = text;
        svgTitle(label, tip);
        group.appendChild(label);
        if (!place.inside) {
          const a = place.anchor === 'start' ? place.x : place.x - textW;
          blocked.push([a, a + textW]);
        }
        break;
      }
      svg.appendChild(group);
    }
  }
}

/**
 * Phone past: thin role columns beside the left-hand trunk (concurrent roles
 * side by side) with callout labels stacked so they never overlap.
 */
function paintRoleColumns(
  svg: SVGElement,
  jobs: RiverJob[],
  geo: { along: (u: number) => number; trunkX: number; width: number },
  T: (year: number) => number
): void {
  if (!jobs.length) return;
  const lanes = assignEmploymentLanes(jobs);
  const laneCount = Math.max(...lanes) + 1;
  const colX = (lane: number) => geo.trunkX + 16 + lane * 9;
  const labelX = colX(laneCount) + 10;
  const avail = geo.width - labelX - 4;
  const now = new Date().toISOString().slice(0, 10);
  const items = jobs
    .map((job, index) => {
      const yTop = geo.along(Math.min(1, T(yearFraction(job.valid_to || now))));
      const yBottom = geo.along(Math.max(0, T(yearFraction(job.valid_from))));
      return { job, lane: lanes[index] ?? 0, yTop, yBottom: Math.max(yBottom, yTop + 4) };
    })
    .filter((item) => item.yBottom > 0);
  for (const item of items) {
    const bar = svgEl('rect', {
      x: colX(item.lane) - 3,
      y: item.yTop,
      width: 6,
      height: item.yBottom - item.yTop,
      rx: 3,
      class: `career-river__role-bar${item.job.valid_to ? '' : ' career-river__role-bar--current'}`,
      'data-part': 'role-bar'
    });
    svgTitle(bar, `${jobTip(item.job)} · ${roleDates(item.job)}`);
    svg.appendChild(bar);
  }
  // Callouts: newest at the top, pushed apart by at least one line.
  const LINE = 14;
  const placed = items
    .map((item) => ({ item, want: (item.yTop + item.yBottom) / 2 }))
    .sort((a, b) => a.want - b.want);
  let last = -Infinity;
  for (const p of placed) {
    const y = Math.max(p.want, last + LINE);
    last = y;
    const text =
      roleLabelCandidates(p.item.job, true).find((t) => approxLabelWidth(t) <= avail) ??
      truncateRiverLabel(roleLabelCandidates(p.item.job, false).pop() || 'Role', avail);
    if (!text) continue;
    const anchorX = colX(p.item.lane) + 3;
    svg.appendChild(
      svgEl('path', {
        d: `M${anchorX} ${p.want} L${labelX - 6} ${y - 4} L${labelX - 2} ${y - 4}`,
        fill: 'none',
        class: 'career-river__role-callout',
        'data-part': 'role-callout'
      })
    );
    const label = svgEl('text', {
      x: labelX,
      y,
      class: 'career-river__role-label',
      'data-part': 'role-label',
      'data-place': 'callout'
    });
    label.textContent = text;
    svgTitle(label, `${jobTip(p.item.job)} · ${roleDates(p.item.job)}`);
    svg.appendChild(label);
  }
}

/** No futures yet: two dashed stubs from Now and an "Add a future" action. */
function paintStarterBranches(
  svg: SVGElement,
  args: {
    isHorizontal: boolean;
    start: { x: number; y: number };
    reach: number;
    spread: number;
    onAdd?: () => void;
  }
): void {
  const { isHorizontal, start, reach, spread } = args;
  for (const dir of [-1, 1]) {
    const d = isHorizontal
      ? `M${start.x} ${start.y} C${start.x + reach * 0.4} ${start.y} ${start.x + reach * 0.4} ${
          start.y + dir * spread
        } ${start.x + reach} ${start.y + dir * spread}`
      : `M${start.x} ${start.y} C${start.x} ${start.y - reach * 0.4} ${start.x + spread * (dir + 2) * 0.5} ${
          start.y - reach * 0.4
        } ${start.x + spread * (dir + 2) * 0.5} ${start.y - reach}`;
    svg.appendChild(
      svgEl('path', { d, fill: 'none', class: 'career-river__starter', 'data-part': 'starter-branch' })
    );
  }
  const add = svgEl('text', {
    x: isHorizontal ? start.x + reach + 10 : start.x + spread * 1.5 + 8,
    y: isHorizontal ? start.y + 4 : start.y - reach + 4,
    class: 'career-river__starter-label',
    'data-part': 'starter-add',
    role: 'button',
    tabindex: 0
  });
  add.textContent = 'Add a future';
  if (args.onAdd) {
    const go = () => args.onAdd?.();
    add.addEventListener('click', go);
    add.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        go();
      }
    });
  }
  svg.appendChild(add);
}

/**
 * Full-bleed Career river. Re-renders on ResizeObserver and orientation change.
 */
export function mountCareerRiver(
  host: HTMLElement,
  model: CareerModel,
  options: {
    selectedFutureId?: string | null;
    onSelectFuture?: (id: string | null) => void;
    onAddFuture?: () => void;
    /** A future with no criteria was picked: its label reads "Add criteria". */
    onAddCriteria?: (id: string) => void;
    onRestoreFuture?: (id: string) => void;
  } = {}
): { destroy: () => void; setSelected: (id: string | null) => void } {
  const nowYear = yearFraction(model.now);
  const bounds = careerBounds(model, nowYear);
  let state = stateByHost.get(host);
  if (!state) {
    state = {
      zoom: clampZoom(presetZoom('whole', bounds, nowYear), bounds.from, bounds.to),
      orientation: window.matchMedia('(min-width: 720px)').matches ? 'horizontal' : 'vertical',
      width: 0,
      selectedId: options.selectedFutureId ?? null,
      hoverId: null,
      locked: false,
      scrolledNowFor: null,
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

  /** Chip or branch click: toggles the locked selection. */
  function pickFuture(id: string): void {
    const future = model.futures.find((f) => f.id === id);
    if (future && !future.criteria.length) {
      // Its label says "Add criteria", so a click always means that.
      state!.locked = true;
      if (state!.selectedId !== id) selectFuture(id, true);
      options.onAddCriteria?.(id);
      return;
    }
    if (state!.locked && state!.selectedId === id) {
      state!.locked = false;
      selectFuture(null, true);
      return;
    }
    state!.locked = true;
    selectFuture(id, true);
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
      chip.setAttribute('aria-pressed', state!.selectedId === future.id ? 'true' : 'false');
      const fadingNote = future.fading ? ' · fading' : '';
      chip.textContent = `${riverJobShortLabel(future.title)} · ${future.readiness_label}${fadingNote}`;
      chip.addEventListener('click', () => pickFuture(future.id));
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
      const parkedId = (parked as { id?: string }).id;
      if (parkedId && options.onRestoreFuture) {
        chip.addEventListener('click', () => {
          chip.disabled = true;
          options.onRestoreFuture?.(parkedId);
        });
      } else {
        chip.disabled = true;
      }
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
    const hasFutures = futures.length > 0;
    // Phone rivers are tall: the past keeps more of the length for role callouts.
    const share = state!.orientation === 'vertical'
      ? Math.max(pastShareFor(futures.length), 0.6)
      : pastShareFor(futures.length);
    const T = (year: number) => timeToUnit(year, state!.zoom, nowYear, share);
    const yearsInView = Math.max(1, state!.zoom.to - state!.zoom.from);
    const isHorizontal = state!.orientation === 'horizontal';
    const jobs = model.employment.filter(
      (job): job is typeof job & { valid_from: string } => Boolean(job.valid_from)
    );

    // Horizontal: frame row · branch zone · trunk · branch zone · swimlanes · axis.
    // Vertical (phone): time bottom → top, trunk on the left, roles as columns
    // beside it with callout labels, branches fanning right above Now.
    const branchHalf = hasFutures ? Math.max(56, futures.length * 28) : 34;
    const TOP = 44;
    const V_TOP = 40;
    let height: number;
    let lengthPx: number;
    let midPx: number;
    let lanesTop = 0;
    let axisTop = 0;
    let spans: RoleSpan[] = [];
    let swim: SwimlaneLayout = layoutRoleSwimlanes([]);
    if (isHorizontal) {
      lengthPx = Math.max(100, width - (hasFutures ? 200 : 130));
      spans = roleSpans(jobs, T, lengthPx);
      swim = layoutRoleSwimlanes(spans.map((span) => ({ group: span.group, start: span.x0, end: span.reserveEnd })));
      midPx = TOP + branchHalf;
      lanesTop = midPx + branchHalf + 18;
      axisTop = lanesTop + swimlaneBlockPx(swim) + 10;
      height = axisTop + 30;
    } else {
      height = riverHeightPx('vertical', futures.length, yearsInView) + V_TOP;
      lengthPx = Math.max(100, height - V_TOP - 24);
      midPx = 44;
    }
    const nowU = T(nowYear);
    const focusId = state!.hoverId || state!.selectedId;
    /** Position along the time axis (x when horizontal, y when vertical). */
    const along = (u: number) => (isHorizontal ? u * lengthPx : V_TOP + (1 - u) * lengthPx);

    const svg = svgEl('svg', {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      class: 'career-river__svg',
      role: 'img',
      'aria-label': 'Career river'
    });

    // Frame: What happened / What could (mockup + Tasks axis job)
    const pastLabel = svgEl('text', {
      x: 8,
      y: isHorizontal ? 18 : height - 8,
      class: 'career-river__frame-label',
      'text-anchor': 'start',
      'data-part': 'frame-past'
    });
    pastLabel.textContent = 'What happened';
    svg.appendChild(pastLabel);
    const futureLabel = svgEl('text', {
      x: isHorizontal ? Math.min(width - 90, nowU * lengthPx + 12) : 8,
      y: 18,
      class: 'career-river__frame-label',
      'text-anchor': 'start',
      'data-part': 'frame-future'
    });
    futureLabel.textContent = 'What could';
    svg.appendChild(futureLabel);

    // Year grid + axis ruler (Tasks gantt ticks / grid)
    for (const year of axisYearTicks(state!.zoom)) {
      const u = T(year);
      if (u < -0.02 || u > 1.02) continue;
      if (isHorizontal) {
        const x = u * lengthPx;
        svg.appendChild(
          svgEl('line', {
            x1: x,
            y1: 28,
            x2: x,
            y2: axisTop,
            class: 'career-river__year-grid',
            'data-part': 'year-grid'
          })
        );
        svg.appendChild(
          svgEl('line', {
            x1: x,
            y1: axisTop,
            x2: x,
            y2: axisTop + 6,
            class: 'career-river__axis-tick',
            'data-part': 'axis-tick'
          })
        );
        const label = svgEl('text', {
          x,
          y: axisTop + 20,
          'text-anchor': 'middle',
          'data-part': 'axis-year',
          class: 'career-river__axis-year'
        });
        label.textContent = String(year);
        svg.appendChild(label);
      } else {
        const y = along(u);
        svg.appendChild(
          svgEl('line', {
            x1: 34,
            y1: y,
            x2: width - 8,
            y2: y,
            class: 'career-river__year-grid',
            'data-part': 'year-grid'
          })
        );
        const label = svgEl('text', {
          x: 2,
          y: y + 4,
          'data-part': 'axis-year',
          class: 'career-river__axis-year'
        });
        label.textContent = String(year);
        svg.appendChild(label);
      }
    }

    if (isHorizontal) paintSwimlanes(svg, spans, swim, { lengthPx, lanesTop, width });
    else paintRoleColumns(svg, jobs, { along, trunkX: midPx, width }, T);

    // Trunk spine — career so far (thick navy path ending at Now)
    const trunkStart = Math.min(
      ...[nowYear - 1, ...jobs.map((e) => yearFraction(e.valid_from))].filter(Number.isFinite)
    );
    const trunkU0 = Math.max(0, T(trunkStart));
    const trunkPts = isHorizontal
      ? [
          { x: trunkU0 * lengthPx, y: midPx },
          { x: nowU * lengthPx, y: midPx }
        ]
      : [
          { x: midPx, y: along(trunkU0) },
          { x: midPx, y: along(nowU) }
        ];
    svg.appendChild(
      svgEl('path', {
        d: pathFromPoints(trunkPts),
        fill: 'none',
        stroke: 'var(--navy)',
        'stroke-width': isHorizontal ? 13 : 11,
        'stroke-linecap': 'round',
        class: 'career-river__trunk',
        'data-part': 'trunk'
      })
    );
    const trunkTip = trunkPts[trunkPts.length - 1]!;
    svg.appendChild(
      svgEl('circle', {
        cx: trunkTip.x,
        cy: trunkTip.y,
        r: 5,
        class: 'career-river__trunk-cap',
        'data-part': 'trunk-cap'
      })
    );

    // Now marker (Tasks gantt-today weight) — label at top; years keep the bottom row
    const nowLine = isHorizontal
      ? `M${nowU * lengthPx} 24 L${nowU * lengthPx} ${axisTop}`
      : `M34 ${along(nowU)} L${width - 8} ${along(nowU)}`;
    svg.appendChild(
      svgEl('path', {
        d: nowLine,
        fill: 'none',
        class: 'career-river__now-line',
        'data-part': 'now-line'
      })
    );
    const nowText = svgEl('text', {
      x: isHorizontal ? nowU * lengthPx + 6 : width - 8,
      y: isHorizontal ? 34 : along(nowU) - 6,
      'text-anchor': isHorizontal ? 'start' : 'end',
      class: 'career-river__now-label',
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

    if (!hasFutures) {
      paintStarterBranches(svg, {
        isHorizontal,
        start: trunkTip,
        reach: isHorizontal
          ? Math.max(40, Math.min(90, lengthPx - nowU * lengthPx - 10))
          : Math.max(36, Math.min(90, along(nowU) - V_TOP - 10)),
        spread: isHorizontal ? branchHalf * 0.7 : 46,
        onAdd: options.onAddFuture
      });
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
      const splitU = T(yearFraction(future.split_date));
      const arrivalU = future.arrival_date
        ? T(yearFraction(future.arrival_date))
        : Math.min(1, splitU + 0.2);
      // Horizontal: lanes spread ± around the trunk inside the branch zone.
      // Vertical: branches fan to the right of the left-hand trunk.
      const laneY = isHorizontal
        ? sorted.length <= 1
          ? 0
          : ((index / Math.max(1, sorted.length - 1)) * 2 - 1) * 0.86 * branchHalf
        : ((index + 1) / sorted.length) * Math.max(40, width - midPx - 80);
      const bundleY = index * 3;
      const rawPts = branchPolyline({
        orientation: state!.orientation,
        lengthPx,
        midPx,
        nowUnit: nowU,
        splitUnit: splitU,
        arrivalUnit: arrivalU,
        laneY,
        bundleY
      });
      const pts = isHorizontal ? rawPts : rawPts.map((p) => ({ x: p.x, y: p.y + V_TOP }));
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
        const su = T(yearFraction(stone.target_term_start));
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
            : along(su);
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

      // Label: real-width boxes, kept inside the SVG, nudged until clear of
      // earlier labels; shortened before it is dropped into the tooltip.
      const isVert = !isHorizontal;
      const shortText = `${riverJobShortLabel(future.title)} · ${future.readiness_label}`;
      const longText = isVert
        ? shortText
        : `${future.title} · ${future.readiness_label}${future.arrival_label ? ` · ${future.arrival_label}` : ''}`;
      const boxFor = (text: string, y: number) => {
        const w = approxLabelWidth(text);
        let x0 = isVert ? tip.x - w / 2 : tip.x + 10;
        x0 = Math.max(4, Math.min(width - 4 - w, x0));
        return { x: x0, y: y - 11, w, h: 14 };
      };
      const clear = (box: { x: number; y: number; w: number; h: number }) =>
        box.y >= 2 &&
        box.y + box.h <= height - 2 &&
        labelBoxes.every(
          (o) => box.x + box.w <= o.x || o.x + o.w <= box.x || box.y + box.h <= o.y || o.y + o.h <= box.y
        );
      const baseY = isVert ? tip.y - 10 : tip.y + 4;
      let placed: { text: string; box: { x: number; y: number; w: number; h: number } } | null = null;
      for (const text of longText === shortText ? [longText] : [longText, shortText]) {
        for (const dy of [0, -16, 16, -32, 32]) {
          const box = boxFor(text, baseY + dy);
          if (clear(box)) {
            placed = { text, box };
            break;
          }
        }
        if (placed) break;
      }
      if (placed) {
        const label = svgEl('text', {
          x: placed.box.x,
          y: placed.box.y + 11,
          fill: colour,
          'font-size': 11,
          'font-family': 'inherit',
          'font-weight': 600,
          'fill-opacity': op,
          'text-anchor': 'start',
          'data-part': 'branch-label'
        });
        label.textContent = placed.text;
        svgTitle(label, future.title);
        label.style.cursor = 'pointer';
        label.addEventListener('click', () => pickFuture(future.id));
        svg.appendChild(label);
        labelBoxes.push({ ...placed.box, el: label });
      }

      const hit = svgEl('path', {
        d: pathFromPoints(pts),
        fill: 'none',
        stroke: 'transparent',
        'stroke-width': Math.max(18, strokeW + 10)
      });
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', () => pickFuture(future.id));
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
      unit: T(yearFraction(item.occurred_on)),
      title: item.title,
      future_ids: item.future_ids ?? []
    }));
    const clusters = clusterMarks(marks, lengthPx, 10);
    for (const cluster of clusters) {
      const cx = state!.orientation === 'horizontal' ? cluster.unit * lengthPx : midPx;
      const cy = isHorizontal ? midPx : along(cluster.unit);
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
      const fu = T(yearFraction(model.fork.date));
      const fx = isHorizontal ? fu * lengthPx : midPx;
      const fy = isHorizontal ? midPx : along(fu);
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

    // Phone: tall SVG opens on empty future; bring Now (+ past role ticks) into view once.
    if (!isHorizontal && state!.scrolledNowFor !== 'vertical') {
      state!.scrolledNowFor = 'vertical';
      requestAnimationFrame(() => {
        svg.querySelector('[data-part="now-label"]')?.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'instant' as ScrollBehavior
        });
      });
    } else if (isHorizontal) {
      state!.scrolledNowFor = 'horizontal';
    }

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
  const lockPageSelect = (on: boolean) => {
    const root = document.documentElement;
    if (on) {
      root.style.setProperty('user-select', 'none');
      root.style.setProperty('-webkit-user-select', 'none');
    } else {
      root.style.removeProperty('user-select');
      root.style.removeProperty('-webkit-user-select');
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    // Mouse: kill native text-selection start (Safari blue highlight). Touch keeps
    // default so vertical page scroll still works until the gesture arms as pan.
    if (event.pointerType === 'mouse' && event.button === 0) {
      event.preventDefault();
      lockPageSelect(true);
    }
    clearNativeSelection();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      lockPageSelect(true);
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
          lockPageSelect(false);
          return;
        }
        state!.drag.armed = true;
        clearNativeSelection();
        lockPageSelect(true);
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
      lockPageSelect(false);
      clearNativeSelection();
    }
  };
  const onDragStart = (event: DragEvent) => {
    event.preventDefault();
  };
  svgHost.addEventListener('pointerdown', onPointerDown);
  svgHost.addEventListener('pointermove', onPointerMove);
  svgHost.addEventListener('pointerup', onPointerEnd);
  svgHost.addEventListener('pointercancel', onPointerEnd);
  svgHost.addEventListener('dragstart', onDragStart);

  return {
    setSelected(id: string | null) {
      if (state!.selectedId === id) return;
      state!.selectedId = id;
      state!.locked = id != null;
      paint();
    },
    destroy() {
      mq.removeEventListener?.('change', onMq);
      ro.disconnect();
      lockPageSelect(false);
      svgHost.removeEventListener('wheel', onWheel);
      svgHost.removeEventListener('selectstart', onSelectStart);
      host.removeEventListener('selectstart', onSelectStart);
      svgHost.removeEventListener('gesturestart', onGestureStart as EventListener);
      svgHost.removeEventListener('gesturechange', onGestureChange as EventListener);
      svgHost.removeEventListener('pointerdown', onPointerDown);
      svgHost.removeEventListener('pointermove', onPointerMove);
      svgHost.removeEventListener('pointerup', onPointerEnd);
      svgHost.removeEventListener('pointercancel', onPointerEnd);
      svgHost.removeEventListener('dragstart', onDragStart);
      host.replaceChildren();
      stateByHost.delete(host);
    }
  };
}
