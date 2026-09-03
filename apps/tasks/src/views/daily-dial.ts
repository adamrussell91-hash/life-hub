import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  collectCalendarItems,
  filterCalendarItems,
  type CalendarFilters
} from '@/domain/calendar';
import {
  DIAL_LEGEND,
  assignLanes,
  closestOccupiedHour,
  eventsFromTasks,
  eventsInHour,
  fisheyeBoundaries,
  fisheyeTargetWidths,
  formatClockTime,
  formatDialTime,
  hourCaption,
  hourOccupancy,
  hourShort,
  weekEventMap,
  type DialEvent,
  type DialTint
} from '@/domain/daily-dial';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import {
  HUB_TZ,
  hubCalendarDate,
  hubClockParts,
  toDateKey,
  weekDays
} from '@/domain/queries';
import { createHubPills, el } from '@/views/hub-kit';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 260;
const CY = 260;
const R_IN = 88;
const R_OUT_MAX = 142;
const HAND_R = R_IN - 6;
const GAP = 0.6;
const ANIM_MS = 560;
const BAND_IN = R_IN + 4;
const LANE_THICKNESS = 5;
const LANE_PITCH = 15;
const LANE_START = BAND_IN + 9;
const TASK_GAP = 1.2;
const LEADER_ELBOW_R = 150;
const LEADER_STUB = 12;
const LEADER_CHIP_W = 92;
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const TINT_INK: Record<DialTint, string> = {
  blue: 'var(--pastel-blue-ink)',
  sage: 'var(--pastel-sage-ink)',
  peach: 'var(--pastel-peach-ink)',
  gold: 'var(--pastel-gold-ink)',
  lilac: 'var(--pastel-lilac-ink)',
  sand: 'var(--sand)'
};

type DialMode = 'day' | 'week';
type ClippedEvent = DialEvent & { clipStart: number; clipEnd: number };

let sessionMode: DialMode = 'day';

export type DailyDialHandle = {
  destroy: () => void;
};

export type DailyDialOptions = {
  tasks: Task[];
  projects: Project[];
  date?: Date;
  now?: Date;
  timeZone?: string;
  filters?: { domain?: CalendarFilters['domain']; priority?: Task['priority'] | 'all' };
  onOpen?: (task: Task) => void;
};

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function point(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + Math.cos(rad) * radius, y: CY + Math.sin(rad) * radius };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function laneRadii(lane: number): [number, number] {
  const center = LANE_START + lane * LANE_PITCH;
  return [center - LANE_THICKNESS / 2, center + LANE_THICKNESS / 2];
}

function tintColor(cat: DialTint | null): string {
  return cat ? TINT_INK[cat] : 'var(--shore)';
}

function drawArcBar(
  container: SVGElement,
  startDeg: number,
  spanDeg: number,
  innerR: number,
  outerR: number,
  color: string,
  roundCap: boolean,
  gapOverride?: number
): SVGCircleElement {
  const width = Math.max(outerR - innerR, 0.01);
  const radius = innerR + width / 2;
  const gap = Math.min(gapOverride ?? GAP, spanDeg * 0.2);
  const start = startDeg + gap;
  const span = Math.max(spanDeg - 2 * gap, 0.01);
  const circle = svgEl('circle', {
    class: 'daily-dial__bar',
    cx: CX,
    cy: CY,
    r: radius,
    fill: 'none',
    stroke: color,
    'stroke-width': width,
    'stroke-linecap': roundCap ? 'round' : 'butt',
    pathLength: 100,
    'stroke-dasharray': `${(span / 3.6).toFixed(3)} 1000`,
    transform: `rotate(${start.toFixed(3)} ${CX} ${CY})`
  });
  container.append(circle);
  return circle;
}

