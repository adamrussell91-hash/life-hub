/**
 * G-17 Term ↔ Year zoom for the Goals runway.
 * Same rules as Term River: layout via placers, one createMotion blend,
 * no remount mid-zoom. Phone (<720) uses a term list instead — remount on resize.
 */
import type { Goal, GoalSphere } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { SchoolTerm } from '@/domain/school-time';
import { addDaysKey } from '@/domain/school-time';
import { buildYearRunway, type YearRunway, type RunwayWeek, type RunwayRow } from '@/domain/goal-runway';
import { goalPageHash } from '@/domain/cards';
import { LANE_CAP } from '@/domain/goal-hosting';
import { createMotion, EASE } from '../../design-kit/js/hub-motion-engine.js';
import { el } from '@/views/hub-kit';
import { rememberGoalMorph } from '@/domain/goal-morph';

export type YearZoomData = {
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  terms: SchoolTerm[];
  today: string;
};

export type YearZoomOverlay = {
  crunchWeeks: string[];
  proposedRest: Record<string, string[]>;
  proposalGoalIds: Set<string>;
};

const STRUCTURE_CHIP: Record<Goal['structure'], string> = {
  woop: 'WOOP',
  smarter: 'SMARTER',
  okr: 'OKR',
  lead_lag: 'LEAD/LAG',
  floor_target_stretch: 'FLOOR·TARGET'
};

const ZOOM_MS = 500;
const LABEL_W = 200;
/** Move column (~10rem) — plot must end before it (Term River rule 3). */
const PAD_R = 160;
/** Below this school-week width, axis shows months (Term River rule 5). */
const MIN_WEEK_LABEL = 46;

type Place = {
  /** 0 at the left of the track, 100 at the right. Not pixels, and not shifted by the label column. */
  x: (d: string) => number;
  weekPct: number;
  weekPx: number;
  mode: 'term' | 'year';
};
type Placer = (place: Place) => void;

export type YearZoomHandle = {
  setMode: (mode: 'term' | 'year') => void;
  dispose: () => void;
  el: HTMLElement;
  mode: () => 'term' | 'year';
  blend: () => number;
};

export function prefersPhone(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 719px)').matches;
}

function shortWeekLabel(label: string): string {
  return label.replace(/^Hol W/, 'H').replace(/^T\d W/, 'W');
}

function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let key = `${from.slice(0, 7)}-01`;
  const end = to.slice(0, 7);
  while (key.slice(0, 7) <= end) {
    out.push(key);
    const [y, m] = key.split('-').map(Number);
    const nextM = m === 12 ? 1 : m! + 1;
    const nextY = m === 12 ? y! + 1 : y!;
    key = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  }
  return out;
}

