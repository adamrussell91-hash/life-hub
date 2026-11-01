/**
 * Projects runway — the default Projects view. One shared time axis, projects grouped by
 * what they need (Needs you · In the air · Stuck on the ground · Landed), a track per project
 * built from its real tasks, milestones, runway plan and linked thinking-tool sessions.
 *
 * Painting rule: build once, then patch. A change rebuilds the pure model, re-renders only the
 * rows it touched, moves rows between groups, and FLIPs whatever moved. Drags (the TODAY knob,
 * an end-date flag) only touch transforms / left / widths inside a rAF.
 */
import './projects-runway.css';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { PlanningProfile } from '@/schemas/planning-profile';
import type { SchoolTerm } from '@/domain/school-time';
import { projectPageHash } from '@/domain/cards';
import { FORECAST_HORIZON_DAYS } from '@/domain/projects-pulse';
import {
  HEALTH_LABEL,
  RUNWAY_SPAN_DAYS,
  RUNWAY_TOOLS,
  RUNWAY_TOOL_ORDER,
  buildRunway,
  buildRunwayRow,
  countWord,
  dayAtX,
  finishDateChoices,
  keyAtOffset,
  minutesLabel,
  monthTicks,
  runwayGeometry,
  runwayLede,
  runwayOrder,
  scrubState,
  sessionHref,
  spanPct,
  weeksLabel,
  type RunwayGroupId,
  type RunwayInput,
  type RunwayModel,
  type RunwayRow,
  type RunwaySessionSource,
  type RunwayTool
} from '@/domain/projects-runway';
import { tasksApi } from '@/services/client-api';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { offerTimedUndo, showHubToast } from '../../design-kit/js/hub-feedback.js';
import { showCompleteConfirm } from '@/views/card-actions';
import { errorMessage } from '@/views/feedback';
import { createHubPills, el, taskDomains } from '@/views/hub-kit';
import {
  changeBookApi,
  collaborationBookApi,
  communicationBookApi,
  decisionBookApi,
  gearShifterApi,
  problemSolverApi,
  rulesBookApi,
  type SessionApi
} from '@/views/problem-solver/api';

type EnergyFilter = 'all' | 'deep_focus' | 'admin_heavy';

/** Kept across repaints (search typing, view toggles) for this page load. */
let runwayEnergy: EnergyFilter = 'all';

export function resetRunwayStateForTests(): void {
  runwayEnergy = 'all';
}

const TOOL_API: Partial<Record<RunwayTool, SessionApi>> = {
  problem_solver: problemSolverApi,
  decision_maker: decisionBookApi,
  gear_shifter: gearShifterApi,
  rules_book: rulesBookApi,
  change_book: changeBookApi,
  collaboration_book: collaborationBookApi,
  communication_book: communicationBookApi
};

/** One `list()` per tool; a tool that fails is left out. */
export async function loadRunwaySessions(): Promise<RunwaySessionSource[]> {
  const lists = await Promise.all(
    RUNWAY_TOOL_ORDER.map(async (tool) => {
      const api = TOOL_API[tool];
      if (!api) return [];
      try {
        const sessions = await api.list();
        return sessions.map((s) => ({
          tool,
          id: s.id,
          title: s.title,
          phase: s.phase,
          status: s.status,
          links: s.links ?? [],
          reviewDue: s.reviewDue ?? null
        }));
      } catch {
        return [];
      }
    })
  );
  return lists.flat();
}

export type RunwayData = {
  projects: Project[];
  archivedProjects: Project[];
  tasks: Task[];
  stallIds: ReadonlySet<string>;
  now: Date;
};

export type RunwayDeps = {
  /** Shared with the page: writes here keep Board in step. Read fresh on every rebuild. */
  data: RunwayData;
  profile: PlanningProfile;
  filter: (project: Project) => boolean;
  /** Where the complete-project confirm lands. */
  confirmHost: HTMLElement;
  onReload: () => void;
  /** The page recomputes stall ids and cards after a local write. */
  onDataChanged: () => void;
  /** First paint of this page load: bars grow in. */
  grow: boolean;
  loadSessions: () => Promise<RunwaySessionSource[]>;
  loadTerms: () => Promise<SchoolTerm[]>;
  badge?: (project: Project) => HTMLElement | null;
};

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const FLIP_MS = 300;
const FLIP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function reducedMotion(): boolean {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function canAnimate(node: Element): node is HTMLElement & { animate: Element['animate'] } {
  return typeof (node as HTMLElement).animate === 'function' && !reducedMotion();
}

function day(key: string | null | undefined): string {
  return key ? formatDisplayDate(key) : '';
}

function toolEl<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, tool: RunwayTool): HTMLElementTagNameMap[K] {
  const node = el(tag, className);
  node.dataset.tool = tool;
  return node;
}

function glyph(tool: RunwayTool, className = 'runway-glyph'): HTMLElement {
  const g = el('i', className, RUNWAY_TOOLS[tool].glyph);
  g.setAttribute('aria-hidden', 'true');
  return g;
}