function drawHit(
  container: SVGElement,
  startDeg: number,
  spanDeg: number,
  onActivate: () => void,
  label: string
): void {
  const hit = svgEl('circle', {
    class: 'daily-dial__hit',
    cx: CX,
    cy: CY,
    r: (R_IN + R_OUT_MAX) / 2,
    'stroke-width': R_OUT_MAX - R_IN + 20,
    stroke: 'rgba(0,0,0,0.001)',
    'pointer-events': 'stroke',
    pathLength: 100,
    'stroke-dasharray': `${Math.max(spanDeg / 3.6 - 0.05, 0.01).toFixed(3)} 1000`,
    transform: `rotate(${(startDeg + GAP).toFixed(3)} ${CX} ${CY})`
  });
  hit.setAttribute('role', 'button');
  hit.setAttribute('tabindex', '0');
  hit.setAttribute('aria-label', label);
  hit.addEventListener('click', (event) => {
    event.stopPropagation();
    onActivate();
  });
  hit.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onActivate();
  });
  container.append(hit);
}

type LeaderItem = {
  angle: number;
  edgeR: number;
  dotColor: string;
  time: string;
  title: string;
  onOpen?: () => void;
};

function drawLeaderBatch(host: SVGElement, items: LeaderItem[]): void {
  const chipH = 30;
  const minGap = chipH + 6;
  const laid = items.map((item) => {
    const edge = point(item.edgeR, item.angle);
    const elbow = point(LEADER_ELBOW_R, item.angle);
    return {
      ...item,
      edge,
      elbowX: elbow.x,
      y: elbow.y,
      right: Math.cos((item.angle * Math.PI) / 180) >= 0
    };
  });

  for (const side of [true, false]) {
    const group = laid.filter((row) => row.right === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < group.length; i++) {
      if (group[i]!.y - group[i - 1]!.y < minGap) group[i]!.y = group[i - 1]!.y + minGap;
    }
    for (let j = group.length - 2; j >= 0; j--) {
      if (group[j + 1]!.y - group[j]!.y < minGap) group[j]!.y = group[j + 1]!.y - minGap;
    }
  }

  for (const row of laid) {
    const stubX = row.elbowX + (row.right ? LEADER_STUB : -LEADER_STUB);
    host.append(
      svgEl('path', {
        class: 'daily-dial__leader',
        d: `M ${row.edge.x.toFixed(1)} ${row.edge.y.toFixed(1)} L ${row.elbowX.toFixed(1)} ${row.y.toFixed(1)} L ${stubX.toFixed(1)} ${row.y.toFixed(1)}`
      }),
      svgEl('circle', {
        class: 'daily-dial__leader-dot',
        cx: row.edge.x.toFixed(1),
        cy: row.edge.y.toFixed(1),
        r: 3.2,
        fill: row.dotColor
      })
    );
    const fo = svgEl('foreignObject', {
      x: (row.right ? stubX : stubX - LEADER_CHIP_W).toFixed(1),
      y: (row.y - chipH / 2).toFixed(1),
      width: LEADER_CHIP_W,
      height: chipH
    });
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'daily-dial__chip';
    chip.setAttribute('aria-label', `${row.title}, ${row.time}`);
    const dot = document.createElement('span');
    dot.className = 'daily-dial__chip-dot';
    dot.style.background = row.dotColor;
    const text = document.createElement('span');
    text.className = 'daily-dial__chip-text';
    const time = document.createElement('div');
    time.className = 'daily-dial__chip-time';
    time.textContent = row.time;
    const title = document.createElement('div');
    title.className = 'daily-dial__chip-title';
    title.textContent = row.title;
    text.append(time, title);
    chip.append(dot, text);
    if (row.onOpen) {
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        row.onOpen?.();
      });
    } else {
      chip.disabled = true;
    }
    fo.append(chip);
    host.append(fo);
  }
}

function makeFisheyeRing(opts: {
  count: number;
  defaultFocus: number | null;
  onFrame: (boundaries: number[], focusIndex: number | null, settled: boolean) => void;
}): { focus: (index: number) => void; destroy: () => void } {
  let focusIndex = opts.defaultFocus;
  let widths = fisheyeTargetWidths(opts.count, focusIndex);
  let rafId: number | null = null;

  const paint = (settled: boolean): void => {
    opts.onFrame(fisheyeBoundaries(widths), focusIndex, settled);
  };

  const animateTo = (index: number | null): void => {
    const from = widths.slice();
    const to = fisheyeTargetWidths(opts.count, index);
    focusIndex = index;
    if (rafId != null) cancelAnimationFrame(rafId);
    if (prefersReducedMotion()) {
      widths = to;
      paint(true);
      return;
    }
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / ANIM_MS);
      const eased = easeInOutCubic(t);
      widths = from.map((value, i) => lerp(value, to[i]!, eased));
      paint(t >= 1);
      if (t < 1) rafId = requestAnimationFrame(tick);
      else rafId = null;
    };
    rafId = requestAnimationFrame(tick);
  };

  paint(true);
  return {
    focus: (index) => {
      animateTo(focusIndex === index ? null : index);
    },
    destroy: () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    }
  };
}