/** Percent across the focused range. 0 is the left edge of the track. Dates outside the range fall outside 0–100. */
export function zoomPercent(
  zoom: 'term' | 'year',
  year: YearRunway,
  focus: SchoolTerm,
  date: string
): number {
  const unit = year.scale;
  const from = zoom === 'term' ? focus.starts_on : year.from;
  const to = zoom === 'term' ? focus.ends_on : year.to;
  const x0 = unit.x(from);
  const span = Math.max(1, unit.x(addDaysKey(to, 1)) - x0);
  return ((unit.x(date) - x0) / span) * 100;
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function termWeeksOnly(yearData: YearRunway, focus: SchoolTerm): RunwayWeek[] {
  return yearData.weeks.filter((w) => w.monday >= focus.starts_on && w.monday <= focus.ends_on);
}

export function mountYearZoom(
  host: HTMLElement,
  data: YearZoomData,
  overlay: YearZoomOverlay,
  focus: SchoolTerm,
  initialMode: 'term' | 'year'
): YearZoomHandle | null {
  const year = focus.starts_on.slice(0, 4);
  const yearData = buildYearRunway({
    goals: data.goals,
    projects: data.projects,
    tasks: data.tasks,
    terms: data.terms,
    year,
    today: data.today,
    crunchWeeks: overlay.crunchWeeks,
    proposedRest: overlay.proposedRest
  });
  if (!yearData) return null;

  let media = typeof matchMedia === 'function' ? matchMedia('(max-width: 719px)') : null;
  let disposed = false;
  let currentMode: 'term' | 'year' = initialMode;
  let inner: YearZoomHandle | null = null;

  const remount = () => {
    if (disposed) return;
    inner?.dispose();
    if (prefersPhone()) {
      inner = mountPhoneYearList(host, yearData, overlay, focus, currentMode);
    } else {
      inner = mountDesktopZoom(host, yearData, overlay, focus, currentMode);
    }
  };

  remount();

  const onMedia = () => remount();
  media?.addEventListener?.('change', onMedia);

  return {
    get el() {
      return inner!.el;
    },
    mode: () => currentMode,
    blend: () => inner!.blend(),
    setMode(next) {
      if (next === currentMode) return;
      currentMode = next;
      if (prefersPhone()) {
        remount();
      } else {
        inner?.setMode(next);
      }
    },
    dispose() {
      disposed = true;
      media?.removeEventListener?.('change', onMedia);
      media = null;
      inner?.dispose();
      inner = null;
    }
  };
}

function mountDesktopZoom(
  host: HTMLElement,
  yearData: YearRunway,
  overlay: YearZoomOverlay,
  focus: SchoolTerm,
  initialMode: 'term' | 'year'
): YearZoomHandle {
  host.replaceChildren();
  const root = el('section', 'glass-tile runway runway--zoom');
  root.setAttribute('data-part', 'year-zoom');
  root.setAttribute('aria-label', initialMode === 'year' ? 'Year runway' : 'Term runway');
  root.classList.remove('runway--phone');

  const plot = el('div', 'runway-zoom__plot');
  const placers: Placer[] = [];
  let engine: ReturnType<typeof createMotion> | null = null;
  let blendT = initialMode === 'year' ? 1 : 0;
  let mode: 'term' | 'year' = initialMode;
  let W = Math.max(640, host.clientWidth || 960);

  const axis = el('div', 'runway-zoom__axis');
  plot.append(axis);

  const focusWeeks = termWeeksOnly(yearData, focus);
  // Term mode: W1…Wn only. Year mode: all year weeks with fit/fallback.
  const termTicks = focusWeeks.map((week, i) => ({
    ...week,
    label: `W${i + 1}`,
    short: `W${i + 1}`
  }));
  const yearTicks = yearData.weeks.map((week) => ({
    ...week,
    short: shortWeekLabel(week.label)
  }));

  const tickEls: Array<{
    el: HTMLElement;
    term?: (typeof termTicks)[0];
    year: (typeof yearTicks)[0];
  }> = [];

  for (const week of yearTicks) {
    const tick = el('span', `runway-zoom__tick${week.holiday ? ' is-holiday' : ''}${week.isNow ? ' is-now' : ''}`);
    tick.title = week.monday;
    axis.append(tick);
    const termMatch = termTicks.find((t) => t.monday === week.monday);
    tickEls.push({ el: tick, term: termMatch, year: week });
    placers.push(({ x, weekPct, weekPx, mode }) => {
      const inTerm = Boolean(termMatch);
      if (mode === 'term' && !inTerm) {
        tick.style.opacity = '0';
        tick.style.pointerEvents = 'none';
        return;
      }
      const label = mode === 'term' && termMatch ? termMatch.label : week.label;
      const short = mode === 'term' && termMatch ? termMatch.short : week.short;
      const left = x(week.monday);
      if (left < -0.5 || left >= 100) {
        tick.style.opacity = '0';
        tick.style.pointerEvents = 'none';
        return;
      }
      tick.style.left = `${left}%`;
      tick.style.width = `${Math.max(0, Math.min(weekPct, 100 - left))}%`;
      if (mode === 'year' && weekPx < MIN_WEEK_LABEL) {
        tick.style.opacity = '0';
        tick.textContent = '';
        return;
      }
      const room = weekPx - 4;
      const useFull = label.length * 7 <= room;
      const useShort = short.length * 7 <= room;
      tick.textContent = useFull ? label : useShort ? short : '';
      tick.style.opacity = tick.textContent ? '1' : '0';
      tick.style.pointerEvents = 'auto';
    });
  }

  // Month labels (year mode only, when weeks are too narrow). Width is the month's share of the track.
  const monthEls: HTMLElement[] = [];
  const monthStarts = monthsInRange(yearData.from, yearData.to);
  monthStarts.forEach((month, index) => {
    const name = new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: 'UTC' }).format(
      new Date(`${month}T00:00:00Z`)
    );
    const next = monthStarts[index + 1] ?? addDaysKey(yearData.to, 1);
    const tick = el('span', 'runway-zoom__tick runway-zoom__tick--month');
    tick.textContent = name;
    tick.hidden = true;
    axis.append(tick);
    monthEls.push(tick);
    placers.push(({ x, weekPx, mode }) => {
      if (mode !== 'year' || weekPx >= MIN_WEEK_LABEL) {
        tick.hidden = true;
        return;
      }
      const left = clampPct(x(month));
      const right = clampPct(x(next));
      if (right - left < 0.5) {
        tick.hidden = true;
        return;
      }
      tick.hidden = false;
      tick.style.left = `${left}%`;
      tick.style.width = `${right - left}%`;
      tick.style.opacity = '1';
    });
  });

  for (const lane of yearData.lanes) {
    const laneEl = el('div', `runway-zoom__lane runway__lane--${lane.sphere}`);
    const label = el('div', 'runway-zoom__lane-label');
    label.append(
      el('span', 'runway__dot'),
      el('span', '', lane.label),
      el('small', '', `${lane.slotsUsed} of ${LANE_CAP} slots`)
    );
    laneEl.append(label);

    const rowsHost = el('div', 'runway-zoom__rows');
    const allRows = [
      ...lane.rows.map((r) => ({ row: r, ongoing: false })),
      ...lane.ongoing.map((r) => ({ row: r, ongoing: true }))
    ];

    if (!allRows.length) {
      rowsHost.append(el('p', 'runway__empty', 'No active goals in this lane.'));
    }

    for (const { row, ongoing } of allRows) {
      const rowEl = el('a', `runway-zoom__row runway__row--${lane.sphere}`) as HTMLAnchorElement;
      rowEl.href = goalPageHash(row.goal.id);
      rowEl.setAttribute('tabindex', '0');
      rowEl.setAttribute('aria-label', `${row.goal.title}. Open goal.`);
      if (ongoing) rowEl.classList.add('runway__row--ongoing');

      const info = el('div', 'runway-zoom__info');
      const title = el('p', 'runway__goal-title');
      const titleText = el('span', 'runway__goal-title-text', row.goal.title);
      titleText.setAttribute('data-hub-morph', 'title');
      title.append(titleText, el('span', 'runway__chip', STRUCTURE_CHIP[row.goal.structure]));
      if (ongoing) title.append(el('span', 'runway__chip runway__chip--ongoing', 'Ongoing'));
      const leadFig = el('p', 'runway__goal-meta runway__lead-fig');
      if (row.thisWeek.perWeek !== null) {
        const fig = el('span', 'runway__lead-count');
        fig.setAttribute('data-hub-count', '');
        fig.textContent = `${row.thisWeek.count}/${row.thisWeek.perWeek}`;
        leadFig.append(fig, document.createTextNode(' this week'));
      } else {
        leadFig.textContent = row.goal.lead_measure?.label ?? 'No lead measure yet';
      }
      info.append(title, leadFig);

      const track = el('div', 'runway-zoom__track');
      const spanFrom = row.span?.from ?? focus.starts_on;
      const spanTo = row.span?.to ?? focus.ends_on;
      const bar = el('div', 'runway-zoom__bar');
      bar.setAttribute('data-span', `${spanFrom}:${spanTo}`);
      track.append(bar);
      placers.push(({ x }) => {
        const left = clampPct(x(spanFrom));
        const right = clampPct(x(addDaysKey(spanTo, 1)));
        const width = Math.max(0, right - left);
        bar.style.left = `${left}%`;
        bar.style.width = `${width}%`;
        bar.style.opacity = width > 0 ? '0.55' : '0';
      });

      for (const cell of row.cells) {
        if (cell.state === 'holiday') continue;
        const inFocus = cell.monday >= focus.starts_on && cell.monday <= focus.ends_on;
        const mark = el('i', `cell cell--${cell.state}`);
        mark.classList.toggle('is-now', cell.isNow);
        mark.classList.toggle('is-proposed', cell.proposed);
        mark.classList.toggle('has-milestone', cell.milestone);
        mark.title = `${cell.monday}: ${cell.state}${cell.count ? ` (${cell.count})` : ''}`;
        track.append(mark);
        placers.push(({ x, weekPct, weekPx, mode }) => {
          const left = x(cell.monday);
          if ((mode === 'term' && !inFocus) || left < 0 || left >= 100) {
            mark.style.opacity = '0';
            return;
          }
          mark.style.opacity = '1';
          const size = Math.min(20, Math.max(12, weekPx - 4));
          mark.style.width = `${size}px`;
          mark.style.height = `${size}px`;
          mark.style.left = `calc(${left}% + ${weekPct / 2}% - ${size / 2}px)`;
        });
      }

      const move = el('p', 'runway__move');
      move.append(el('b', '', 'Move'), document.createTextNode(row.move?.title ?? 'Add a next start'));
      if (overlay.proposalGoalIds.has(row.goal.id)) {
        move.append(el('span', 'is-proposal', ' · Hammond has a proposal'));
      }

      rowEl.append(info, track, move);
      const go = () => rememberGoalMorph(titleText);
      rowEl.addEventListener('click', go);
      rowEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        go();
        window.location.hash = goalPageHash(row.goal.id);
      });
      rowsHost.append(rowEl);
    }

    if (lane.parked.length) {
      const parked = el('details', 'runway__parked');
      parked.append(el('summary', '', `Not this term (${lane.parked.length})`));
      for (const goal of lane.parked) {
        const link = el('a', '', `${goal.title} · ${goal.status}`) as HTMLAnchorElement;
        link.href = goalPageHash(goal.id);
        parked.append(link);
      }
      rowsHost.append(parked);
    }

    laneEl.append(rowsHost);
    plot.append(laneEl);
  }

  root.append(plot);
  host.append(root);

  const apply = (id: string, p: Readonly<Record<string, number>>) => {
    if (id !== '__zoom') return;
    blendT = p.t ?? 0;
    const axisPx = axis.clientWidth || Math.max(200, W - 48 - LABEL_W - PAD_R - 16);
    const x = (d: string) =>
      zoomPercent('term', yearData, focus, d) +
      (zoomPercent('year', yearData, focus, d) - zoomPercent('term', yearData, focus, d)) * blendT;
    const schoolWeek = focus.starts_on;
    const weekPct = x(addDaysKey(schoolWeek, 7)) - x(schoolWeek);
    const weekPx = (weekPct / 100) * axisPx;
    const mode: 'term' | 'year' = blendT < 0.5 ? 'term' : 'year';
    for (const place of placers) place({ x, weekPct, weekPx, mode });
    void tickEls;
    void monthEls;
  };

  engine = createMotion({ apply });
  engine.place('__zoom', { t: blendT });
  apply('__zoom', { t: blendT });

  const onResize = () => {
    W = Math.max(640, host.clientWidth || 960);
    apply('__zoom', { t: blendT });
  };
  window.addEventListener('resize', onResize);

  return {
    el: root,
    mode: () => mode,
    blend: () => blendT,
    setMode(next) {
      if (next === mode) return;
      mode = next;
      root.setAttribute('aria-label', next === 'year' ? 'Year runway' : 'Term runway');
      engine?.to('__zoom', { t: next === 'year' ? 1 : 0 }, { duration: ZOOM_MS, easing: EASE });
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      engine?.dispose();
      engine = null;
    }
  };
}

