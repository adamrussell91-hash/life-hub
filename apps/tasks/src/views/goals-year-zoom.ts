/**
 * G-17 Term ↔ Year zoom for the Goals runway.
 * Same rules as Term River: layout via buildTimeScale placers, one createMotion blend,
 * no remount mid-zoom. Phone (<720) uses a term list instead.
 */
import type { Goal, GoalSphere } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { SchoolTerm } from '@/domain/school-time';
import { addDaysKey } from '@/domain/school-time';
import { buildYearRunway, type YearRunway } from '@/domain/goal-runway';
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
const PAD_R = 16;

type Placer = (X: (d: string) => number, weekW: number) => void;

export type YearZoomHandle = {
  setMode: (mode: 'term' | 'year') => void;
  dispose: () => void;
  el: HTMLElement;
  mode: () => 'term' | 'year';
  blend: () => number;
};

function prefersPhone(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 719px)').matches;
}

function scaleFor(
  zoom: 'term' | 'year',
  year: YearRunway,
  focus: SchoolTerm,
  plotW: number
): (d: string) => number {
  const unit = year.scale;
  const from = zoom === 'term' ? focus.starts_on : year.from;
  const to = zoom === 'term' ? focus.ends_on : year.to;
  const x0 = unit.x(from);
  const span = Math.max(1, unit.x(addDaysKey(to, 1)) - x0);
  return (d: string) => LABEL_W + ((unit.x(d) - x0) / span) * plotW;
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

  if (prefersPhone()) {
    return mountPhoneYearList(host, yearData, data, overlay, initialMode);
  }

  host.replaceChildren();
  const root = el('section', 'glass-tile runway runway--zoom');
  root.setAttribute('data-part', 'year-zoom');
  root.setAttribute('aria-label', initialMode === 'year' ? 'Year runway' : 'Term runway');

  const plot = el('div', 'runway-zoom__plot');
  const placers: Placer[] = [];
  let engine: ReturnType<typeof createMotion> | null = null;
  let blendT = initialMode === 'year' ? 1 : 0;
  let mode: 'term' | 'year' = initialMode;
  let W = Math.max(640, host.clientWidth || 960);

  const axis = el('div', 'runway-zoom__axis');
  plot.append(axis);

  for (const week of yearData.weeks) {
    const tick = el('span', `runway-zoom__tick${week.holiday ? ' is-holiday' : ''}${week.isNow ? ' is-now' : ''}`);
    tick.textContent = week.label;
    tick.title = week.monday;
    axis.append(tick);
    placers.push((X, weekW) => {
      tick.style.left = `${X(week.monday)}px`;
      tick.style.width = `${Math.max(12, weekW)}px`;
    });
  }

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
      if (ongoing) rowEl.classList.add('runway__row--ongoing');

      const info = el('div', 'runway-zoom__info');
      const title = el('p', 'runway__goal-title', row.goal.title);
      title.setAttribute('data-hub-morph', 'title');
      title.append(el('span', 'runway__chip', STRUCTURE_CHIP[row.goal.structure]));
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
      placers.push((X) => {
        const left = X(spanFrom);
        const right = X(addDaysKey(spanTo, 1));
        bar.style.left = `${left}px`;
        bar.style.width = `${Math.max(8, right - left)}px`;
      });

      for (const cell of row.cells) {
        if (cell.state === 'holiday') continue;
        const mark = el('i', `cell cell--${cell.state}`);
        mark.classList.toggle('is-now', cell.isNow);
        mark.classList.toggle('is-proposed', cell.proposed);
        mark.classList.toggle('has-milestone', cell.milestone);
        mark.title = `${cell.monday}: ${cell.state}${cell.count ? ` (${cell.count})` : ''}`;
        track.append(mark);
        placers.push((X, weekW) => {
          mark.style.left = `${X(cell.monday) + Math.max(0, (weekW - 20) / 2)}px`;
        });
      }

      const move = el('p', 'runway__move');
      move.append(el('b', '', 'Move'), document.createTextNode(row.move?.title ?? 'Add a next start'));
      if (overlay.proposalGoalIds.has(row.goal.id)) {
        move.append(el('span', 'is-proposal', ' · Hammond has a proposal'));
      }

      rowEl.append(info, track, move);
      rowEl.addEventListener('click', () => rememberGoalMorph(title));
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
    const plotW = Math.max(200, W - LABEL_W - PAD_R);
    const A = scaleFor('term', yearData, focus, plotW);
    const B = scaleFor('year', yearData, focus, plotW);
    const X = (d: string) => A(d) + (B(d) - A(d)) * blendT;
    const schoolWeek = focus.starts_on;
    const weekW = X(addDaysKey(schoolWeek, 7)) - X(schoolWeek);
    for (const place of placers) place(X, weekW);
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
  data: YearZoomData,
  _overlay: YearZoomOverlay,
  mode: 'term' | 'year'
): YearZoomHandle {
  host.replaceChildren();
  const wrap = el('section', 'glass-tile runway runway--year runway--phone');
  if (mode === 'year') {
    for (const term of yearData.terms) {
      const block = el('div', 'runway__year-term');
      block.append(el('h3', '', `Term ${term.term}`));
      const goals = yearData.lanes.flatMap((l) =>
        [...l.rows, ...l.ongoing]
          .filter((r) => !r.goal.term || r.goal.term.term === term.term)
          .map((r) => r.goal)
      );
      if (!goals.length) {
        block.append(el('p', 'runway__empty', 'No goals this term.'));
      } else {
        for (const goal of goals) {
          const link = el('a', 'runway-phone__card') as HTMLAnchorElement;
          link.href = goalPageHash(goal.id);
          link.append(el('p', 'runway__goal-title', goal.title));
          block.append(link);
        }
      }
      wrap.append(block);
    }
  } else {
    for (const lane of yearData.lanes) {
      for (const row of [...lane.rows, ...lane.ongoing]) {
        const link = el('a', 'runway-phone__card') as HTMLAnchorElement;
        link.href = goalPageHash(row.goal.id);
        link.append(el('p', 'runway__goal-title', row.goal.title));
        const now = row.cells.find((c) => c.isNow);
        if (now) {
          const mark = el('i', `cell cell--${now.state}`);
          link.append(mark);
        }
        link.append(el('p', 'runway__move', row.move?.title ?? 'Add a next start'));
        wrap.append(link);
      }
    }
  }
  host.append(wrap);
  let current = mode;
  return {
    el: wrap,
    mode: () => current,
    blend: () => (current === 'year' ? 1 : 0),
    setMode(next) {
      if (next === current) return;
      current = next;
      mountPhoneYearList(host, yearData, data, _overlay, next);
    },
    dispose() {
      /* phone list has no engine */
    }
  };
}

export type { GoalSphere };