function taskById(tasks: Task[], id: string | null): Task | undefined {
  if (!id) return undefined;
  return tasks.find((task) => task.id === id);
}

function renderFocusedEvents(
  host: SVGElement,
  events: ClippedEvent[],
  a0: number,
  span: number,
  emptyLabel: string,
  tasks: Task[],
  onOpen?: (task: Task) => void
): void {
  if (!events.length) {
    drawArcBar(host, a0, span, laneRadii(0)[0], laneRadii(0)[1], 'var(--shore)', true);
    const emptyAt = point(LANE_START + 22, a0 + span / 2);
    const empty = svgEl('text', {
      x: emptyAt.x.toFixed(2),
      y: emptyAt.y.toFixed(2),
      class: 'daily-dial__empty'
    });
    empty.textContent = emptyLabel;
    host.append(empty);
    return;
  }
  const scheduled = assignLanes(
    events.map((event) => ({
      start: event.clipStart,
      end: event.clipEnd,
      ref: event
    }))
  );
  const labels: LeaderItem[] = scheduled.items.map((item) => {
    const event = item.ref;
    const radii = laneRadii(item.lane);
    const start = a0 + item.start * span;
    const width = (item.end - item.start) * span;
    drawArcBar(host, start, width, radii[0], radii[1], tintColor(event.cat), true, TASK_GAP);
    const task = taskById(tasks, event.taskId);
    return {
      angle: start + width / 2,
      edgeR: radii[1] + 4,
      dotColor: tintColor(event.cat),
      time: event.timed ? formatDialTime(event.start) : 'Anytime',
      title: event.title,
      onOpen: task && onOpen ? () => onOpen(task) : undefined
    };
  });
  drawLeaderBatch(host, labels);
}