export function mountProjectsRunway(deps: RunwayDeps): HTMLElement {
  const { data } = deps;
  let sessions: RunwaySessionSource[] = [];
  let sessionsLoaded = false;
  let viewDay = 0;
  let model: RunwayModel;
  const rowEls = new Map<string, HTMLElement>();
  const groupEls = new Map<RunwayGroupId, { root: HTMLElement; list: HTMLElement; count: HTMLElement }>();
  const pending = new Set<string>();

  const input = (extra: Partial<RunwayInput> = {}): RunwayInput => ({
    projects: data.projects.filter(deps.filter),
    archivedProjects: data.archivedProjects.filter(deps.filter),
    tasks: data.tasks,
    stallIds: data.stallIds,
    now: data.now,
    profile: deps.profile,
    sessions,
    ...extra
  });
  const rowById = (id: string): RunwayRow | undefined => model.rows.find((r) => r.project.id === id);

  // ------------------------------------------------------------ shell
  const root = el('section', 'runway');
  root.id = 'projects-runway';
  root.setAttribute('aria-label', 'Projects runway');

  const lede = el('p', 'runway-lede');
  lede.setAttribute('aria-live', 'polite');
  const dials = el('div', 'runway-dials');
  const loadDial = el('div', 'runway-dial runway-dial--load');
  const sessionsDial = el('div', 'runway-dial runway-dial--sessions');
  const energyDial = el('div', 'runway-dial runway-dial--energy');
  energyDial.append(
    el('span', 'runway-dial__label', 'Energy for'),
    createHubPills<EnergyFilter>({
      label: 'Energy for',
      items: [
        { id: 'all', label: 'Anything' },
        { id: 'deep_focus', label: 'Deep focus' },
        { id: 'admin_heavy', label: 'Admin' }
      ],
      value: runwayEnergy,
      onSelect: (id) => {
        runwayEnergy = id;
        applyDim();
      }
    })
  );
  dials.append(loadDial, energyDial, sessionsDial);

  const tools = el('div', 'runway-tools');
  const unstick = el('button', 'btn btn--decisive runway-unstick');
  unstick.type = 'button';
  const back = el('button', 'btn btn--secondary runway-back', 'Back to today');
  back.type = 'button';
  back.hidden = true;
  tools.append(
    unstick,
    back,
    el('span', 'runway-hint', 'Drag TODAY to look ahead · drag a flag to move a finish date · tap a block to tick a task')
  );

  const board = el('div', 'runway-board');
  const axis = el('div', 'runway-axis');
  const scale = el('div', 'runway-scale');
  scale.tabIndex = 0;
  scale.setAttribute('role', 'slider');
  scale.setAttribute('aria-label', 'Look ahead');
  scale.setAttribute('aria-valuemin', '0');
  scale.setAttribute('aria-valuemax', String(RUNWAY_SPAN_DAYS));
  const band = el('span', 'runway-scale__band');
  scale.append(band);
  for (const tick of monthTicks(data.now)) {
    const t = el('span', 'runway-scale__tick', tick.label);
    t.style.left = `${spanPct(tick.day)}%`;
    scale.append(t);
  }
  const knob = el('span', 'runway-knob', 'TODAY');
  scale.append(knob);
  axis.append(el('span', 'runway-axis__ttl', 'Project · next action'), scale);
  board.append(axis);

  const groupsHost = el('div', 'runway-groups');
  for (const id of ['needs_you', 'in_air', 'on_ground', 'landed'] as RunwayGroupId[]) {
    const g = el('section', `runway-group runway-group--${id}`);
    g.dataset.group = id;
    const head = el('div', 'runway-group__head');
    const count = el('span', 'runway-group__count');
    const title = el('h2', 'runway-group__title');
    const hint = el('span', 'runway-group__hint');
    head.append(count, title, hint);
    const list = el('div', 'runway-group__rows');
    g.append(head, list);
    groupsHost.append(g);
    groupEls.set(id, { root: g, list, count });
  }
  board.append(groupsHost);

  const legend = el('div', 'runway-legend');
  for (const [cls, label] of [
    ['today', 'Today'],
    ['band', `Next ${FORECAST_HORIZON_DAYS} days`],
    ['buffer', 'Buffer before the finish'],
    ['startby', 'Start by'],
    ['ms', 'Milestone'],
    ['gate', 'Gate'],
    ['review', 'Thinking-tool review']
  ] as const) {
    const item = el('span', 'runway-legend__item');
    item.append(el('i', `runway-legend__key runway-legend__key--${cls}`), document.createTextNode(label));
    legend.append(item);
  }

  root.append(lede, dials, tools, board, legend);

  // ------------------------------------------------------------ header paints
  function paintLede(): void {
    const segments = runwayLede(model, viewDay, data.now, (key) => formatDisplayDate(key));
    lede.replaceChildren(
      ...segments.map((s) => {
        if (s.kind === 'plain') return document.createTextNode(s.text);
        if (s.kind === 'date') return el('b', 'runway-lede__date', s.text);
        const span = el('span', `runway-lede__${s.kind}`, s.text);
        if (s.projectId) span.dataset.projectId = s.projectId;
        return span;
      })
    );
  }

  function paintDials(): void {
    const { running, loadLimit } = model;
    const over = running > loadLimit;
    loadDial.classList.toggle('is-over', over);
    const pips = el('span', 'runway-pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < Math.max(loadLimit, running); i += 1) {
      const pip = el('i', 'runway-pip');
      if (i < running) pip.classList.add('is-on');
      if (i >= loadLimit) pip.classList.add('is-over');
      pips.append(pip);
    }
    const value = el('b', 'runway-dial__value', `${running} of ~${loadLimit}`);
    loadDial.replaceChildren(el('span', 'runway-dial__label', 'Running load'), pips, value);
    loadDial.title = over ? `Over a sustainable load of ${loadLimit} running projects.` : `A sustainable load is about ${loadLimit} running projects.`;
    sessionsDial.replaceChildren(
      el('span', 'runway-dial__label', 'Thinking in progress'),
      el(
        'b',
        'runway-dial__value',
        sessionsLoaded ? `${model.linkedSessions} linked session${model.linkedSessions === 1 ? '' : 's'}` : 'Looking…'
      )
    );
    const n = model.stuck.length;
    unstick.hidden = n === 0;
    unstick.textContent = `Unstick ${n}`;
  }

  // ------------------------------------------------------------ rows
  function healthChip(row: RunwayRow): HTMLElement {
    const kind = row.readyToClose ? 'ready' : row.health;
    const chip = el('span', `runway-health runway-health--${kind}`);
    chip.title = row.reason;
    chip.append(el('i', 'runway-health__dot'), document.createTextNode(row.readyToClose ? 'Ready to close' : HEALTH_LABEL[row.health]));
    return chip;
  }

  function metaLine(row: RunwayRow): HTMLElement {
    const meta = el('p', 'runway-row__meta');
    const bits: HTMLElement[] = [el('span', undefined, row.total ? `${row.done} of ${row.total} tasks` : 'No tasks yet')];
    if (row.needMinutes != null) {
      const need = el('span', row.tight ? 'is-tight' : undefined, `needs ~${minutesLabel(row.needMinutes)}`);
      if (row.freeMinutes != null) need.textContent += ` · ${minutesLabel(row.freeMinutes)} free before then`;
      if (row.runway) need.title = row.runway.note;
      bits.push(need);
    }
    if (row.waiting) {
      bits.push(el('span', 'is-waiting', `waiting on ${row.waiting.who}${row.waiting.days != null ? ` · ${row.waiting.days}d` : ''}`));
    }
    if (row.quietWeeks != null) bits.push(el('span', 'is-quiet', `quiet for ${row.quietWeeks} wk${row.quietWeeks === 1 ? '' : 's'}`));
    bits.forEach((bit, i) => {
      if (i) meta.append(document.createTextNode(' · '));
      meta.append(bit);
    });
    return meta;
  }

  function sessionChips(row: RunwayRow): HTMLElement {
    const host = el('div', 'runway-row__sessions');
    for (const s of row.sessions) {
      const chip = toolEl('a', 'runway-tchip', s.tool);
      chip.href = s.href;
      chip.title = `${RUNWAY_TOOLS[s.tool].name} · ${s.title}`;
      chip.append(glyph(s.tool), document.createTextNode(RUNWAY_TOOLS[s.tool].name));
      if (s.phaseLabel) chip.append(el('small', undefined, s.phaseLabel));
      host.append(chip);
    }
    host.hidden = row.sessions.length === 0;
    return host;
  }

  function door(row: RunwayRow): HTMLElement | null {
    const rec = row.recommendation;
    if (!rec || !sessionsLoaded || row.sessions.some((s) => s.tool === rec.tool)) return null;
    const btn = toolEl('button', 'runway-door', rec.tool);
    btn.type = 'button';
    btn.dataset.action = 'door';
    btn.title = rec.why;
    const label = el('span', 'runway-door__label');
    label.append('Work it through in ', el('b', undefined, RUNWAY_TOOLS[rec.tool].name), ' →');
    btn.append(glyph(rec.tool, 'runway-door__icon'), label);
    return btn;
  }

  function infoEl(row: RunwayRow, fresh: boolean): HTMLElement {
    const info = el('div', 'runway-row__info');
    const name = el('div', 'runway-row__name');
    const title = el('a', 'runway-row__title', row.project.title);
    title.href = projectPageHash(row.project.id);
    name.append(title);
    const badge = deps.badge?.(row.project);
    if (badge) name.append(badge);
    info.append(name);
    if (!row.live) {
      info.append(el('p', 'runway-row__meta', `Landed ${day(row.landedKey)}`));
      return info;
    }
    const chips = el('div', 'runway-row__chips');
    const chip = healthChip(row);
    if (fresh) chip.classList.add('is-fresh');
    chips.append(chip, el('span', 'runway-energy', row.energy === 'deep_focus' ? 'Deep focus' : 'Admin'));
    info.append(chips);
    if (row.readyToClose) {
      const complete = el('button', 'runway-addnext runway-complete', 'Mark complete');
      complete.type = 'button';
      complete.dataset.action = 'complete';
      info.append(complete);
    } else if (row.nextAction) {
      const next = el('p', 'runway-row__next');
      next.append(el('span', 'runway-row__next-label', 'Next: '), document.createTextNode(row.nextAction.title));
      info.append(next);
    } else {
      const add = el('button', 'runway-addnext', '+ Add a next action');
      add.type = 'button';
      add.dataset.action = 'add-next';
      info.append(add);
    }
    info.append(metaLine(row), sessionChips(row));
    const d = door(row);
    if (d) {
      if (fresh) d.classList.add('is-fresh');
      info.append(d);
    }
    return info;
  }

  function reviewMarkers(row: RunwayRow): HTMLElement[] {
    return row.reviews.map((r) => {
      const mark = toolEl('a', 'runway-review', r.tool);
      mark.href = r.href;
      mark.style.left = `${spanPct(r.day)}%`;
      mark.title = `${RUNWAY_TOOLS[r.tool].name} review · ${day(r.dateKey)}`;
      mark.textContent = RUNWAY_TOOLS[r.tool].glyph;
      return mark;
    });
  }

  function flagLabel(row: RunwayRow): string {
    const end = row.endDay ?? 0;
    const beyond = end > RUNWAY_SPAN_DAYS ? ' →' : '';
    return `${day(row.endKey)} · ${weeksLabel(end)}${beyond}`;
  }

  function trackEl(row: RunwayRow, growIndex: number | null): HTMLElement {
    const track = el('div', 'runway-track');
    if (!row.live) {
      track.classList.add('runway-track--landed');
      track.append(el('span', 'runway-landed', `✓ landed ${day(row.landedKey)}`));
      return track;
    }
    const geo = runwayGeometry(row);
    if (!geo) {
      track.classList.add('runway-track--undated');
      const ground = el('button', 'runway-ground', 'Tap the runway to set a finish date');
      ground.type = 'button';
      ground.dataset.action = 'set-date';
      const ghost = el('span', 'runway-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.append(el('b'));
      track.append(ground, ghost);
      return track;
    }
    track.classList.add('runway-track--dated');
    const bar = el('div', 'runway-bar');
    bar.style.width = `${geo.barPct}%`;
    bar.style.setProperty('--segs', String(Math.max(1, row.segments.length)));
    if (growIndex != null && !reducedMotion()) {
      bar.classList.add('is-grow');
      bar.style.setProperty('--grow-delay', `${Math.min(growIndex, 12) * 45}ms`);
    }
    if (row.segments.length) {
      for (const seg of row.segments) {
        const b = el('button', `runway-seg${seg.done ? ' is-done' : ''}`);
        b.type = 'button';
        b.dataset.action = 'tick';
        b.dataset.taskId = seg.taskId;
        b.title = `${seg.done ? 'Reopen' : 'Tick'}: ${seg.title}`;
        b.setAttribute('aria-pressed', seg.done ? 'true' : 'false');
        b.setAttribute('aria-label', `${seg.title}${seg.done ? ' (done)' : ''}`);
        bar.append(b);
      }
    } else {
      bar.append(el('span', 'runway-bar__empty', 'No tasks yet'));
    }
    track.append(bar);
    const buffer = el('div', 'runway-buffer');
    buffer.title = row.runway ? `${row.bufferDays}-day buffer before the finish` : '';
    const startBy = el('div', 'runway-startby');
    startBy.append(el('span'));
    track.append(buffer, startBy);
    for (const m of row.milestones) {
      if (row.endDay != null && m.day > row.endDay) continue;
      const ms = el('i', `runway-ms${m.done ? ' is-done' : ''}`);
      ms.style.left = `${spanPct(m.day)}%`;
      ms.title = `${m.title} · ${day(m.dateKey)}`;
      track.append(ms);
    }
    for (const g of row.gates) {
      const gate = el('span', 'runway-gate');
      gate.innerHTML = LOCK_ICON;
      gate.style.left = `${spanPct(g.day)}%`;
      gate.title = `Gate: ${g.title} · ${day(g.dateKey)}`;
      track.append(gate);
    }
    track.append(...reviewMarkers(row));
    const flag = el('div', 'runway-flag');
    flag.tabIndex = 0;
    flag.dataset.action = 'flag';
    flag.setAttribute('role', 'slider');
    flag.setAttribute('aria-label', `Finish date for ${row.project.title}`);
    flag.append(el('b'));
    track.append(flag);
    applyGeometry(track, row);
    return track;
  }

  /** Write a row's geometry into an existing track — used by paint and by live drags. */
  function applyGeometry(track: HTMLElement, row: RunwayRow): void {
    const geo = runwayGeometry(row);
    if (!geo) return;
    const bar = track.querySelector<HTMLElement>('.runway-bar');
    if (bar) bar.style.width = `${geo.barPct}%`;
    const flag = track.querySelector<HTMLElement>('.runway-flag');
    if (flag) {
      flag.style.left = `${geo.flagPct}%`;
      flag.classList.toggle('is-flip', geo.flip);
      flag.querySelector('b')!.textContent = flagLabel(row);
      flag.setAttribute('aria-valuetext', day(row.endKey));
      flag.title = 'Drag to move the finish date';
    }
    const buffer = track.querySelector<HTMLElement>('.runway-buffer');
    if (buffer) {
      buffer.hidden = !geo.buffer;
      if (geo.buffer) {
        buffer.style.left = `${geo.buffer.leftPct}%`;
        buffer.style.width = `${geo.buffer.widthPct}%`;
      }
    }
    const startBy = track.querySelector<HTMLElement>('.runway-startby');
    if (startBy) {
      startBy.hidden = geo.startByPct == null;
      if (geo.startByPct != null) {
        startBy.style.left = `${geo.startByPct}%`;
        startBy.querySelector('span')!.textContent = `start by ${day(row.startByKey)}`;
      }
    }
  }

  function renderRow(rowEl: HTMLElement, row: RunwayRow, opts: { fresh?: boolean; grow?: number | null } = {}): void {
    rowEl.className = `runway-row runway-row--${row.health}${row.live ? '' : ' runway-row--landed'}${row.lifecycle === 'needs_attention' ? ' is-attention' : ''}`;
    rowEl.dataset.projectId = row.project.id;
    rowEl.dataset.health = row.health;
    rowEl.dataset.energy = row.energy;
    rowEl.replaceChildren(infoEl(row, Boolean(opts.fresh)), trackEl(row, opts.grow ?? null));
    decorate(rowEl, row);
  }

  /** Energy dim and scrub states for one row (classes renderRow just reset). */
  function decorate(node: HTMLElement, row: RunwayRow): void {
    node.classList.toggle('is-dim', runwayEnergy !== 'all' && row.live && row.energy !== runwayEnergy);
    const state = scrubState(row, viewDay);
    node.classList.toggle('is-late', state.late);
    node.classList.toggle('is-should-start', state.shouldStart);
  }

  function applyDim(): void {
    for (const row of model.rows) {
      const node = rowEls.get(row.project.id);
      node?.classList.toggle('is-dim', runwayEnergy !== 'all' && row.live && row.energy !== runwayEnergy);
    }
  }

  function applyScrub(): void {
    const pct = spanPct(viewDay);
    const win = spanPct(Math.min(RUNWAY_SPAN_DAYS, viewDay + FORECAST_HORIZON_DAYS)) - pct;
    root.style.setProperty('--runway-view', `${pct}%`);
    root.style.setProperty('--runway-win', `${win}%`);
    knob.textContent = viewDay ? day(keyAtOffset(data.now, viewDay)) : 'TODAY';
    scale.setAttribute('aria-valuenow', String(viewDay));
    scale.setAttribute('aria-valuetext', viewDay ? day(keyAtOffset(data.now, viewDay)) : 'Today');
    back.hidden = viewDay === 0;
    root.classList.toggle('is-scrubbed', viewDay > 0);
    for (const row of model.rows) {
      const node = rowEls.get(row.project.id);
      if (!node) continue;
      const state = scrubState(row, viewDay);
      node.classList.toggle('is-late', state.late);
      node.classList.toggle('is-should-start', state.shouldStart);
    }
    paintLede();
  }

  // ------------------------------------------------------------ patch + FLIP
  function readRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    for (const [id, node] of rowEls) if (node.isConnected) rects.set(id, node.getBoundingClientRect());
    return rects;
  }

  function playFlip(first: Map<string, DOMRect>, added: Set<string>): void {
    for (const [id, node] of rowEls) {
      if (!node.isConnected || !canAnimate(node)) continue;
      const before = first.get(id);
      if (added.has(id) || !before) {
        node.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: FLIP_MS, easing: FLIP_EASE });
        continue;
      }
      const after = node.getBoundingClientRect();
      const dy = before.top - after.top;
      const dx = before.left - after.left;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) continue;
      node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: FLIP_MS, easing: FLIP_EASE });
    }
  }

  function bumpCount(node: HTMLElement, value: number): void {
    const text = String(value);
    if (node.textContent === text) return;
    const had = node.textContent !== '';
    node.textContent = text;
    if (had && canAnimate(node)) {
      node.animate([{ transform: 'scale(1.25)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: FLIP_EASE });
    }
  }

  /**
   * Rebuild the model, re-render rows in `changed` (all rows when null), move rows into their
   * groups in order, and FLIP what moved.
   */
  function patch(changed: Set<string> | null, opts: { grow?: boolean; flash?: Set<string> } = {}): void {
    const before = model ? new Map(model.rows.map((r) => [r.project.id, r.health])) : new Map();
    const first = readRects();
    model = buildRunway(input());
    const added = new Set<string>();
    let growIndex = 0;
    for (const group of model.groups) {
      const g = groupEls.get(group.id)!;
      g.root.hidden = group.rows.length === 0;
      bumpCount(g.count, group.rows.length);
      g.root.querySelector('.runway-group__title')!.textContent = group.title;
      g.root.querySelector('.runway-group__hint')!.textContent = group.hint;
      for (const row of group.rows) {
        const id = row.project.id;
        let node = rowEls.get(id);
        if (!node) {
          node = el('div', 'runway-row');
          rowEls.set(id, node);
          if (!opts.grow) added.add(id);
          renderRow(node, row, { grow: opts.grow ? growIndex : null });
        } else if (!changed || changed.has(id)) {
          renderRow(node, row, { fresh: before.get(id) !== row.health });
        }
        growIndex += 1;
        g.list.append(node);
        if (opts.flash?.has(id) && canAnimate(node)) {
          node.animate(
            [{ backgroundColor: 'var(--warning-surface)' }, { backgroundColor: 'transparent' }],
            { duration: 1400, easing: 'ease-out' }
          );
        }
      }
    }
    const live = new Set(runwayOrder(model).map((x) => x.id));
    for (const [id, node] of rowEls) {
      if (!live.has(id)) {
        node.remove();
        rowEls.delete(id);
      }
    }
    paintDials();
    applyDim();
    applyScrub();
    if (!opts.grow) playFlip(first, added);
  }

  function patchSessions(): void {
    model = buildRunway(input());
    for (const row of model.rows) {
      const node = rowEls.get(row.project.id);
      if (!node || !row.live) continue;
      const info = node.querySelector('.runway-row__info');
      info?.querySelector('.runway-row__sessions')?.replaceWith(sessionChips(row));
      info?.querySelector('.runway-door')?.remove();
      const d = door(row);
      if (d) {
        d.classList.add('is-fresh');
        info?.append(d);
      }
      const track = node.querySelector('.runway-track--dated');
      if (track) {
        track.querySelectorAll('.runway-review').forEach((n) => n.remove());
        track.querySelector('.runway-flag')?.before(...reviewMarkers(row));
      }
    }
    paintDials();
  }

  // ------------------------------------------------------------ writes
  function replaceTask(next: Task): void {
    data.tasks = data.tasks.map((t) => (t.id === next.id ? next : t));
  }
  function replaceProject(next: Project): void {
    data.projects = data.projects.map((p) => (p.id === next.id ? next : p));
  }
  function changed(id: string, opts: { flash?: boolean } = {}): void {
    deps.onDataChanged();
    patch(new Set([id]), opts.flash ? { flash: new Set([id]) } : {});
  }
  function fail(err: unknown): void {
    showHubToast(errorMessage(err), { tone: 'danger' });
  }

  async function writeTask(taskId: string, patchBody: Partial<Task>, projectId: string): Promise<void> {
    const prev = data.tasks.find((t) => t.id === taskId);
    if (!prev) return;
    replaceTask({ ...prev, ...patchBody });
    changed(projectId);
    try {
      const saved = await tasksApi.updateTask(taskId, patchBody);
      if (saved && typeof saved === 'object' && 'id' in saved) replaceTask(saved as Task);
      deps.onDataChanged();
    } catch (err) {
      replaceTask(prev);
      changed(projectId);
      throw err;
    }
  }

  async function toggleTask(taskId: string, projectId: string): Promise<void> {
    const task = data.tasks.find((t) => t.id === taskId);
    const rowBefore = rowById(projectId);
    if (!task || !rowBefore || pending.has(taskId)) return;
    const wasDone = task.status === 'done';
    const prevBody: Partial<Task> = { status: task.status, completed_at: task.completed_at };
    const nextBody: Partial<Task> = wasDone ? { status: 'open', completed_at: null } : { status: 'done', completed_at: new Date().toISOString() };
    pending.add(taskId);
    try {
      await writeTask(taskId, nextBody, projectId).finally(() => pending.delete(taskId));
    } catch (err) {
      fail(err);
      return;
    }
    popSegment(projectId, taskId);
    offerTimedUndo({
      message: wasDone ? `Reopened “${task.title}”` : `Ticked “${task.title}”`,
      onUndo: () => void writeTask(taskId, prevBody, projectId).catch(fail)
    });
    const row = rowById(projectId);
    if (!wasDone && row && row.total > 0 && row.done === row.total) landed(projectId, row);
  }

  function popSegment(projectId: string, taskId: string): void {
    const seg = rowEls.get(projectId)?.querySelector<HTMLElement>(`.runway-seg[data-task-id="${CSS.escape(taskId)}"]`);
    if (seg && canAnimate(seg)) {
      seg.animate([{ transform: 'scaleY(1.9)' }, { transform: 'scaleY(0.85)' }, { transform: 'none' }], { duration: 320, easing: FLIP_EASE });
    }
  }

  /** Every task done: stamp it, then offer the existing complete-project confirm. Never auto-completes. */
  function landed(projectId: string, row: RunwayRow): void {
    const track = rowEls.get(projectId)?.querySelector('.runway-track');
    if (track && !track.querySelector('.runway-stamp')) {
      const stamp = el('span', 'runway-stamp', 'Landed');
      stamp.setAttribute('aria-hidden', 'true');
      track.append(stamp);
    }
    showCompleteConfirm(deps.confirmHost, row.project, row.card.slipDays, deps.onReload);
    deps.confirmHost.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  async function writeEnd(projectId: string, endKey: string | null): Promise<void> {
    const prev = data.projects.find((p) => p.id === projectId);
    if (!prev) return;
    replaceProject({ ...prev, current_end_date: endKey });
    changed(projectId, { flash: true });
    try {
      const saved = await tasksApi.updateProject(projectId, { current_end_date: endKey });
      if (saved && typeof saved === 'object' && 'id' in saved) replaceProject(saved as Project);
      deps.onDataChanged();
    } catch (err) {
      replaceProject(prev);
      changed(projectId);
      throw err;
    }
  }

  async function moveEnd(projectId: string, endKey: string): Promise<void> {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return;
    const prevKey = project.current_end_date;
    if (prevKey === endKey) return;
    try {
      await writeEnd(projectId, endKey);
    } catch (err) {
      fail(err);
      return;
    }
    offerTimedUndo({
      message: prevKey ? `${project.title} now finishes ${day(endKey)}` : `${project.title} finishes ${day(endKey)}`,
      onUndo: () => void writeEnd(projectId, prevKey).catch(fail)
    });
  }

  function domainFor(projectId: string): string {
    return data.tasks.find((t) => t.parent_project_id === projectId)?.domain ?? taskDomains()[0] ?? 'teaching';
  }

  /** Same body as the project page's quick add: a plain active task under the project. */
  async function addNextAction(projectId: string, title: string): Promise<void> {
    const created = await tasksApi.createTask({
      title,
      domain: domainFor(projectId),
      parent_project_id: projectId,
      kind: 'task',
      bucket: 'active'
    });
    data.tasks = [...data.tasks, created];
    changed(projectId, { flash: true });
  }

  async function openTool(projectId: string, tool: RunwayTool, button?: HTMLButtonElement): Promise<void> {
    const info = RUNWAY_TOOLS[tool];
    const api = TOOL_API[tool];
    const row = rowById(projectId);
    if (!info.kind || !api || !row) {
      location.hash = info.hash;
      return;
    }
    const label = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.classList.add('is-pending');
      button.setAttribute('aria-busy', 'true');
    }
    try {
      const session = await api.create({
        text: `${row.project.title}: ${row.reason}`,
        title: row.project.title,
        links: [{ kind: 'project', id: projectId }],
        kind: info.kind
      });
      location.hash = sessionHref(tool, session.id);
    } catch (err) {
      fail(err);
      if (button) {
        button.disabled = false;
        button.classList.remove('is-pending');
        button.removeAttribute('aria-busy');
        if (label != null) button.innerHTML = label;
      }
    }
  }

  // ------------------------------------------------------------ inline next action
  function startNextInput(projectId: string, trigger: HTMLElement): void {
    const field = el('input', 'runway-nextin') as HTMLInputElement;
    field.type = 'text';
    field.placeholder = 'The very next physical action, then Enter';
    field.setAttribute('aria-label', 'Next action');
    trigger.replaceWith(field);
    field.focus();
    let done = false;
    const restore = () => {
      if (done) return;
      done = true;
      const row = rowById(projectId);
      const node = rowEls.get(projectId);
      if (row && node) renderRow(node, row);
    };
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restore();
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const title = field.value.trim();
      if (!title) return;
      done = true;
      field.disabled = true;
      void addNextAction(projectId, title)
        .then(() => showHubToast('Next action added', { tone: 'success' }))
        .catch((err) => {
          fail(err);
          done = false;
          field.disabled = false;
          field.focus();
        });
    });
    field.addEventListener('blur', () => {
      if (!field.value.trim()) restore();
    });
  }

  // ------------------------------------------------------------ drags
  type Drag =
    | { kind: 'view'; el: HTMLElement; id: number }
    | { kind: 'flag'; el: HTMLElement; id: number; projectId: string; day: number; startDay: number };
  let drag: Drag | null = null;
  let frame = 0;
  let lastX = 0;

  function trackRect(node: HTMLElement): DOMRect {
    return node.getBoundingClientRect();
  }

  function previewFlag(projectId: string, endDay: number): void {
    const project = data.projects.find((p) => p.id === projectId);
    const node = rowEls.get(projectId);
    const track = node?.querySelector<HTMLElement>('.runway-track--dated');
    if (!project || !node || !track) return;
    const row = buildRunwayRow(project, input({ endOverride: { projectId, endKey: keyAtOffset(data.now, endDay) } }));
    applyGeometry(track, row);
    node.querySelector('.runway-row__meta')?.replaceWith(metaLine(row));
    const state = scrubState(row, viewDay);
    node.classList.toggle('is-late', state.late);
    node.classList.toggle('is-should-start', state.shouldStart);
  }

  function onFrame(): void {
    frame = 0;
    if (!drag) return;
    const rect = trackRect(drag.el);
    if (drag.kind === 'view') {
      const next = dayAtX(lastX, rect.left, rect.width, 0);
      if (next !== viewDay) {
        viewDay = next;
        applyScrub();
      }
      return;
    }
    const next = dayAtX(lastX, rect.left, rect.width, 1);
    if (next !== drag.day) {
      drag.day = next;
      previewFlag(drag.projectId, next);
    }
  }

  function schedule(x: number): void {
    lastX = x;
    if (!frame) frame = requestAnimationFrame(onFrame);
  }

  root.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    const scaleHit = target.closest<HTMLElement>('.runway-scale');
    const flag = target.closest<HTMLElement>('.runway-flag');
    if (scaleHit) {
      drag = { kind: 'view', el: scaleHit, id: event.pointerId };
    } else if (flag) {
      const track = flag.closest<HTMLElement>('.runway-track')!;
      const projectId = flag.closest<HTMLElement>('.runway-row')!.dataset.projectId!;
      const row = rowById(projectId);
      if (!row || row.endDay == null) return;
      drag = { kind: 'flag', el: track, id: event.pointerId, projectId, day: row.endDay, startDay: row.endDay };
      flag.classList.add('is-dragging');
    } else {
      return;
    }
    event.preventDefault();
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      /* synthetic pointers in tests */
    }
    schedule(event.clientX);
  });

  root.addEventListener('pointermove', (event) => {
    if (drag && event.pointerId === drag.id) {
      schedule(event.clientX);
      return;
    }
    const track = (event.target as HTMLElement).closest?.<HTMLElement>('.runway-track--undated');
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const d = dayAtX(event.clientX, rect.left, rect.width, 1);
    const ghost = track.querySelector<HTMLElement>('.runway-ghost');
    if (!ghost) return;
    ghost.style.left = `${spanPct(d)}%`;
    ghost.querySelector('b')!.textContent = `${day(keyAtOffset(data.now, d))} · ${weeksLabel(d)}`;
  });

  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (frame) {
      cancelAnimationFrame(frame);
      onFrame();
    }
    const was = drag;
    drag = null;
    if (was.kind === 'flag') {
      rowEls.get(was.projectId)?.querySelector('.runway-flag')?.classList.remove('is-dragging');
      if (event.type === 'pointercancel' || was.day === was.startDay) {
        const row = rowById(was.projectId);
        const node = rowEls.get(was.projectId);
        if (row && node) renderRow(node, row);
        applyScrub();
        return;
      }
      void moveEnd(was.projectId, keyAtOffset(data.now, was.day));
    }
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  // Keyboard: arrows nudge the knob / a flag (Shift = a week); a flag commits once you pause.
  let flagKeyTimer = 0;
  const keyFlag = { projectId: '', day: 0, startDay: 0 };
  root.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    const step = event.shiftKey ? 7 : 1;
    const delta = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    if (target === scale && delta) {
      event.preventDefault();
      viewDay = Math.max(0, Math.min(RUNWAY_SPAN_DAYS, viewDay + delta));
      applyScrub();
      return;
    }
    if (target === scale && event.key === 'Home') {
      viewDay = 0;
      applyScrub();
      return;
    }
    if (!target.classList.contains('runway-flag') || !delta) return;
    event.preventDefault();
    const projectId = target.closest<HTMLElement>('.runway-row')!.dataset.projectId!;
    const row = rowById(projectId);
    if (!row || row.endDay == null) return;
    if (keyFlag.projectId !== projectId) Object.assign(keyFlag, { projectId, day: row.endDay, startDay: row.endDay });
    keyFlag.day = Math.max(1, Math.min(RUNWAY_SPAN_DAYS, keyFlag.day + delta));
    previewFlag(projectId, keyFlag.day);
    window.clearTimeout(flagKeyTimer);
    flagKeyTimer = window.setTimeout(() => {
      const { day: d, startDay } = keyFlag;
      keyFlag.projectId = '';
      if (d !== startDay) {
        void moveEnd(projectId, keyAtOffset(data.now, d)).then(() => {
          rowEls.get(projectId)?.querySelector<HTMLElement>('.runway-flag')?.focus();
        });
      }
    }, 700);
  });

  // ------------------------------------------------------------ clicks
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest<HTMLElement>('[data-action]');
    if (target.closest('.runway-back')) {
      viewDay = 0;
      applyScrub();
      return;
    }
    if (target.closest('.runway-unstick')) {
      openUnstick();
      return;
    }
    if (!action) return;
    const projectId = action.closest<HTMLElement>('.runway-row')?.dataset.projectId;
    if (!projectId) return;
    switch (action.dataset.action) {
      case 'tick':
        void toggleTask(action.dataset.taskId!, projectId);
        return;
      case 'add-next':
        startNextInput(projectId, action);
        return;
      case 'complete': {
        const row = rowById(projectId);
        if (row) landed(projectId, row);
        return;
      }
      case 'door': {
        const row = rowById(projectId);
        if (row?.recommendation) void openTool(projectId, row.recommendation.tool, action as HTMLButtonElement);
        return;
      }
      case 'set-date': {
        const track = action.closest<HTMLElement>('.runway-track')!;
        const rect = track.getBoundingClientRect();
        // A keyboard press has no pointer: four weeks out.
        const d = event.detail === 0 || !rect.width ? 28 : dayAtX(event.clientX, rect.left, rect.width, 1);
        void moveEnd(projectId, keyAtOffset(data.now, d));
        return;
      }
    }
  });

  // ------------------------------------------------------------ unstick sheet
  function openUnstick(): void {
    const queue = model.stuck.map((r) => r.project.id);
    if (!queue.length) return;
    let k = 0;
    let moved = 0;
    let closed = false;
    const opener = document.activeElement as HTMLElement | null;
    const scrim = el('div', 'runway-sheet__scrim');
    const sheet = el('aside', 'runway-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Unstick pass');
    const terms = deps.loadTerms().catch(() => [] as SchoolTerm[]);
    document.body.append(scrim, sheet);
    requestAnimationFrame(() => {
      scrim.classList.add('is-in');
      sheet.classList.add('is-in');
    });

    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      sheet.classList.remove('is-in');
      scrim.classList.remove('is-in');
      sheet.classList.add('is-out');
      const remove = () => {
        sheet.remove();
        scrim.remove();
      };
      if (reducedMotion()) remove();
      else window.setTimeout(remove, 280);
      if (moved) showHubToast(`Moved ${countWord(moved).toLowerCase()} project${moved === 1 ? '' : 's'} along`, { tone: 'success' });
      opener?.focus?.();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    scrim.addEventListener('click', close);

    const toolButton = (tool: RunwayTool, projectId: string, rec?: string): HTMLButtonElement => {
      const info = RUNWAY_TOOLS[tool];
      const btn = toolEl('button', rec ? 'runway-tool runway-tool--rec' : 'runway-tool', tool);
      btn.type = 'button';
      btn.title = info.when;
      const text = el('span', 'runway-tool__text');
      if (rec) text.append(el('small', 'runway-tool__eyebrow', 'Recommended'));
      text.append(el('b', 'runway-tool__name', info.name), el('small', 'runway-tool__when', rec ?? info.when));
      btn.append(glyph(tool, 'runway-tool__icon'), text);
      btn.addEventListener('click', () => {
        if (!info.kind) {
          close();
          location.hash = info.hash;
          return;
        }
        void openTool(projectId, tool, btn).then(() => {
          if (location.hash.startsWith(info.hash)) close();
        });
      });
      return btn;
    };

    const step = async () => {
      while (k < queue.length && !rowById(queue[k]!)?.live) k += 1;
      if (k >= queue.length) {
        close();
        return;
      }
      const row = rowById(queue[k]!)!;
      const projectId = row.project.id;
      const choices = finishDateChoices(await terms, data.now);
      if (closed) return;
      let pickedEnd: string | null = null;
      let revive = false;

      const body = el('div', 'runway-sheet__body');
      const head = el('div', 'runway-sheet__head');
      const eyebrow = el('p', 'runway-sheet__eyebrow', queue.length > 1 ? `Unstick pass · ${k + 1} of ${queue.length}` : 'Unstick');
      const x = el('button', 'hub-icon-btn runway-sheet__close');
      x.type = 'button';
      x.setAttribute('aria-label', 'Close');
      x.innerHTML = CLOSE_ICON;
      x.addEventListener('click', close);
      head.append(eyebrow, x);
      body.append(head);
      if (queue.length > 1) {
        const dots = el('div', 'runway-sheet__dots');
        dots.setAttribute('aria-hidden', 'true');
        queue.forEach((_, j) => dots.append(el('span', j < k ? 'is-done' : j === k ? 'is-current' : undefined)));
        body.append(dots);
      }
      body.append(el('h3', 'runway-sheet__title', row.project.title), el('p', 'runway-sheet__reason', row.reason));
      if (row.recommendation) body.append(toolButton(row.recommendation.tool, projectId, row.recommendation.why));
      body.append(el('p', 'runway-sheet__label', row.recommendation ? 'Or think it through with' : 'Think it through with'));
      const shelf = el('div', 'runway-sheet__shelf');
      for (const tool of RUNWAY_TOOL_ORDER) {
        if (tool !== row.recommendation?.tool) shelf.append(toolButton(tool, projectId));
      }
      body.append(shelf);

      let nextField: HTMLInputElement | null = null;
      if (!row.nextAction && row.health !== 'stalled') {
        body.append(el('p', 'runway-sheet__label', 'Next action'));
        nextField = el('input', 'runway-sheet__input') as HTMLInputElement;
        nextField.type = 'text';
        nextField.placeholder = 'The very next physical action';
        nextField.setAttribute('aria-label', 'Next action');
        body.append(nextField);
      }
      if (!row.endKey && row.health !== 'stalled') {
        body.append(el('p', 'runway-sheet__label', 'Finish date'));
        const chips = el('div', 'runway-sheet__chips');
        for (const choice of choices) {
          const chip = el('button', 'runway-sheet__chip');
          chip.type = 'button';
          chip.setAttribute('aria-pressed', 'false');
          chip.append(el('span', undefined, choice.label), el('small', undefined, day(choice.key)));
          chip.addEventListener('click', () => {
            pickedEnd = pickedEnd === choice.key ? null : choice.key;
            chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === chip && pickedEnd ? 'true' : 'false'));
          });
          chips.append(chip);
        }
        body.append(chips);
      }
      if (row.health === 'stalled') {
        body.append(el('p', 'runway-sheet__label', 'Or decide here'));
        const chips = el('div', 'runway-sheet__chips');
        const chip = el('button', 'runway-sheet__chip');
        chip.type = 'button';
        chip.setAttribute('aria-pressed', 'false');
        chip.append(el('span', undefined, 'Bring it back'), el('small', undefined, 'Marks it revived'));
        chip.addEventListener('click', () => {
          revive = !revive;
          chip.setAttribute('aria-pressed', revive ? 'true' : 'false');
        });
        chips.append(chip);
        body.append(chips);
      }

      const foot = el('div', 'runway-sheet__foot');
      const last = k >= queue.length - 1;
      if (queue.length > 1) {
        const skip = el('button', 'btn btn--ghost', 'Skip');
        skip.type = 'button';
        skip.addEventListener('click', () => {
          k += 1;
          void step();
        });
        foot.append(skip);
      }
      const apply = el('button', 'btn btn--primary runway-sheet__apply', last ? 'Apply' : 'Apply · next');
      apply.type = 'button';
      apply.addEventListener('click', async () => {
        const nextTitle = nextField?.value.trim() ?? '';
        apply.disabled = true;
        apply.setAttribute('aria-busy', 'true');
        try {
          let did = false;
          if (nextTitle) {
            await addNextAction(projectId, nextTitle);
            did = true;
          }
          if (pickedEnd) {
            await writeEnd(projectId, pickedEnd);
            did = true;
          }
          if (revive) {
            const result = await tasksApi.resolveStalledProject({
              project_id: projectId,
              outcome: 'revived',
              reason: 'Brought back from the Projects unstick pass.'
            });
            replaceProject(result.project);
            changed(projectId, { flash: true });
            did = true;
          }
          if (did) moved += 1;
          k += 1;
          void step();
        } catch (err) {
          fail(err);
          apply.disabled = false;
          apply.removeAttribute('aria-busy');
        }
      });
      foot.append(apply);
      body.append(foot);

      const old = sheet.firstElementChild;
      sheet.replaceChildren(body);
      if (old && canAnimate(body)) {
        body.animate([{ opacity: 0, transform: 'translateX(16px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: FLIP_EASE });
      }
      (nextField ?? x).focus();
    };
    void step();
  }

  // ------------------------------------------------------------ first paint
  patch(null, { grow: deps.grow });
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      void deps.loadSessions().then(
        (list) => {
          sessions = list;
          sessionsLoaded = true;
          patchSessions();
        },
        () => {
          sessionsLoaded = true;
          paintDials();
        }
      );
    }, 0);
  });

  return root;
}