function mountPhoneYearList(
  host: HTMLElement,
  yearData: YearRunway,
  overlay: YearZoomOverlay,
  focus: SchoolTerm,
  mode: 'term' | 'year'
): YearZoomHandle {
  host.replaceChildren();
  const wrap = el('section', 'glass-tile runway runway--year runway--phone runway--year-list');
  wrap.setAttribute('data-part', 'year-zoom');
  wrap.append(el('h2', 'runway-phone__period', mode === 'year' ? yearData.year : `Term ${focus.term}`));

  if (mode === 'year') {
    for (const term of yearData.terms) {
      const block = el('div', 'runway__year-term');
      block.append(el('h3', '', `Term ${term.term}`));
      const goals = yearData.lanes.flatMap((l) =>
        [...l.rows, ...l.ongoing]
          .filter((r) => !r.goal.term || r.goal.term.term === term.term)
          .map((r) => ({ goal: r.goal, row: r }))
      );
      if (!goals.length) {
        block.append(el('p', 'runway__empty', 'No goals this term.'));
      } else {
        for (const { goal, row } of goals) {
          block.append(phoneCard(goal, row, overlay));
        }
      }
      wrap.append(block);
    }
  } else {
    for (const lane of yearData.lanes) {
      wrap.append(el('h3', 'runway-phone__lane', lane.label));
      const rows = [...lane.rows, ...lane.ongoing];
      if (!rows.length) {
        wrap.append(el('p', 'runway__empty', 'No active goals in this lane.'));
        continue;
      }
      for (const row of rows) {
        wrap.append(phoneCard(row.goal, row, overlay));
      }
    }
  }
  host.append(wrap);
  return {
    el: wrap,
    mode: () => mode,
    blend: () => (mode === 'year' ? 1 : 0),
    setMode() {
      /* parent remounts on mode change */
    },
    dispose() {
      /* phone list has no engine */
    }
  };
}

function phoneCard(
  goal: Goal,
  row: RunwayRow,
  overlay: YearZoomOverlay
): HTMLAnchorElement {
  const link = el('a', 'runway-phone__card') as HTMLAnchorElement;
  link.href = goalPageHash(goal.id);
  link.setAttribute('tabindex', '0');
  const title = el('p', 'runway__goal-title', goal.title);
  title.setAttribute('data-hub-morph', 'title');
  link.append(title);
  const now = row.cells.find((c) => c.isNow);
  if (now) {
    const mark = el('i', `cell cell--${now.state}`);
    mark.classList.add('is-now');
    link.append(mark);
  }
  const move = el('p', 'runway__move');
  move.append(el('b', '', 'Move'), document.createTextNode(row.move?.title ?? 'Add a next start'));
  if (overlay.proposalGoalIds.has(goal.id)) {
    move.append(el('span', 'is-proposal', ' · Hammond has a proposal'));
  }
  link.append(move);
  link.addEventListener('click', () => rememberGoalMorph(title));
  link.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    rememberGoalMorph(title);
    window.location.hash = goalPageHash(goal.id);
  });
  return link;
}

export type { GoalSphere };