function mountDayRing(
  shell: HTMLElement,
  events: DialEvent[],
  now: Date,
  timeZone: string,
  tasks: Task[],
  onOpen?: (task: Task) => void
): { destroy: () => void; positionHand: () => void } {
  const occupancy = hourOccupancy(events);
  const clock = hubClockParts(now, timeZone);
  const svg = svgEl('svg', { viewBox: '0 0 520 520', 'aria-hidden': 'true' });
  svg.append(svgEl('circle', { class: 'daily-dial__rim', cx: CX, cy: CY, r: 146 }));
  const spokes = svgEl('g');
  const bars = svgEl('g');
  const detail = svgEl('g');
  const labels = svgEl('g');
  const hand = svgEl('line', {
    class: 'daily-dial__now-hand',
    x1: CX,
    y1: CY,
    x2: CX,
    y2: 176
  });
  const halo = svgEl('circle', { class: 'daily-dial__now-halo', cx: CX, cy: 176, r: 6 });
  const dot = svgEl('circle', { class: 'daily-dial__now-dot', cx: CX, cy: 176, r: 5 });
  svg.append(spokes, bars, detail, labels, hand, halo, dot);
  const readout = el('div', 'daily-dial__readout');
  const dayName = el('p', 'daily-dial__day', clock.weekday);
  const timeEl = el('p', 'daily-dial__time');
  const dateEl = el('p', 'daily-dial__date', formatDisplayDate(clock.dateKey));
  readout.append(dayName, timeEl, dateEl);
  shell.replaceChildren(svg, readout);

  let lastBoundaries: number[] | null = null;

  const positionHand = (): void => {
    if (!lastBoundaries) return;
    const parts = hubClockParts(new Date(), timeZone);
    const frac = parts.minute / 60 + parts.second / 3600;
    const start = lastBoundaries[parts.hour]!;
    const end = lastBoundaries[parts.hour + 1]!;
    const at = point(HAND_R, start + frac * (end - start));
    hand.setAttribute('x2', at.x.toFixed(2));
    hand.setAttribute('y2', at.y.toFixed(2));
    dot.setAttribute('cx', at.x.toFixed(2));
    dot.setAttribute('cy', at.y.toFixed(2));
    halo.setAttribute('cx', at.x.toFixed(2));
    halo.setAttribute('cy', at.y.toFixed(2));
    const clockFace = formatClockTime(parts.hour, parts.minute);
    timeEl.replaceChildren(document.createTextNode(clockFace.time));
    const ampm = document.createElement('small');
    ampm.textContent = clockFace.ampm;
    timeEl.append(ampm);
    dayName.textContent = parts.weekday;
    dateEl.textContent = formatDisplayDate(parts.dateKey);
  };

  const ring = makeFisheyeRing({
    count: 24,
    defaultFocus: closestOccupiedHour(events, clock.hour),
    onFrame: (boundaries, focusIndex, settled) => {
      lastBoundaries = boundaries;
      spokes.replaceChildren();
      bars.replaceChildren();
      labels.replaceChildren();
      detail.replaceChildren();
      for (let i = 0; i < 24; i++) {
        const a0 = boundaries[i]!;
        const a1 = boundaries[i + 1]!;
        const span = a1 - a0;
        const focused = i === focusIndex;
        const spokeStart = point(R_IN - 6, a0);
        const spokeEnd = point(R_OUT_MAX + 8, a0);
        spokes.append(
          svgEl('line', {
            class: 'daily-dial__spoke',
            x1: spokeStart.x.toFixed(2),
            y1: spokeStart.y.toFixed(2),
            x2: spokeEnd.x.toFixed(2),
            y2: spokeEnd.y.toFixed(2)
          })
        );
        const data = occupancy[i]!;
        const outerR = focused
          ? R_OUT_MAX
          : R_IN + Math.max(data.occ, data.occ > 0 ? 0.16 : 0) * (R_OUT_MAX - R_IN);
        if (!focused) {
          const bar = drawArcBar(bars, a0, span, R_IN, Math.max(outerR, R_IN + 3), tintColor(data.cat), false);
          bar.addEventListener('click', () => ring.focus(i));
        }
        const hourEvents = eventsInHour(events, i);
        drawHit(bars, a0, span, () => ring.focus(i), `${hourCaption(i)}, ${hourEvents.length} ${hourEvents.length === 1 ? 'task' : 'tasks'}`);
        const mid = (a0 + a1) / 2;
        if (focused) {
          const at = point(R_OUT_MAX + 24, mid);
          const text = svgEl('text', {
            x: at.x.toFixed(2),
            y: at.y.toFixed(2),
            class: 'daily-dial__label daily-dial__label--focused'
          });
          text.textContent = hourCaption(i);
          labels.append(text);
        } else if (i % 3 === 0) {
          const at = point(R_OUT_MAX + 16, mid);
          const text = svgEl('text', { x: at.x.toFixed(2), y: at.y.toFixed(2), class: 'daily-dial__label' });
          text.textContent = hourShort(i);
          labels.append(text);
        }
      }
      if (settled && focusIndex != null) {
        const a0 = boundaries[focusIndex]!;
        const span = boundaries[focusIndex + 1]! - a0;
        for (let minute = 0; minute <= 60; minute += 10) {
          const ang = a0 + (minute / 60) * span;
          const p1 = point(R_IN - 3, ang);
          const p2 = point(BAND_IN - 2, ang);
          detail.append(
            svgEl('line', {
              class: 'daily-dial__tick',
              x1: p1.x.toFixed(2),
              y1: p1.y.toFixed(2),
              x2: p2.x.toFixed(2),
              y2: p2.y.toFixed(2)
            })
          );
        }
        renderFocusedEvents(
          detail,
          eventsInHour(events, focusIndex),
          a0,
          span,
          'No tasks',
          tasks,
          onOpen
        );
      }
      positionHand();
    }
  });

  positionHand();
  return {
    destroy: () => ring.destroy(),
    positionHand
  };
}

function mountWeekRing(
  shell: HTMLElement,
  days: Date[],
  byDay: Record<string, DialEvent[]>,
  todayKey: string,
  tasks: Task[],
  onOpen?: (task: Task) => void
): { destroy: () => void } {
  const svg = svgEl('svg', { viewBox: '0 0 520 520', 'aria-hidden': 'true' });
  svg.append(svgEl('circle', { class: 'daily-dial__rim', cx: CX, cy: CY, r: 146 }));
  const spokes = svgEl('g');
  const bars = svgEl('g');
  const detail = svgEl('g');
  const labels = svgEl('g');
  svg.append(spokes, bars, detail, labels);
  const readout = el('div', 'daily-dial__readout');
  const total = el('p', 'daily-dial__week-total', '0');
  const label = el('p', 'daily-dial__week-label', 'tasks this week');
  readout.append(total, label);
  shell.replaceChildren(svg, readout);

  const counts = days.map((day) => (byDay[toDateKey(day)] ?? []).length);
  const maxCount = Math.max(1, ...counts);
  const todayIdx = days.findIndex((day) => toDateKey(day) === todayKey);
  const weekTotal = counts.reduce((sum, count) => sum + count, 0);

  const ring = makeFisheyeRing({
    count: 7,
    defaultFocus: todayIdx >= 0 ? todayIdx : 0,
    onFrame: (boundaries, focusIndex, settled) => {
      spokes.replaceChildren();
      bars.replaceChildren();
      labels.replaceChildren();
      detail.replaceChildren();
      for (let i = 0; i < 7; i++) {
        const a0 = boundaries[i]!;
        const a1 = boundaries[i + 1]!;
        const span = a1 - a0;
        const focused = i === focusIndex;
        const isToday = i === todayIdx;
        const spokeStart = point(R_IN - 6, a0);
        const spokeEnd = point(R_OUT_MAX + 8, a0);
        spokes.append(
          svgEl('line', {
            class: 'daily-dial__spoke',
            x1: spokeStart.x.toFixed(2),
            y1: spokeStart.y.toFixed(2),
            x2: spokeEnd.x.toFixed(2),
            y2: spokeEnd.y.toFixed(2)
          })
        );
        const frac = counts[i]! / maxCount;
        const outerR = focused ? R_OUT_MAX : R_IN + Math.max(frac, 0.14) * (R_OUT_MAX - R_IN);
        const color = isToday ? 'var(--danger)' : 'var(--wave)';
        if (!focused) {
          const bar = drawArcBar(bars, a0, span, R_IN, outerR, color, false);
          bar.addEventListener('click', () => ring.focus(i));
        }
        drawHit(bars, a0, span, () => ring.focus(i), `${WEEK_DAYS[i]}, ${counts[i]} ${counts[i] === 1 ? 'task' : 'tasks'}`);
        if (!focused) {
          const mid = (a0 + a1) / 2;
          const at = point(R_OUT_MAX + 16, mid);
          const text = svgEl('text', { x: at.x.toFixed(2), y: at.y.toFixed(2), class: 'daily-dial__label' });
          if (isToday) text.setAttribute('fill', 'var(--danger)');
          text.textContent = WEEK_DAYS[i]!;
          labels.append(text);
        }
      }
      total.textContent = String(weekTotal);
      label.textContent = focusIndex != null ? `${WEEK_DAYS[focusIndex]}'s tasks` : 'tasks this week';
      if (settled && focusIndex != null) {
        const a0 = boundaries[focusIndex]!;
        const span = boundaries[focusIndex + 1]! - a0;
        const dayKey = toDateKey(days[focusIndex]!);
        const dayEvents = byDay[dayKey] ?? [];
        const scheduled = assignLanes(
          dayEvents.map((event) => ({
            start: event.start / 24,
            end: event.end / 24,
            ref: event
          }))
        );
        renderFocusedEvents(
          detail,
          scheduled.items.map((item) => ({
            ...item.ref,
            clipStart: item.start,
            clipEnd: item.end
          })),
          a0,
          span,
          'No tasks',
          tasks,
          onOpen
        );
      }
    }
  });

  return { destroy: () => ring.destroy() };
}

/** Test hook — reset Day/Week pill between specs. */
export function resetDailyDialSession(): void {
  sessionMode = 'day';
}

export function mountDailyDial(host: HTMLElement, options: DailyDialOptions): DailyDialHandle {
  const timeZone = options.timeZone ?? HUB_TZ;
  const now = options.now ?? new Date();
  const today = options.date ?? hubCalendarDate(now, timeZone);
  const todayKey = toDateKey(today);
  const domain = options.filters?.domain ?? 'all';
  const priority = options.filters?.priority ?? 'all';
  const visibleTasks = options.tasks.filter((task) => {
    if (domain !== 'all' && task.domain !== domain) return false;
    if (priority !== 'all' && task.priority !== priority) return false;
    return true;
  });
  const dayEvents = eventsFromTasks(visibleTasks, todayKey);
  const week = weekDays(today);
  const calendarFilters: CalendarFilters = {
    domain,
    projectId: 'all',
    query: '',
    includeDone: false,
    includeDates: true
  };
  const items = filterCalendarItems(collectCalendarItems(visibleTasks, options.projects), calendarFilters);
  const byDay = weekEventMap(items, week);

  host.replaceChildren();
  const panel = el('section', 'glass-panel daily-dial');
  panel.setAttribute('aria-label', 'Daily dial');
  const head = el('div', 'daily-dial__head');
  const dayPanel = el('div', 'daily-dial__panel');
  const weekPanel = el('div', 'daily-dial__panel');
  const dayShell = el('div', 'daily-dial__shell');
  const weekShell = el('div', 'daily-dial__shell');
  dayPanel.append(dayShell, el('p', 'daily-dial__hint', 'Tap an hour to open it up'));
  weekPanel.append(weekShell, el('p', 'daily-dial__hint', 'Tap a day to see its schedule'));

  const desc = el('p', 'visually-hidden');
  desc.id = 'daily-dial-desc';
  desc.textContent = dayEvents.length
    ? `Today: ${dayEvents.map((event) => `${event.title} ${event.timed ? formatDialTime(event.start) : 'anytime'}`).join(', ')}`
    : 'No timed work on the dial today.';

  const legend = el('div', 'daily-dial__legend');
  for (const item of DIAL_LEGEND) {
    const row = el('span', 'daily-dial__legend-item');
    const dot = el('span', 'daily-dial__legend-dot');
    dot.dataset.tint = item.tint;
    row.append(dot, document.createTextNode(item.label));
    legend.append(row);
  }

  let dayRing: { destroy: () => void; positionHand: () => void } | null = null;
  let weekRing: { destroy: () => void } | null = null;
  let clockTimer: number | null = null;

  const pills = createHubPills({
    label: 'Dial view',
    role: 'tablist',
    items: [
      { id: 'day', label: 'Day' },
      { id: 'week', label: 'Week' }
    ],
    value: sessionMode,
    onSelect: (id) => showMode(id, true)
  });

  function syncPills(mode: DialMode): void {
    for (const btn of pills.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')) {
      const id = btn.textContent === 'Week' ? 'week' : 'day';
      const active = id === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    }
  }

  const showMode = (mode: DialMode, animate: boolean): void => {
    sessionMode = mode;
    syncPills(mode);
    const showing = mode === 'week' ? weekPanel : dayPanel;
    const hiding = mode === 'week' ? dayPanel : weekPanel;
    hiding.hidden = true;
    showing.hidden = false;
    hiding.classList.remove('is-leaving');
    if (animate && !prefersReducedMotion()) {
      showing.classList.add('is-leaving');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => showing.classList.remove('is-leaving'));
      });
    }
    if (mode === 'day' && !dayRing) {
      dayRing = mountDayRing(dayShell, dayEvents, now, timeZone, visibleTasks, options.onOpen);
    }
    if (mode === 'week' && !weekRing) {
      weekRing = mountWeekRing(weekShell, week, byDay, todayKey, visibleTasks, options.onOpen);
    }
  };

  head.append(pills);

  panel.append(head, desc, dayPanel, weekPanel, legend);
  host.append(panel);
  showMode(sessionMode, false);
  clockTimer = window.setInterval(() => {
    if (!host.isConnected) {
      if (clockTimer != null) window.clearInterval(clockTimer);
      return;
    }
    dayRing?.positionHand();
  }, 15_000);

  return {
    destroy: () => {
      if (clockTimer != null) window.clearInterval(clockTimer);
      dayRing?.destroy();
      weekRing?.destroy();
    }
  };
}
