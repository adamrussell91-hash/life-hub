import type { Goal } from '@/schemas/goal';
import type { PlanningProfile } from '@/schemas/planning-profile';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { isProjectArchived } from '@/schemas/project';
import { projectSpan } from '@/domain/chronology';
import {
  cascadeForward,
  collectDependencies,
  linksPatchForTask,
  wouldCreateCycle,
  type GanttSchedulable
} from '@/domain/gantt';
import { hydrateFocusFromHash } from '@/domain/focus';
import { projectMilestones } from '@/domain/project-milestones';
import { parseHubPrefs } from '@/domain/hub-prefs';
import { toHubDateKey } from '@/domain/queries';
import {
  addDaysKey,
  buildTimeScale,
  holidayRuns,
  mondayOf,
  toMs,
  weekLabel,
  type SchoolTerm,
  type TimeScale
} from '@/domain/school-time';
import { dayCapacity } from '@/domain/hammond-capacity';
import { beforeWallChip, collectLifeWalls, wallContaining, type CollectedWall } from '@/domain/life-wall';
import { bumpScriptsMarked, markingShadowPaint } from '@/domain/marking-shadow';
import { buildWeekLoad, learningTermRhythm, termRhythmFactor, type TermWeekSample } from '@/domain/term-rhythm';
import { TL, SURF, domainColour, formatKey, tint } from '@/domain/timeline-geometry';
import {
  buildTimelineRows,
  isTimelineExpanded,
  timelineCritical,
  timelineRange,
  timelineTaskSpan,
  undatedCount,
  type TlMilestone,
  type TlModel,
  type TlProject,
  type TlRow,
  type TlRowKind,
  type TlTask
} from '@/domain/timeline-rows';
import { tasksApi } from '@/services/client-api';
import { notifyTasksChanged, onTasksChanged, onTasksDeleted, resetTaskCache } from '@/services/task-cache';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '@/domain/task-properties-defaults';
import { loadTaskProperties } from '@/services/task-properties';
import { hashQuery } from '@/shell/shell';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { mountLinesView, type LinesInput, type LinesMount } from '@/views/graph-lines';
import { createMotion, EASE, MOTION, OVERSHOOT, reconcile, type Props } from '@/views/timeline-motion';
import { startMorph, type MorphController } from '@/views/timeline-morph';

const NS = 'http://www.w3.org/2000/svg';
const PAD_R = 220;
const FONT = 'Inter, ui-sans-serif, sans-serif';

type Kind =
  | 'bar' | 'step' | 'ms' | 'proj' | 'bracket' | 'band' | 'dream' | 'undated' | 'curve'
  | 'label' | 'hol' | 'grid' | 'term' | 'week' | 'today' | 'rowtitle' | 'wall'
  | 'shadow' | 'load' | 'cap' | 'ripple';

type Spec = {
  kind: Kind;
  text?: string;
  sub?: string;
  colour?: string;
  data?: Record<string, string>;
  flags?: {
    critical?: boolean;
    holiday?: boolean;
    inside?: boolean;
    warn?: boolean;
    over?: boolean;
    wall?: boolean;
    slip?: boolean;
  };
};

type ViewMode = 'bars' | 'lines';

let teardown: (() => void) | null = null;
let timelineView: ViewMode = 'bars';

export function resetTimelineSession(): void {
  teardown?.();
  teardown = null;
  timelineView = 'bars';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function setAttrs(node: Element, attrs: Record<string, string | number>): void {
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
}

function todayFraction(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return (hour * 60 + minute) / (24 * 60);
}

function blockedLabel(since: string | null, today: string): string {
  if (!since) return 'blocked';
  const days = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since.slice(0, 10)}T00:00:00Z`)) / 86_400_000));
  return `blocked ${days} ${days === 1 ? 'day' : 'days'}`;
}

function termsFor(prefs: ReturnType<typeof parseHubPrefs>, today: string): SchoolTerm[] {
  const year = Number(today.slice(0, 4));
  const row = prefs.school_terms.find((item) => item.year === year) ?? prefs.school_terms[0];
  return row?.terms ?? [];
}

function colourMap(config: { domains: Array<{ id: string; color?: string }> }): Map<string, string> {
  return new Map(config.domains.flatMap((domain) => (domain.color ? [[domain.id, domain.color] as const] : [])));
}

function toModel(tasks: Task[], projects: Project[], goals: Goal[], colours: Map<string, string>, scope: { project: string | null; goal: string | null }): TlModel {
  const dreamTasks = tasks.filter((task) => task.someday_kind === 'dreams_jar' || (task.bucket === 'someday' && task.target_date));
  const dreamIds = new Set(dreamTasks.map((task) => task.id));
  let work = tasks.filter((task) => !dreamIds.has(task.id) && task.bucket !== 'someday' && task.status !== 'dead');
  let liveProjects = projects.filter((project) => !isProjectArchived(project.status));
  if (scope.project) liveProjects = liveProjects.filter((project) => project.id === scope.project);
  if (scope.goal) liveProjects = liveProjects.filter((project) => project.parent_goal_id === scope.goal);
  const projectIds = new Set(liveProjects.map((project) => project.id));
  if (scope.project || scope.goal) work = work.filter((task) => task.parent_project_id && projectIds.has(task.parent_project_id));

  const tlTasks: TlTask[] = work.map((task) => ({
    id: task.id,
    title: task.title,
    project: task.parent_project_id,
    parent: task.parent_task_id,
    domain: task.domain,
    due: task.due_date,
    est: task.estimated_duration,
    status: task.status,
    blocked: Boolean(task.blocked_since),
    blockedSince: task.blocked_since,
    deps: (task.dependency_links?.length ? task.dependency_links.map((link) => link.from_id) : task.depends_on) ?? [],
    marking: task.marking ?? null
  }));

  const seenShade = new Set<string>();
  const tlProjects: TlProject[] = liveProjects.map((project) => {
    const span = projectSpan(project, tasks);
    const domain = tlTasks.find((task) => task.project === project.id)?.domain ?? 'teaching';
    const shadeKey = `${project.parent_goal_id ?? ''}:${domain}`;
    const shade = seenShade.has(shadeKey);
    seenShade.add(shadeKey);
    const base = colours.get(domain) ?? '#376fb7';
    return {
      id: project.id,
      title: project.title,
      goal: project.parent_goal_id,
      domain,
      start: span?.startKey ?? (project.created_at?.slice(0, 10) || '2026-01-01'),
      end: span?.endKey ?? project.current_end_date ?? project.baseline_end_date ?? '2026-12-31',
      baselineEnd: project.baseline_end_date && project.baseline_end_date !== project.current_end_date ? project.baseline_end_date : null,
      shade,
      colour: domainColour(base, shade)
    };
  });

  const goalIds = new Set(tlProjects.map((project) => project.goal).filter((id): id is string => Boolean(id)));
  const tlGoals = goals
    .filter((goal) => !scope.goal || goal.id === scope.goal)
    .filter((goal) => goalIds.has(goal.id) || (!scope.project && !scope.goal))
    .filter((goal) => goalIds.has(goal.id))
    .map((goal) => ({ id: goal.id, title: goal.title, dream: goal.parent_someday_id ?? null }));

  const milestones: TlMilestone[] = liveProjects.flatMap((project) =>
    (project.milestones ?? [])
      .filter((milestone) => milestone.due_date)
      .map((milestone) => ({
        id: milestone.id,
        project: project.id,
        title: milestone.title,
        due: milestone.due_date!,
        deps: milestone.depends_on ?? []
      }))
  );

  return {
    tasks: tlTasks,
    projects: tlProjects,
    goals: tlGoals,
    dreams: dreamTasks
      .filter((task) => tlGoals.some((goal) => goal.dream === task.id))
      .map((task) => ({
        id: task.id,
        title: task.title,
        target: task.target_date ?? task.review_at ?? '2027-01-01',
        origin: task.origin_date ?? null
      })),
    milestones
  };
}

export async function renderTimelineView(canvas: HTMLElement): Promise<void> {
  teardown?.();
  teardown = null;
  showViewLoading(canvas, 'Loading timeline…', '.tl-page');
  hydrateFocusFromHash();
  const scope = { project: hashQuery().get('project'), goal: hashQuery().get('goal') };
  let tasks: Task[];
  let projects: Project[];
  let goals: Goal[];
  let prefs: ReturnType<typeof parseHubPrefs>;
  let colours: Map<string, string>;
  let profile: PlanningProfile | null = null;
  try {
    resetTaskCache();
    const [listedTasks, listedProjects, listedGoals, rawPrefs, properties, listedProfile] = await Promise.all([
      tasksApi.listTasks(),
      tasksApi.listProjects(),
      tasksApi.listGoals().catch(() => [] as Goal[]),
      tasksApi.getHubPrefs().catch(() => null),
      Promise.resolve()
        .then(() => loadTaskProperties(true))
        .catch(() => DEFAULT_TASK_PROPERTY_CONFIG),
      tasksApi.getPlanningProfile().catch(() => null)
    ]);
    profile = listedProfile;
    tasks = listedTasks;
    projects = listedProjects;
    goals = listedGoals;
    prefs = parseHubPrefs(rawPrefs);
    colours = colourMap(properties);
  } catch (error) {
    renderLoadError(canvas, error, () => void renderTimelineView(canvas), 'Could not load Timeline');
    return;
  }

  const fonts = document.fonts?.ready;
  if (fonts) await Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 3000))]);

  const model = toModel(tasks, projects, goals, colours, scope);
  const today = toHubDateKey();
  const frac = todayFraction();
  const range = timelineRange(today);
  const school = termsFor(prefs, today);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  const page = el('div', 'tl-page');
  const toolbar = el('div', 'tl-toolbar');
  toolbar.setAttribute('data-part', 'toolbar');
  const left = el('div', 'tl-toolbar__group');
  const zoomPills = el('div', 'hub-pills');
  zoomPills.id = 'tl-zoom';
  zoomPills.setAttribute('role', 'group');
  zoomPills.setAttribute('aria-label', 'Zoom');
  zoomPills.setAttribute('data-part', 'zoom-pills');
  const viewPills = el('div', 'hub-pills');
  viewPills.id = 'tl-view';
  viewPills.setAttribute('role', 'group');
  viewPills.setAttribute('aria-label', 'View');
  viewPills.setAttribute('data-part', 'view-toggle');
  left.append(zoomPills, viewPills);
  const right = el('div', 'tl-toolbar__group');
  const critBtn = el('button', 'tl-toggle tl-toggle--critical', 'Critical path');
  critBtn.type = 'button';
  critBtn.setAttribute('aria-pressed', 'false');
  const loadBtn = el('button', 'tl-toggle', 'Load');
  loadBtn.type = 'button';
  loadBtn.setAttribute('aria-pressed', 'true');
  const holBtn = el('button', 'tl-toggle', 'Holidays: compressed');
  holBtn.type = 'button';
  const todayBtn = el('button', 'tl-toggle', 'Today');
  todayBtn.type = 'button';
  const hammondBtn = el('button', 'btn btn--secondary', 'Ask Hammond');
  hammondBtn.type = 'button';
  const addBtn = el('button', 'tl-plus');
  addBtn.type = 'button';
  addBtn.setAttribute('aria-label', 'Add');
  addBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  right.append(critBtn, loadBtn, holBtn, todayBtn, hammondBtn, addBtn);
  toolbar.append(left, right);

  const card = el('section', 'tl-card');
  card.id = 'tl-card';
  card.setAttribute('data-part', 'timeline-card');
  card.dataset.view = 'bars';
  const barsHost = el('div', 'tl-view');
  const frame = el('div', 'tl-frame');
  const labels = el('div', 'tl-labels');
  labels.append(el('div', 'tl-labels__head', 'Plan'));
  const legend = el('div', 'tl-labels__load');
  legend.dataset.part = 'load-legend';
  legend.innerHTML = '<b>Load</b><span><i></i>Committed</span><span><i class="is-cap"></i>Free time</span><span><i class="is-over"></i>Over</span><small>Learning your term rhythm</small>';
  labels.append(legend);
  const scroller = el('div', 'tl-scroller');
  const svg = svgEl('svg', { class: 'tl-svg', role: 'group', 'aria-label': 'Timeline' });
  scroller.append(svg);
  frame.append(labels, scroller);
  barsHost.append(frame);
  const linesHost = el('div', 'tl-view tl-lines');
  linesHost.hidden = true;
  card.append(barsHost, linesHost);
  const live = el('p', 'tl-live');
  live.setAttribute('aria-live', 'polite');
  const toast = el('p', 'tl-toast');
  toast.dataset.part = 'wall-toast';
  toast.hidden = true;
  const banner = el('div', 'tl-banner');
  banner.dataset.part = 'ripple-banner';
  banner.hidden = true;
  const bannerText = el('span');
  const bannerTitle = el('b');
  const bannerDetail = el('span');
  bannerText.append(bannerTitle, bannerDetail);
  const dropBtn = el('button', 'btn btn--ghost', 'Drop anyway');
  dropBtn.type = 'button';
  const fixBtn = el('button', 'btn btn--primary', 'Suggest a fix');
  fixBtn.type = 'button';
  banner.append(bannerText, dropBtn, fixBtn);
  const menu = el('div', 'tl-menu');
  menu.hidden = true;
  const menuMarking = el('button', 'tl-menu__item', 'Marking shadow');
  menuMarking.type = 'button';
  menu.append(menuMarking);
  const composer = el('form', 'tl-composer');
  composer.hidden = true;
  composer.dataset.part = 'marking-composer';
  page.append(toolbar, banner, card, menu, composer, toast, live);
  canvas.replaceChildren(page);

  const layers: Record<string, SVGGElement> = {};
  for (const name of ['grid', 'holidays', 'walls', 'axis', 'today', 'bands', 'curves', 'shadows', 'bars', 'ghosts', 'load']) {
    layers[name] = svgEl('g', { 'data-layer': name });
    svg.append(layers[name]);
  }
  const defs = svgEl('defs');
  defs.innerHTML = `
    <pattern id="tl-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="color-mix(in srgb, var(--navy) 4%, transparent)"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="color-mix(in srgb, var(--navy) 16%, transparent)" stroke-width="2"/>
    </pattern>
    <marker id="tl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M1 1 L9 5 L1 9 Z" fill="var(--shallow)"/>
    </marker>
    <marker id="tl-arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M1 1 L9 5 L1 9 Z" fill="var(--high-sea-ink)"/>
    </marker>`;
  svg.append(defs);

  const measure = document.createElement('canvas').getContext('2d');
  const widthCache = new Map<string, number>();
  function textW(text: string, font: string): number {
    const key = `${font}\n${text}`;
    const cached = widthCache.get(key);
    if (cached !== undefined) return cached;
    let width = text.length * 7;
    if (measure) {
      measure.font = font.includes('Inter') ? font.replace('Inter', FONT) : font;
      width = measure.measureText(text).width;
    }
    widthCache.set(key, width);
    return width;
  }

  const state = {
    zoom: 2,
    dayWidth: TL.zooms[2].dayWidth as number,
    expanded: new Map<string, boolean>(),
    critical: false,
    load: true,
    holidaysCompressed: true,
    view: timelineView,
    selected: null as string | null,
    tasks: model.tasks,
    drag: null as null | {
      id: string;
      entityId: string;
      startX: number;
      originX: number;
      originW: number;
      days: number;
      pointer: number;
      mode: 'move' | 'resize' | 'link';
      curves: Map<string, Props>;
      linkLine: SVGLineElement | null;
    },
    preview: null as null | { id: string; days: number; mode: 'move' | 'resize' },
    release: null as null | { id: string; deps: Set<string> }
  };
  const specs = new Map<string, Spec>();
  const nodes = new Map<string, Element>();
  let rows: TlRow[] = [];
  let scale: TimeScale = buildTimeScale({
    start: range.start,
    end: range.end,
    terms: school,
    dayWidth: state.dayWidth,
    holidayFactor: 0.25
  });
  let lastIds: string[] = [];
  let geometry = { width: 0, height: 0 };
  let capPath = '';
  let viewLeft = 0;
  let zoomAnchor: null | { date: string; frac: number; screenX: number } = null;
  let zoomCanvasWidth = 0;
  let zoomSettle = 0;
  let laidOut = false;

  function projectById(id: string | null): TlProject | undefined {
    return model.projects.find((project) => project.id === id);
  }
  function taskColour(task: TlTask): string {
    return projectById(task.project)?.colour ?? domainColour(colours.get(task.domain) ?? '#376fb7', false);
  }
  function isOpen(id: string, kind: 'goal' | 'project' | 'group' | 'task'): boolean {
    return isTimelineExpanded(id, kind, state.zoom, state.expanded, state.tasks, today);
  }
  function announce(message: string): void {
    live.textContent = message;
  }

  let liveWalls: CollectedWall[] = [];

  function layerFor(kind: Kind): SVGGElement {
    if (kind === 'wall') return layers.walls!;
    if (kind === 'hol' || kind === 'grid') return layers.grid!;
    if (kind === 'term' || kind === 'week') return layers.axis!;
    if (kind === 'band' || kind === 'bracket') return layers.bands!;
    if (kind === 'curve') return layers.curves!;
    if (kind === 'today') return layers.today!;
    if (kind === 'shadow') return layers.shadows!;
    if (kind === 'load' || kind === 'cap') return layers.load!;
    if (kind === 'ripple') return layers.ghosts!;
    return layers.bars!;
  }

  function pool(parent: Element, count: number): SVGRectElement[] {
    while (parent.children.length > count) parent.lastElementChild?.remove();
    while (parent.children.length < count) parent.append(svgEl('rect'));
    return [...parent.children] as SVGRectElement[];
  }

  function buildShape(kind: Kind, g: SVGGElement, spec: Spec, id: string): void {
    const ref = id.split(':').slice(1).join(':') || id;
    const colour = spec.colour ?? 'var(--wave)';
    const data = spec.data ?? {};
    if (kind === 'bar' || kind === 'step') {
      g.setAttribute('data-part', kind === 'bar' ? 'bar' : 'step-bar');
      g.setAttribute('data-task-id', ref);
      for (const [key, value] of Object.entries(data)) g.setAttribute(`data-${key}`, value);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', spec.text ?? '');
      svgEl('rect', { class: 'tl-halo', rx: TL.bar.rx + 4 });
      const face = svgEl('rect', { class: 'tl-bar__face', rx: TL.bar.rx, 'data-part': 'bar-face', 'data-entity-id': ref, 'data-morph-shape': 'bar', 'data-morph-color': colour });
      face.style.fill = tint(colour, 16);
      const stripe = svgEl('rect', { class: 'tl-bar__stripe', rx: 1.5, width: TL.bar.stripeW, 'data-part': 'bar-stripe' });
      stripe.style.fill = data.blocked ? 'var(--danger)' : colour;
      g.append(svgEl('rect', { class: 'tl-halo', rx: TL.bar.rx + 4 }), face, stripe, svgEl('rect', { class: 'tl-bar__grip', rx: 1.5, width: 3 }));
      const title = svgEl('text', { class: 'tl-bar__title', 'data-part': 'bar-title' });
      title.textContent = spec.text ?? '';
      const sub = svgEl('text', { class: 'tl-bar__sub', 'data-part': 'bar-sub' });
      sub.textContent = spec.sub ?? '';
      const link = svgEl('circle', { class: 'tl-bar__link', r: 5 });
      const badge = svgEl('g', { class: 'tl-wall-badge', 'data-part': 'wall-badge', opacity: 0 });
      badge.append(
        svgEl('rect', { width: 16, height: 16, rx: 8 }),
        svgEl('path', { class: 'tl-wall__lock', d: 'M-3.5 -1 v-2 a3.5 3.5 0 0 1 7 0 v2 M-5 -1 h10 v7 h-10 z' })
      );
      const before = svgEl('text', { class: 'tl-before', 'data-part': 'before-chip' });
      g.append(title, sub, link, badge, before);
      return;
    }
    if (kind === 'ms' || kind === 'dream') {
      g.setAttribute('data-part', kind === 'ms' ? 'milestone' : 'dream');
      g.setAttribute(kind === 'ms' ? 'data-milestone-id' : 'data-dream-id', ref);
      const mark = svgEl('rect', {
        class: kind === 'ms' ? 'tl-ms' : 'tl-dream',
        width: TL.diamond,
        height: TL.diamond,
        rx: 2,
        'data-entity-id': ref,
        'data-morph-shape': 'milestone',
        'data-morph-color': colour
      });
      if (kind === 'ms') mark.style.fill = colour;
      const text = svgEl('text', { class: kind === 'ms' ? 'tl-ms__label' : 'tl-dream__label' });
      text.textContent = spec.text ?? '';
      g.append(mark, text);
      if (kind === 'ms') {
        g.append(svgEl('text', { class: 'tl-before', 'data-part': 'before-chip' }));
        const badge = svgEl('g', { class: 'tl-wall-badge', 'data-part': 'wall-badge', opacity: 0 });
        badge.append(
          svgEl('rect', { width: 16, height: 16, rx: 8 }),
          svgEl('path', { class: 'tl-wall__lock', d: 'M-3.5 -1 v-2 a3.5 3.5 0 0 1 7 0 v2 M-5 -1 h10 v7 h-10 z' })
        );
        g.append(badge);
      }
      if (kind === 'dream') g.append(svgEl('line', { class: 'tl-dream__line' }));
      return;
    }
    if (kind === 'proj') {
      g.setAttribute('data-part', 'project-bar');
      g.setAttribute('data-project-id', ref);
      const face = svgEl('rect', { class: 'tl-proj__face', rx: TL.project.rx, height: TL.project.h, 'data-entity-id': ref, 'data-morph-shape': 'project', 'data-morph-color': colour });
      face.style.fill = tint(colour, 18);
      const progress = svgEl('rect', { class: 'tl-proj__progress', rx: TL.project.rx, height: TL.project.h, 'data-part': 'project-progress' });
      progress.style.fill = tint(colour, 38);
      const title = svgEl('text', { class: 'tl-proj__title', 'data-part': 'project-title' });
      title.textContent = spec.text ?? '';
      g.append(face, progress, title, svgEl('g', { class: 'tl-proj__dots' }), svgEl('rect', { class: 'tl-proj__baseline', width: 2, rx: 1, height: TL.project.h + 8, 'data-part': 'baseline-tick' }));
      return;
    }
    if (kind === 'bracket') {
      g.setAttribute('data-part', 'project-bracket');
      const mark = svgEl('rect', { class: 'tl-bracket', rx: TL.project.bracketRx, height: TL.project.bracketH, 'data-entity-id': ref, 'data-morph-shape': 'track', 'data-morph-color': colour });
      mark.style.fill = colour;
      g.append(mark);
      return;
    }
    if (kind === 'band') {
      g.setAttribute('data-part', 'goal-band');
      const mark = svgEl('rect', { class: 'tl-band', rx: TL.band.rx, height: TL.band.h });
      mark.style.fill = SURF.goalBand;
      const text = svgEl('text', { class: 'tl-band__label' });
      text.textContent = spec.text ?? '';
      g.append(mark, text);
      return;
    }
    if (kind === 'undated') {
      g.setAttribute('data-part', 'undated');
      g.setAttribute('role', 'button');
      const mark = svgEl('rect', { class: 'tl-undated', rx: TL.undated.rx, height: TL.undated.h });
      const text = svgEl('text', { class: 'tl-undated__label' });
      text.textContent = spec.text ?? '';
      g.append(mark, text);
      return;
    }
    if (kind === 'curve') {
      g.setAttribute('data-part', 'curve');
      g.setAttribute('data-kind', spec.flags?.critical ? 'critical' : 'normal');
      g.append(svgEl('path', { class: `tl-curve${spec.flags?.critical ? ' tl-curve--critical' : ''}`, fill: 'none', 'marker-end': spec.flags?.critical ? 'url(#tl-arrow-critical)' : 'url(#tl-arrow)' }));
      return;
    }
    if (kind === 'hol') {
      g.setAttribute('data-part', 'holiday');
      const mark = svgEl('rect', { class: 'tl-hol' });
      mark.style.fill = SURF.holiday;
      g.append(mark);
      return;
    }
    if (kind === 'grid') {
      g.append(svgEl('line', { class: 'tl-grid' }));
      return;
    }
    if (kind === 'term') {
      g.setAttribute('data-part', 'axis-term');
      const text = svgEl('text', { class: spec.flags?.holiday ? 'tl-term__label tl-term__label--hol' : 'tl-term__label' });
      text.textContent = spec.text ?? '';
      g.append(svgEl('rect', { class: spec.flags?.holiday ? 'tl-term tl-term--hol' : 'tl-term', rx: 6, height: TL.axis.termH }), text);
      return;
    }
    if (kind === 'week') {
      g.setAttribute('data-part', 'axis-week');
      const label = svgEl('text', { class: 'tl-week__label' });
      label.textContent = spec.text ?? '';
      const date = svgEl('text', { class: 'tl-week__date' });
      date.textContent = spec.sub ?? '';
      g.append(label, date);
      return;
    }
    if (kind === 'wall') {
      g.setAttribute('data-part', 'wall');
      const pill = svgEl('g', { class: 'tl-wall__pill' });
      pill.append(
        svgEl('rect', { rx: 10, height: 20 }),
        svgEl('path', { class: 'tl-wall__lock', d: 'M-3.5 -1 v-2 a3.5 3.5 0 0 1 7 0 v2 M-5 -1 h10 v7 h-10 z' }),
        svgEl('text')
      );
      g.append(
        svgEl('rect', { class: 'tl-wall', fill: 'url(#tl-hatch)' }),
        svgEl('line', { class: 'tl-wall__edge' }),
        svgEl('line', { class: 'tl-wall__edge tl-wall__edge--end' }),
        pill
      );
      const label = pill.querySelector('text');
      if (label) label.textContent = spec.text ?? '';
      return;
    }
    if (kind === 'today') {
      g.setAttribute('data-part', 'today');
      const text = svgEl('text', { class: 'tl-today__text', 'text-anchor': 'middle' });
      text.textContent = 'Today';
      g.append(svgEl('line', { class: 'tl-today__line' }), svgEl('rect', { class: 'tl-today__pill', rx: TL.today.pillH / 2, height: TL.today.pillH, width: TL.today.pillW }), text);
      return;
    }
    if (kind === 'shadow') {
      g.setAttribute('data-part', 'shadow');
      g.setAttribute('data-task-id', ref);
      if (spec.flags?.warn) g.setAttribute('data-warn', 'true');
      const face = svgEl('rect', { class: 'tl-shadow', rx: TL.shadow.rx, height: TL.shadow.h });
      face.style.fill = SURF.shadowFill;
      const done = svgEl('rect', { class: 'tl-shadow__done', rx: TL.shadow.rx, height: TL.shadow.h, 'data-part': 'shadow-progress' });
      done.style.fill = tint(colour, 34);
      const edge = svgEl('rect', { class: 'tl-shadow__edge', width: 3, rx: 1.5, height: TL.shadow.h });
      const label = svgEl('text', { class: 'tl-shadow__label', 'data-part': 'shadow-label' });
      label.textContent = spec.text ?? '';
      const warn = svgEl('text', { class: 'tl-shadow__warn', 'data-part': 'shadow-warn' });
      warn.textContent = spec.sub ?? '';
      g.append(face, svgEl('g', { class: 'tl-shadow__density' }), done, edge, label, warn);
      return;
    }
    if (kind === 'load') {
      g.setAttribute('data-part', 'load-col');
      if (spec.flags?.over) g.setAttribute('data-over', 'true');
      if (spec.flags?.wall) g.setAttribute('data-wall', 'true');
      const rect = svgEl('rect', {
        class: `tl-load${spec.flags?.over ? ' tl-load--over' : ''}${spec.flags?.wall ? ' tl-load--wall' : ''}`,
        rx: TL.load.rx
      });
      const text = svgEl('text', {
        class: `tl-load__val${spec.flags?.over ? ' tl-load__val--over' : ''}`,
        'text-anchor': 'middle'
      });
      text.textContent = spec.text ?? '';
      g.append(rect, text);
      return;
    }
    if (kind === 'cap') {
      g.setAttribute('data-part', 'capacity-line');
      g.append(svgEl('path', { class: 'tl-cap', fill: 'none' }), svgEl('line', { class: 'tl-load-divider' }));
      return;
    }
    if (kind === 'ripple') {
      g.setAttribute('data-part', 'ripple');
      const rect = svgEl('rect', {
        class: `tl-ripple${spec.flags?.slip ? ' tl-ripple--slip' : ''}`,
        rx: TL.bar.rx,
        height: TL.bar.h
      });
      const text = svgEl('text', { class: 'tl-ripple__label' });
      text.textContent = spec.text ?? '';
      g.append(rect, text);
      return;
    }
    if (kind === 'rowtitle') {
      g.setAttribute('data-part', 'row-title');
      const text = svgEl('text', { class: `tl-rowtitle tl-rowtitle--${data.kind ?? 'goal'}` });
      text.textContent = spec.text ?? '';
      g.append(text);
    }
  }

  function createNode(id: string): void {
    const spec = specs.get(id);
    if (!spec) return;
    if (spec.kind === 'label') {
      const node = el('div', 'tl-label');
      labels.append(node);
      nodes.set(id, node);
      return;
    }
    const host = svgEl('g', { 'data-id': id });
    const inner = svgEl('g', { class: 'tl-pop' });
    buildShape(spec.kind, inner, spec, id);
    host.append(inner);
    layerFor(spec.kind).append(host);
    nodes.set(id, host);
  }

  function removeNode(id: string): void {
    nodes.get(id)?.remove();
    nodes.delete(id);
  }

  function stickyX(barX: number, barW: number, textWidth: number): number {
    const min = viewLeft + 12 - barX;
    return Math.max(12, Math.min(min, barW - textWidth - 12));
  }

  function apply(id: string, props: Readonly<Props>): void {
    if (id === '__view') {
      state.dayWidth = props.dayWidth ?? state.dayWidth;
      relayout('zoom');
      return;
    }
    const node = nodes.get(id);
    const spec = specs.get(id);
    if (!node || !spec) return;
    const opacity = String(props.opacity ?? 1);
    if (spec.kind === 'label') {
      const row = node as HTMLElement;
      row.style.transform = `translate3d(0, ${props.y ?? 0}px, 0)`;
      row.style.height = `${props.h ?? 0}px`;
      row.style.opacity = opacity;
      return;
    }
    const host = node as SVGGElement;
    host.setAttribute('opacity', opacity);
    const inner = host.firstElementChild as SVGGElement;
    inner.style.transform = props.scale !== undefined && props.scale !== 1 ? `scale(${props.scale})` : '';
    const x = props.x ?? 0;
    const y = props.y ?? 0;
    const w = Math.max(0, props.w ?? 0);
    if (spec.kind === 'bar' || spec.kind === 'step') {
      const bh = spec.kind === 'step' ? TL.bar.h - 6 : TL.bar.h;
      host.setAttribute('transform', `translate(${x} ${y})`);
      inner.classList.toggle('is-critical', Boolean(props.crit));
      inner.classList.toggle('is-dim', Boolean(props.dim));
      const [halo, face, stripe, grip, title, sub] = [...inner.children] as SVGElement[];
      setAttrs(halo!, { x: -4, y: -4, width: w + 8, height: bh + 8 });
      setAttrs(face!, { width: w, height: bh });
      setAttrs(stripe!, { x: TL.bar.stripeInset, y: 5, height: bh - 10 });
      setAttrs(grip!, { x: w - 7, y: 7, height: bh - 14 });
      const font = `500 13px ${FONT}`;
      const inside = textW(spec.text ?? '', font) + TL.bar.textPad + 10 <= w;
      if (title!.textContent !== (spec.text ?? '')) title!.textContent = spec.text ?? '';
      if (sub!.textContent !== (spec.sub ?? '')) sub!.textContent = spec.sub ?? '';
      setAttrs(title!, { x: inside ? TL.bar.textPad : w + TL.bar.outsideGap, y: bh / 2 + 4.5 });
      const subX = (inside ? w : w + TL.bar.outsideGap + textW(spec.text ?? '', font)) + 12;
      setAttrs(sub!, { x: subX, y: bh / 2 + 4.5 });
      const link = inner.querySelector('.tl-bar__link');
      if (link) setAttrs(link, { cx: w, cy: bh / 2 });
      const badge = inner.querySelector('[data-part="wall-badge"]');
      if (badge) {
        badge.setAttribute('opacity', spec.flags?.inside ? '1' : '0');
        badge.setAttribute('transform', 'translate(-6 -8)');
      }
      const before = inner.querySelector('[data-part="before-chip"]');
      if (before) {
        const chip = spec.data?.before ?? '';
        if (before.textContent !== chip) before.textContent = chip;
        setAttrs(before, { x: subX + textW(spec.sub ?? '', font) + 10, y: bh / 2 + 4.5 });
      }
      inner.classList.toggle('is-wall-warn', false);
      return;
    }
    if (spec.kind === 'ms') {
      host.setAttribute('transform', `translate(${x} ${y})`);
      const [mark, text] = [...inner.children] as SVGElement[];
      setAttrs(mark!, { x: -TL.diamond / 2, y: -TL.diamond / 2, transform: 'rotate(45)' });
      setAttrs(text!, { x: TL.diamond / 2 + 8, y: 4.5 });
      const before = inner.querySelector('[data-part="before-chip"]');
      if (before) {
        const chip = spec.data?.before ?? '';
        if (before.textContent !== chip) before.textContent = chip;
        const labelW = textW(spec.text ?? '', `500 12px ${FONT}`);
        setAttrs(before, { x: TL.diamond / 2 + 8 + labelW + 10, y: 4.5 });
      }
      const badge = inner.querySelector('[data-part="wall-badge"]');
      if (badge) {
        badge.setAttribute('opacity', spec.flags?.inside ? '1' : '0');
        badge.setAttribute('transform', 'translate(8 -16)');
      }
      return;
    }
    if (spec.kind === 'dream') {
      host.setAttribute('transform', `translate(${x} ${y})`);
      const [mark, text, line] = [...inner.children] as SVGElement[];
      setAttrs(line!, { x1: 0, x2: w, y1: 0, y2: 0 });
      const tw = textW(spec.text ?? '', `500 12px ${FONT}`);
      const inRange = Boolean(props.inRange);
      setAttrs(mark!, { x: -TL.diamond / 2, y: -TL.diamond / 2, transform: `translate(${inRange ? w : w - 10} 0) rotate(45)`, opacity: inRange ? 1 : 0 });
      setAttrs(text!, { x: stickyX(x, w, tw + 24), y: -9 });
      return;
    }
    if (spec.kind === 'proj') {
      host.setAttribute('transform', `translate(${x} ${y})`);
      const [face, progress, title, dots, base] = [...inner.children] as SVGElement[];
      setAttrs(face!, { width: w });
      setAttrs(progress!, { width: Math.max(0, w * (props.progress ?? 0)) });
      const tw = textW(spec.text ?? '', `600 13px ${FONT}`);
      const inside = tw + 28 <= w;
      setAttrs(title!, { x: inside ? stickyX(x, w, tw) : w + 10, y: TL.project.h / 2 + 4.5 });
      const projectId = id.split(':')[1] ?? '';
      const marks = model.milestones.filter((milestone) => milestone.project === projectId);
      while (dots!.childElementCount < marks.length) dots!.append(svgEl('rect'));
      while (dots!.childElementCount > marks.length) dots!.lastElementChild?.remove();
      [...dots!.children].forEach((mark, index) => {
        const mx = scale.x(marks[index]!.due) + state.dayWidth / 2 - x;
        setAttrs(mark, { x: -4.5, y: -4.5, width: 9, height: 9, rx: 1.5, stroke: '#fff', 'stroke-width': 2, transform: `translate(${mx} ${TL.project.h / 2}) rotate(45)`, opacity: mx < 0 || mx > w + 1 ? 0 : 1 });
        (mark as SVGElement).style.fill = spec.colour ?? 'var(--wave)';
      });
      const baseX = props.baseline ?? -1;
      setAttrs(base!, { x: baseX - x - 1, y: -4, opacity: baseX >= 0 ? 1 : 0 });
      return;
    }
    if (spec.kind === 'bracket') {
      host.setAttribute('transform', `translate(${x} ${y})`);
      setAttrs(inner.firstElementChild!, { width: w });
      return;
    }
    if (spec.kind === 'band') {
      host.setAttribute('transform', `translate(${x} ${y})`);
      const [mark, text] = [...inner.children] as SVGElement[];
      setAttrs(mark!, { width: w });
      setAttrs(text!, { x: stickyX(x, w, textW(spec.text ?? '', `500 12px ${FONT}`)), y: TL.band.h / 2 + 4 });
      return;
    }
    if (spec.kind === 'undated') {
      host.setAttribute('transform', `translate(${x} ${y})`);
      const [mark, text] = [...inner.children] as SVGElement[];
      setAttrs(mark!, { width: w });
      setAttrs(text!, { x: TL.undated.padX, y: TL.undated.h / 2 + 4 });
      return;
    }
    if (spec.kind === 'curve') {
      const path = inner.firstElementChild as SVGPathElement;
      const x1 = props.x1 ?? 0;
      const y1 = props.y1 ?? 0;
      const x2 = props.x2 ?? 0;
      const y2 = props.y2 ?? 0;
      const dx = Math.max(24, Math.abs(x2 - x1) * 0.5);
      path.setAttribute('d', `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`);
      const crit = Boolean(props.crit);
      inner.setAttribute('data-kind', crit ? 'critical' : 'normal');
      path.setAttribute('class', `tl-curve${crit ? ' tl-curve--critical' : ''}`);
      path.setAttribute('marker-end', crit ? 'url(#tl-arrow-critical)' : 'url(#tl-arrow)');
      inner.classList.toggle('is-dim', Boolean(props.dim));
      return;
    }
    if (spec.kind === 'hol') {
      setAttrs(inner.firstElementChild!, { x, y: 0, width: w, height: props.h ?? 0 });
      return;
    }
    if (spec.kind === 'grid') {
      setAttrs(inner.firstElementChild!, { x1: x, x2: x, y1: TL.axis.h - 6, y2: props.h ?? 0 });
      return;
    }
    if (spec.kind === 'term') {
      host.setAttribute('transform', `translate(${x} ${TL.axis.termY})`);
      const [mark, text] = [...inner.children] as SVGElement[];
      setAttrs(mark!, { width: w });
      const label = w > textW(spec.text ?? '', `600 11px ${FONT}`) + 20 ? spec.text ?? '' : '';
      text!.textContent = label;
      setAttrs(text!, { x: 10, y: TL.axis.termH / 2 + 4 });
      return;
    }
    if (spec.kind === 'week') {
      host.setAttribute('transform', `translate(${x} 0)`);
      const [label, date] = [...inner.children] as SVGElement[];
      const room = w - 8;
      label!.textContent = room > 40 ? spec.text ?? '' : room > 18 ? (spec.text ?? '').split(' ')[1] ?? '' : '';
      date!.textContent = room > 52 ? spec.sub ?? '' : '';
      setAttrs(label!, { x: 6, y: TL.axis.weekY });
      setAttrs(date!, { x: 6, y: TL.axis.dateY });
      return;
    }
    if (spec.kind === 'wall') {
      const [rect, edgeStart, edgeEnd, pill] = [...inner.children] as SVGElement[];
      const top = TL.axis.h;
      const bottom = Math.max(top, props.h ?? 0);
      setAttrs(rect!, { x, y: top, width: w, height: Math.max(0, bottom - top) });
      setAttrs(edgeStart!, { x1: x, x2: x, y1: top, y2: bottom });
      setAttrs(edgeEnd!, { x1: x + w, x2: x + w, y1: top, y2: bottom });
      const text = spec.text ?? '';
      const tw = textW(text, `600 12px ${FONT}`) + 36;
      pill?.setAttribute('transform', `translate(${x + 8} ${top + 8})`);
      const [pillRect, lock, pillText] = [...(pill?.children ?? [])] as SVGElement[];
      setAttrs(pillRect!, { width: tw });
      lock?.setAttribute('transform', 'translate(14 9)');
      if (pillText && pillText.textContent !== text) pillText.textContent = text;
      setAttrs(pillText!, { x: 26, y: 14 });
      return;
    }
    if (spec.kind === 'today') {
      const [line, pill, text] = [...inner.children] as SVGElement[];
      setAttrs(line!, { x1: x, x2: x, y1: TL.axis.h - 2, y2: props.h ?? 0 });
      setAttrs(pill!, { x: x - TL.today.pillW / 2, y: TL.axis.termY });
      setAttrs(text!, { x, y: TL.axis.termY + 14 });
      return;
    }
    if (spec.kind === 'shadow') {
      host.setAttribute('transform', `translate(${x} ${y})`);
      if (spec.flags?.warn) inner.setAttribute('data-warn', 'true');
      else inner.removeAttribute('data-warn');
      const [face, density, done, edge, label, warn] = [...inner.children] as SVGElement[];
      setAttrs(face!, { width: w });
      setAttrs(done!, { width: Math.max(0, w * (props.progress ?? 0)) });
      setAttrs(edge!, { x: -1.5 });
      const perDay = props.perDay ?? 0;
      const dayCount = state.dayWidth >= 8 ? Math.round(props.days ?? 0) : 0;
      const column = dayCount ? w / dayCount : 0;
      const columnH = Math.min(TL.shadow.h - 8, (TL.shadow.h - 8) * Math.min(1, perDay / Math.max(1, props.cap ?? 120)));
      pool(density!, dayCount).forEach((columnNode, index) => {
        columnNode.setAttribute('data-part', 'density-col');
        setAttrs(columnNode, {
          x: index * column + 2,
          y: TL.shadow.h - 4 - columnH,
          width: Math.max(1, column - 4),
          height: columnH,
          rx: 2
        });
        columnNode.style.fill = spec.flags?.warn
          ? 'color-mix(in srgb, var(--high-sea-ink) 22%, transparent)'
          : 'color-mix(in srgb, var(--navy) 9%, transparent)';
      });
      const labelW = textW(spec.text ?? '', `500 13px ${FONT}`);
      const inside = labelW + 24 <= w;
      if (label!.textContent !== (spec.text ?? '')) label!.textContent = spec.text ?? '';
      if (warn!.textContent !== (spec.sub ?? '')) warn!.textContent = spec.sub ?? '';
      setAttrs(label!, { x: inside ? 12 : w + 10, y: TL.shadow.h / 2 + 4.5 });
      setAttrs(warn!, { x: (inside ? w + 10 : w + 10 + labelW + 12), y: TL.shadow.h / 2 + 4.5 });
      return;
    }
    if (spec.kind === 'load') {
      const [rect, text] = [...inner.children] as SVGElement[];
      const columnH = props.h ?? 0;
      const base = props.base ?? 0;
      setAttrs(rect!, { x, y: base - columnH, width: w, height: columnH });
      setAttrs(text!, { x: x + w / 2, y: base - columnH - 6 });
      text!.setAttribute('opacity', w > 26 && columnH > 0 ? '1' : '0');
      if (text!.textContent !== (spec.text ?? '')) text!.textContent = spec.text ?? '';
      rect!.classList.toggle('tl-load--over', Boolean(spec.flags?.over));
      rect!.classList.toggle('tl-load--wall', Boolean(spec.flags?.wall));
      text!.classList.toggle('tl-load__val--over', Boolean(spec.flags?.over));
      if (spec.flags?.over) inner.setAttribute('data-over', 'true');
      else inner.removeAttribute('data-over');
      if (spec.flags?.wall) inner.setAttribute('data-wall', 'true');
      else inner.removeAttribute('data-wall');
      return;
    }
    if (spec.kind === 'cap') {
      (inner.firstElementChild as SVGPathElement | null)?.setAttribute('d', capPath);
      setAttrs(inner.children[1]!, { x1: 0, x2: props.w ?? geometry.width, y1: props.top ?? 0, y2: props.top ?? 0 });
      return;
    }
    if (spec.kind === 'ripple') {
      host.setAttribute('transform', `translate(${x} ${y})`);
      const [rect, text] = [...inner.children] as SVGElement[];
      setAttrs(rect!, { width: w });
      rect!.classList.toggle('tl-ripple--slip', Boolean(spec.flags?.slip));
      if (text!.textContent !== (spec.text ?? '')) text!.textContent = spec.text ?? '';
      setAttrs(text!, { x: props.lx ?? w + 8, y: TL.bar.h / 2 + 4.5 });
      return;
    }
    if (spec.kind === 'rowtitle') host.setAttribute('transform', `translate(${viewLeft + 12} ${y})`);
  }

  const engine = createMotion({ apply });

  function layout(): { entities: Map<string, Props>; width: number; height: number } {
    scale = buildTimeScale({
      start: range.start,
      end: range.end,
      terms: school,
      dayWidth: state.dayWidth,
      holidayFactor: state.holidaysCompressed ? 0.25 : 1
    });
    rows = buildTimelineRows(model, { zoom: state.zoom, expanded: state.expanded, today });
    const entities = new Map<string, Props>();
    const top = TL.axis.h + 8;
    const last = rows.at(-1);
    const rowsBottom = top + (last ? last.y + last.h : 0);
    const loadTop = rowsBottom + 16;
    const height = state.load ? loadTop + TL.load.h : rowsBottom + 12;
    const width = scale.width + PAD_R;
    const X = (key: string) => scale.x(key);
    const barBox = (span: { start: string; end: string }) => {
      const x0 = X(span.start);
      const x1 = X(addDaysKey(span.end, 1));
      const w = Math.max(TL.bar.minW, x1 - x0);
      return { x: x1 - w, w };
    };
    const compact = card.clientWidth > 0 && card.clientWidth < TL.mobileBreak;
    card.classList.toggle('is-compact', compact);
    liveWalls = collectLifeWalls({ tasks, projects, goals });
    for (const wall of liveWalls) {
      const id = `wall:${wall.id}`;
      specs.set(id, { kind: 'wall', text: `${wall.label} · wall` });
      entities.set(id, {
        x: X(wall.starts_on),
        w: Math.max(8, X(addDaysKey(wall.ends_on, 1)) - X(wall.starts_on)),
        h: rowsBottom + 4
      });
    }

    for (const term of school) {
      const id = `term:T${term.term}`;
      specs.set(id, { kind: 'term', text: `Term ${term.term}` });
      entities.set(id, { x: X(term.starts_on), w: X(addDaysKey(term.ends_on, 1)) - X(term.starts_on) - 4 });
    }
    for (const run of holidayRuns(scale)) {
      specs.set(`hol:${run.start}`, { kind: 'hol' });
      entities.set(`hol:${run.start}`, { x: run.x, w: run.w, h: height });
      specs.set(`term:hol-${run.start}`, { kind: 'term', text: 'Holidays', flags: { holiday: true } });
      entities.set(`term:hol-${run.start}`, { x: run.x + 2, w: Math.max(0, run.w - 4) });
    }
    for (let key = mondayOf(range.start); key <= range.end; key = addDaysKey(key, 7)) {
      const x = X(key);
      const next = X(addDaysKey(key, 7));
      const label = weekLabel(key, school) ?? weekLabel(addDaysKey(key, 1), school);
      specs.set(`grid:${key}`, { kind: 'grid' });
      entities.set(`grid:${key}`, { x, h: height });
      if (!label) continue;
      specs.set(`week:${key}`, { kind: 'week', text: label, sub: formatKey(key) });
      entities.set(`week:${key}`, { x, w: next - x });
    }

    const rowY = new Map<string, number>();
    for (const row of rows) {
      const y = top + row.y;
      rowY.set(row.ref, y);
      if (compact && (row.kind === 'goal' || row.kind === 'group' || row.kind === 'dream' || (row.kind === 'project' && row.open))) {
        const dream = model.dreams.find((item) => item.id === row.ref);
        specs.set(`rowtitle:${row.ref}`, {
          kind: 'rowtitle',
          text: row.kind === 'dream' && dream ? `Dream · ${row.label} · target ${formatKey(dream.target)}` : row.label,
          data: { kind: row.kind }
        });
        entities.set(`rowtitle:${row.ref}`, { x: 0, y: row.kind === 'project' || row.kind === 'dream' ? y + 10 : y + row.h / 2 + 4 });
      }
      specs.set(`label:${row.id}`, { kind: 'label', text: row.label });
      entities.set(`label:${row.id}`, { y: row.y, h: row.h });

      if (row.kind === 'goal') {
        const kids = model.projects.filter((project) => project.goal === row.ref);
        if (!kids.length) continue;
        const x0 = Math.min(...kids.map((project) => X(project.start)));
        const x1 = Math.max(...kids.map((project) => X(addDaysKey(project.end, 1))));
        specs.set(`band:${row.ref}`, { kind: 'band', text: `${kids.length} projects` });
        entities.set(`band:${row.ref}`, { x: x0, y: y + (row.h - TL.band.h) / 2, w: Math.max(TL.band.h, x1 - x0) });
      }
      if (row.kind === 'dream') {
        const dream = model.dreams.find((item) => item.id === row.ref);
        if (!dream) continue;
        const inRange = dream.target <= range.end;
        const x0 = dream.origin && dream.origin > range.start ? X(dream.origin) : 0;
        const x1 = inRange ? X(dream.target) : scale.width;
        specs.set(`dream:${dream.id}`, { kind: 'dream', text: `Target ${formatKey(dream.target)}${inRange ? '' : ' →'}`, colour: 'var(--pastel-gold-ink)' });
        entities.set(`dream:${dream.id}`, { x: x0, y: y + row.h / 2 + 6, w: Math.max(1, x1 - x0), inRange: inRange ? 1 : 0 });
      }
      if (row.kind === 'project') {
        const project = projectById(row.ref);
        if (!project) continue;
        const x0 = X(project.start);
        const x1 = X(addDaysKey(project.end, 1));
        const all = state.tasks.filter((task) => task.project === project.id);
        const done = all.filter((task) => task.status === 'done').length;
        const barH = row.open ? TL.project.bracketH : TL.project.h;
        const by = y + (row.h - barH) / 2;
        if (row.open) {
          specs.set(`bracket:${project.id}`, { kind: 'bracket', colour: project.colour });
          entities.set(`bracket:${project.id}`, { x: x0, y: by, w: Math.max(TL.project.bracketH, x1 - x0) });
        } else {
          specs.set(`proj:${project.id}`, { kind: 'proj', text: project.title, colour: project.colour });
          entities.set(`proj:${project.id}`, {
            x: x0,
            y: by,
            w: Math.max(TL.project.h, x1 - x0),
            progress: all.length ? done / all.length : 0,
            baseline: project.baselineEnd ? X(addDaysKey(project.baselineEnd, 1)) : -1
          });
        }
        const undated = undatedCount(project.id, state.tasks);
        if (undated) {
          const text = `+${undated} undated`;
          const titleW = textW(project.title, `600 13px ${FONT}`);
          const titleOutside = !row.open && titleW + 28 > x1 - x0;
          specs.set(`undated:${project.id}`, { kind: 'undated', text });
          entities.set(`undated:${project.id}`, {
            x: titleOutside ? x1 + 10 + titleW + 12 : x1 + 8,
            y: y + (row.h - TL.undated.h) / 2,
            w: textW(text, `500 12px ${FONT}`) + TL.undated.padX * 2
          });
        }
      }
      if (row.kind === 'task' || row.kind === 'step') {
        const task = state.tasks.find((item) => item.id === row.ref);
        const span = task ? timelineTaskSpan(task) : null;
        if (!task || !span) continue;
        const box = barBox(span);
        const id = `${row.kind === 'step' ? 'step' : 'bar'}:${task.id}`;
        const sub = task.blocked ? blockedLabel(task.blockedSince, today) : task.status === 'done' ? 'done' : `due ${formatKey(task.due!)}`;
        const chip = beforeWallChip(task.due, task.status, liveWalls);
        const inside = Boolean(task.due && wallContaining(task.due, liveWalls));
        specs.set(id, {
          kind: row.kind === 'step' ? 'step' : 'bar',
          text: task.title,
          sub,
          colour: taskColour(task),
          flags: inside ? { inside: true } : undefined,
          data: {
            state: task.status === 'done' ? 'done' : task.blocked ? 'blocked' : task.status,
            ...(task.blocked ? { blocked: 'true' } : {}),
            ...(chip ? { before: chip } : {})
          }
        });
        entities.set(id, { x: box.x, y: y + (row.h - (row.kind === 'step' ? TL.bar.h - 6 : TL.bar.h)) / 2, w: box.w });
      }
      if (row.kind === 'milestone') {
        const milestone = model.milestones.find((item) => item.id === row.ref);
        const project = milestone ? projectById(milestone.project) : undefined;
        if (!milestone || !project) continue;
        const chip = beforeWallChip(milestone.due, 'open', liveWalls);
        specs.set(`ms:${milestone.id}`, {
          kind: 'ms',
          text: `${milestone.title} · ${formatKey(milestone.due)}`,
          colour: project.colour,
          flags: wallContaining(milestone.due, liveWalls) ? { inside: true } : undefined,
          data: chip ? { before: chip } : undefined
        });
        entities.set(`ms:${milestone.id}`, { x: X(milestone.due) + state.dayWidth / 2, y: y + row.h / 2 });
      }
      if (row.kind === 'marking') {
        const task = state.tasks.find((item) => item.id === row.ref);
        const marking = task?.marking;
        if (!task || !marking) continue;
        const paint = markingShadowPaint({
          marking,
          rate:
            marking.minutes_per_script ??
            (task.est && marking.scripts ? task.est / marking.scripts : prefs.marking_default_minutes_per_script),
          today,
          capacityOf: (date) => (wallContaining(date, liveWalls) ? 0 : dayCapacity(date, profile).available_minutes)
        });
        const x0 = X(marking.collected_on);
        const x1 = X(addDaysKey(marking.return_by, 1));
        specs.set(`shadow:${task.id}`, {
          kind: 'shadow',
          text: paint.label,
          sub: paint.warnText,
          colour: taskColour(task),
          flags: paint.warn ? { warn: true } : undefined
        });
        entities.set(`shadow:${task.id}`, {
          x: x0,
          y: y + (row.h - TL.shadow.h) / 2,
          w: Math.max(TL.shadow.h, x1 - x0),
          progress: paint.progress,
          perDay: paint.perDay,
          days: paint.days,
          cap: dayCapacity(today, profile).available_minutes || 120
        });
      }
    }

    const anchor = (id: string, end: 'start' | 'finish'): { x: number; y: number } | null => {
      const bar = entities.get(`bar:${id}`) ?? entities.get(`step:${id}`);
      if (bar) return { x: end === 'finish' ? (bar.x ?? 0) + (bar.w ?? 0) : bar.x ?? 0, y: (bar.y ?? 0) + TL.bar.h / 2 };
      const milestone = entities.get(`ms:${id}`);
      if (milestone) return { x: (milestone.x ?? 0) + (end === 'finish' ? 8 : -8), y: milestone.y ?? 0 };
      return null;
    };
    const links: Array<{ from: string; to: string; project: string }> = [];
    const projectOf = (id: string) => state.tasks.find((task) => task.id === id)?.project ?? model.milestones.find((item) => item.id === id)?.project ?? null;
    for (const task of state.tasks) {
      for (const dep of task.deps) {
        const project = projectOf(task.id);
        if (project) links.push({ from: dep, to: task.id, project });
      }
    }
    for (const milestone of model.milestones) {
      for (const dep of milestone.deps) links.push({ from: dep, to: milestone.id, project: milestone.project });
    }
    const visible = links.filter((link) => anchor(link.from, 'finish') && anchor(link.to, 'start'));
    const spans = rows.flatMap((row) => {
      if (row.kind === 'task' || row.kind === 'step') {
        const task = state.tasks.find((item) => item.id === row.ref);
        const span = task ? timelineTaskSpan(task) : null;
        return task && span && task.project ? [{ id: task.id, project: task.project, label: task.title, start: span.start, end: span.end }] : [];
      }
      if (row.kind === 'milestone') {
        const milestone = model.milestones.find((item) => item.id === row.ref);
        return milestone ? [{ id: milestone.id, project: milestone.project, label: milestone.title, start: milestone.due, end: milestone.due }] : [];
      }
      return [];
    });
    const critical = state.critical ? timelineCritical({ rangeStart: range.start, spans, links: visible }) : { nodes: new Set<string>(), edges: new Set<string>() };
    for (const [id, props] of entities) {
      if (!id.startsWith('bar:') && !id.startsWith('step:') && !id.startsWith('ms:')) continue;
      const ref = id.split(':').slice(1).join(':');
      const onPath = critical.nodes.has(ref);
      if (state.critical) entities.set(id, { ...props, crit: onPath ? 1 : 0, dim: onPath ? 0 : 1 });
    }
    for (const link of visible) {
      const from = anchor(link.from, 'finish');
      const to = anchor(link.to, 'start');
      if (!from || !to) continue;
      const key = `${link.from}>${link.to}`;
      const onPath = critical.edges.has(key);
      specs.set(`curve:${key}`, { kind: 'curve', flags: { critical: onPath } });
      entities.set(`curve:${key}`, { x1: from.x, y1: from.y, x2: to.x - 2, y2: to.y, crit: onPath ? 1 : 0, dim: state.critical && !onPath ? 1 : 0 });
    }

    specs.set('today', { kind: 'today' });
    entities.set('today', { x: X(today) + state.dayWidth * frac, h: rowsBottom + 4 });

    const gesture = state.drag && state.drag.mode !== 'link' ? state.drag : state.preview;
    const shift = new Map<string, string>();
    if (gesture && gesture.days) {
      const items = schedulables().map((item) =>
        item.id === gesture.id && item.due_date ? { ...item, due_date: addDaysKey(item.due_date, gesture.days) } : item
      );
      for (const [id, due] of cascadeForward(items, collectDependencies(tasks, projects), gesture.id)) shift.set(id, due);
      const self = items.find((item) => item.id === gesture.id)?.due_date;
      if (self) shift.set(gesture.id, self);
    }
    const shiftedTask = (task: TlTask) => {
      const due = shift.get(task.id);
      if (!due || !task.due || due === task.due) return task;
      const delta = Math.round((toMs(due) - toMs(task.due)) / 86_400_000);
      return {
        ...task,
        due,
        marking: task.marking
          ? { ...task.marking, return_by: due, collected_on: addDaysKey(task.marking.collected_on, delta) }
          : task.marking
      };
    };
    capPath = '';
    if (state.load) {
      const samples = termSamples();
      const legendNote = legend.querySelector('small');
      if (legendNote) legendNote.textContent = learningTermRhythm(samples) ? 'Learning your term rhythm' : 'Term rhythm applied';
      const weeks = buildWeekLoad({
        today,
        rangeEnd: range.end,
        tasks: state.tasks.map((task) => {
          const next = shiftedTask(task);
          return { status: next.status, due: next.due, est: next.est, marking: next.marking ?? null };
        }),
        capacityOf: (date) => dayCapacity(date, profile).available_minutes,
        wallOn: (date) => Boolean(wallContaining(date, liveWalls)),
        factorFor: (monday) => termRhythmFactor(samples, weekIndex(monday, school))
      });
      const maxMin = Math.max(...weeks.map((week) => Math.max(week.minutes, week.capacity)), 1);
      const base = loadTop + TL.load.h - 10;
      const scaleH = (minutes: number) => ((TL.load.h - TL.load.top - 10) * minutes) / maxMin;
      const cap: string[] = [];
      for (const week of weeks) {
        const x0 = X(week.key);
        const x1 = X(addDaysKey(week.key, 7));
        specs.set(`load:${week.key}`, {
          kind: 'load',
          text: `${Math.round(week.minutes / 60)} h`,
          flags: { over: week.over, wall: week.wall }
        });
        entities.set(`load:${week.key}`, {
          x: x0 + TL.load.colGap / 2,
          w: Math.max(2, x1 - x0 - TL.load.colGap),
          h: Math.max(week.minutes ? 3 : 0, scaleH(week.minutes)),
          base
        });
        const cy = base - scaleH(week.capacity);
        cap.push(`${cap.length ? 'L' : 'M'}${x0} ${cy} L${x1} ${cy}`);
      }
      capPath = cap.join(' ');
      specs.set('cap', { kind: 'cap' });
      entities.set('cap', { x: 0, w: width, top: loadTop - 8 });
    }
    if (gesture?.days) {
      const hops = new Map<string, number>([[gesture.id, gesture.days]]);
      const hopLinks: Array<[string, string]> = [];
      for (const task of state.tasks) for (const dep of task.deps) hopLinks.push([dep, task.id]);
      for (const milestone of model.milestones) for (const dep of milestone.deps) hopLinks.push([dep, milestone.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const [from, to] of hopLinks) {
          if (!hops.has(from) || hops.has(to)) continue;
          hops.set(to, hops.get(from)!);
          changed = true;
        }
      }
      const dragged = entities.get(`bar:${gesture.id}`) ?? entities.get(`step:${gesture.id}`) ?? entities.get(`ms:${gesture.id}`);
      for (const [id, days] of hops) {
        if (id === gesture.id) continue;
        const milestone = model.milestones.find((item) => item.id === id);
        const task = state.tasks.find((item) => item.id === id);
        const current = entities.get(`bar:${id}`) ?? entities.get(`step:${id}`) ?? entities.get(`ms:${id}`) ?? dragged;
        if (!current) continue;
        if (milestone) {
          const due = addDaysKey(milestone.due, days);
          const slip = days > 0;
          specs.set(`ripple:${id}`, {
            kind: 'ripple',
            text: slip ? `would slip to ${formatKey(due)}` : '',
            flags: slip ? { slip: true } : undefined
          });
          const rx = X(due) + state.dayWidth / 2 - TL.bar.h / 2;
          const labelEnd = (current.x ?? 0) + TL.diamond / 2 + 8 + textW(`${milestone.title} · ${formatKey(milestone.due)}`, `600 12px ${FONT}`);
          entities.set(`ripple:${id}`, {
            x: rx,
            y: (current.y ?? 0) - TL.bar.h / 2,
            w: TL.bar.h,
            lx: Math.max(TL.bar.h + 8, labelEnd - rx + 12)
          });
        } else if (task?.due) {
          const span = timelineTaskSpan({ due: addDaysKey(task.due, days), est: task.est });
          if (!span) continue;
          const box = barBox(span);
          specs.set(`ripple:${id}`, { kind: 'ripple', text: '' });
          entities.set(`ripple:${id}`, { x: box.x, y: current.y ?? 0, w: box.w });
        }
      }
    }
    return { entities, width, height };
  }

  function weekIndex(monday: string, terms: SchoolTerm[]): number {
    const term = terms.find((item) => monday >= mondayOf(item.starts_on) && monday <= item.ends_on);
    if (!term) return 0;
    return Math.max(0, Math.round((toMs(monday) - toMs(mondayOf(term.starts_on))) / (7 * 86_400_000)));
  }

  function termSamples(): TermWeekSample[] {
    const samples: TermWeekSample[] = [];
    for (const task of state.tasks) {
      if (task.status !== 'done' || !task.due || !task.est) continue;
      const term = school.find((item) => task.due! >= item.starts_on && task.due! <= item.ends_on);
      if (!term) continue;
      samples.push({
        termKey: `${term.starts_on}:${term.term}`,
        weekIndex: weekIndex(mondayOf(task.due), school),
        minutes: task.est
      });
    }
    return samples;
  }

  function paintLabels(): void {
    for (const row of rows) {
      const node = nodes.get(`label:${row.id}`) as HTMLElement | undefined;
      if (!node) continue;
      const signature = `${row.open}-${row.label}-${row.kind}`;
      if (node.dataset.painted === signature) continue;
      node.dataset.painted = signature;
      node.className = `tl-label tl-label--${row.kind}`;
      node.setAttribute('data-part', 'label');
      node.style.setProperty('--depth', String(row.depth));
      node.replaceChildren();
      const expandable = row.kind === 'goal' || row.kind === 'project' || row.kind === 'group' || (row.kind === 'task' && state.tasks.some((task) => task.parent === row.ref));
      if (expandable) {
        const open = row.kind === 'task' ? isOpen(row.ref, 'task') : Boolean(row.open);
        const button = el('button', `tl-chev${open ? ' is-open' : ''}`);
        button.type = 'button';
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${row.label}`);
        button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>';
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          toggle(row.ref, row.kind);
        });
        node.append(button);
      } else node.append(el('span', 'tl-chev-space'));
      if (row.kind === 'project') {
        const dot = el('i', 'tl-label__dot');
        dot.style.background = row.colour ?? 'var(--wave)';
        node.append(dot);
      }
      if (row.kind === 'dream') node.append(el('span', 'tl-label__tag', 'Dream'));
      node.append(el('span', 'tl-label__text', row.label));
    }
  }

  function relayout(reason: 'zoom' | 'settle' | 'expand' | 'first' | 'drag' | 'release'): void {
    const anchorX = zoomAnchor ? zoomAnchor.screenX : 0;
    const next = layout();
    geometry = { width: next.width, height: next.height };
    const width = reason === 'zoom' && zoomCanvasWidth ? zoomCanvasWidth : next.width;
    if (svg.getAttribute('width') !== String(width)) {
      svg.setAttribute('width', String(width));
      svg.style.width = `${width}px`;
    }
    if (svg.getAttribute('height') !== String(next.height)) svg.setAttribute('height', String(next.height));
    labels.style.height = `${next.height}px`;
    labels.style.setProperty('--tl-top', `${TL.axis.h + 8}px`);
    legend.hidden = !state.load;
    legend.style.top = `${next.height - TL.load.h + 8}px`;
    if (reason === 'zoom') {
      for (const [id, props] of next.entities) {
        if (!nodes.has(id)) createNode(id);
        engine.place(id, { opacity: 1, scale: 1, ...props });
      }
      for (const id of lastIds) {
        if (!next.entities.has(id)) {
          engine.forget(id);
          removeNode(id);
        }
      }
      lastIds = [...next.entities.keys()];
      if (zoomAnchor) scroller.scrollLeft = scale.x(zoomAnchor.date) + zoomAnchor.frac * state.dayWidth - anchorX;
      return;
    }
    if (reason === 'release' && state.release) {
      const release = state.release;
      state.release = null;
      let stagger = 0;
      for (const [id, props] of next.entities) {
        if (!nodes.has(id)) createNode(id);
        const ref = id.split(':').slice(1).join(':');
        const primary = ref === release.id && (id.startsWith('bar:') || id.startsWith('step:') || id.startsWith('ms:'));
        const dependant = release.deps.has(ref) && !primary;
        engine.to(id, { opacity: 1, scale: 1, ...props }, {
          duration: primary ? MOTION.release : dependant ? MOTION.settle : MOTION.release,
          easing: primary ? OVERSHOOT : EASE,
          delay: dependant ? MOTION.cascadeStagger * ++stagger : 0
        });
      }
      for (const id of lastIds) {
        if (!next.entities.has(id)) {
          engine.forget(id);
          removeNode(id);
        }
      }
      lastIds = [...next.entities.keys()];
      paintLabels();
      return;
    }
    const options =
      reason === 'release' ? { duration: MOTION.release, easing: OVERSHOOT }
      : reason === 'expand' ? { duration: MOTION.expand, easing: EASE }
      : reason === 'drag' ? { duration: MOTION.hover, easing: EASE }
      : { duration: MOTION.settle, easing: EASE };
    if (reason === 'first' || !laidOut) {
      for (const [id, props] of next.entities) {
        if (!nodes.has(id)) createNode(id);
        engine.place(id, { opacity: 1, scale: 1, ...props });
      }
      lastIds = [...next.entities.keys()];
      laidOut = true;
      paintLabels();
      if (!reduced) playEntrance();
      return;
    }
    reconcile(engine, next.entities, { previous: lastIds, create: createNode, remove: removeNode, options });
    lastIds = [...next.entities.keys()];
    paintLabels();
  }

  function playEntrance(): void {
    for (const id of lastIds) {
      const kind = specs.get(id)?.kind;
      const node = nodes.get(id);
      if (!node || !kind) continue;
      if (kind === 'curve') {
        const path = node.querySelector('path');
        if (!path || typeof path.animate !== 'function' || typeof path.getTotalLength !== 'function') continue;
        const length = path.getTotalLength();
        path.animate(
          [{ strokeDasharray: `${length}`, strokeDashoffset: length }, { strokeDasharray: `${length}`, strokeDashoffset: 0 }],
          { duration: 420, delay: 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }
        );
      } else if (kind === 'bar' || kind === 'ms' || kind === 'proj' || kind === 'bracket' || kind === 'band' || kind === 'dream' || kind === 'undated' || kind === 'step' || kind === 'label') {
        const props = engine.get(id);
        const delay = Math.min(360, ((props?.y ?? 0) / 12) | 0);
        if (typeof node.animate !== 'function') continue;
        node.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 260, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }
        );
      }
    }
  }

  function scrollToToday(smooth: boolean): void {
    const target = Math.max(0, scale.x(addDaysKey(mondayOf(today), -21)) - 1);
    scroller.scrollTo({ left: target, behavior: smooth && !reduced ? 'smooth' : 'auto' });
  }

  function paintZoom(): void {
    if (!zoomPills.children.length) {
      zoomPills.append(el('span', 'hub-pills__thumb'));
      TL.zooms.forEach((zoom, index) => {
        const button = el('button', 'hub-pills__btn', zoom.label);
        button.type = 'button';
        button.addEventListener('click', () => setZoom(index));
        zoomPills.append(button);
      });
    }
    [...zoomPills.querySelectorAll('button')].forEach((button, index) => {
      button.classList.toggle('is-active', index === state.zoom);
      button.setAttribute('aria-pressed', String(index === state.zoom));
    });
    moveThumb(zoomPills);
  }

  function paintView(): void {
    if (!viewPills.children.length) {
      viewPills.append(el('span', 'hub-pills__thumb'));
      for (const [id, label] of [['bars', 'Bars'], ['lines', 'Lines']] as const) {
        const button = el('button', 'hub-pills__btn', label);
        button.type = 'button';
        button.dataset.view = id;
        button.addEventListener('click', () => setView(id));
        viewPills.append(button);
      }
    }
    [...viewPills.querySelectorAll('button')].forEach((button) => {
      const on = button.dataset.view === state.view;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    });
    moveThumb(viewPills);
  }

  function moveThumb(group: HTMLElement): void {
    const active = group.querySelector<HTMLElement>('.is-active');
    const thumb = group.querySelector<HTMLElement>('.hub-pills__thumb');
    if (!active || !thumb) return;
    group.style.setProperty('--hub-pill-x', `${active.offsetLeft}px`);
    group.style.setProperty('--hub-pill-y', `${active.offsetTop}px`);
    group.style.setProperty('--hub-pill-w', `${active.offsetWidth}px`);
    group.style.setProperty('--hub-pill-h', `${active.offsetHeight}px`);
    group.classList.add('is-ready');
  }

  function setZoom(index: number, anchorClientX?: number): void {
    index = Math.max(0, Math.min(TL.zooms.length - 1, index));
    if (index === state.zoom && anchorClientX === undefined) return;
    const box = scroller.getBoundingClientRect();
    const screenX = anchorClientX !== undefined ? anchorClientX - box.left : scale.x(today) + state.dayWidth * frac - scroller.scrollLeft;
    const contentX = scroller.scrollLeft + screenX;
    const date = scale.dateAt(contentX);
    zoomAnchor = { date, frac: (contentX - scale.x(date)) / Math.max(0.001, state.dayWidth), screenX };
    const previous = state.zoom;
    state.zoom = index;
    paintZoom();
    const target = buildTimeScale({
      start: range.start,
      end: range.end,
      terms: school,
      dayWidth: TL.zooms[index]!.dayWidth,
      holidayFactor: state.holidaysCompressed ? 0.25 : 1
    });
    zoomCanvasWidth = Math.max(scale.width, target.width) + PAD_R;
    if (reduced) {
      state.dayWidth = TL.zooms[index]!.dayWidth;
      zoomCanvasWidth = 0;
      relayout('settle');
      return;
    }
    engine.place('__view', { dayWidth: state.dayWidth });
    engine.to('__view', { dayWidth: TL.zooms[index]!.dayWidth }, { duration: MOTION.zoom, easing: EASE });
    window.clearTimeout(zoomSettle);
    zoomSettle = window.setTimeout(() => {
      zoomCanvasWidth = 0;
      relayout(TL.zooms[previous]!.id !== TL.zooms[index]!.id ? 'expand' : 'settle');
    }, MOTION.zoom + 20);
    announce(`Zoom ${TL.zooms[index]!.label}`);
  }

  let morph: MorphController | null = null;
  let linesMount: LinesMount | null = null;
  let linesScale = false;

  function linesInput(): LinesInput {
    const dated = new Set(
      tasks
        .filter((task) => task.due_date && !task.parent_task_id && task.parent_project_id)
        .map((task) => task.parent_project_id as string)
    );
    return {
      tasks,
      projects: projects.filter((project) => dated.has(project.id)),
      lifeWalls: collectLifeWalls({ tasks, projects, goals }),
      now: new Date(`${today}T09:00:00`),
      selectedId: state.selected,
      search: '',
      insights: [],
      scale: linesScale,
      focusedProjectId: null,
      reducedMotion: reduced,
      onSelect: (id) => select(id),
      onComplete: () => undefined,
      onFocusProject: () => undefined,
      onAddStation: () => undefined,
      onReviewInsight: () => undefined,
      onToggleScale: () => {
        linesScale = !linesScale;
        linesMount?.update(linesInput());
      }
    };
  }

  function ensureLines(): void {
    linesHost.hidden = false;
    Object.assign(linesHost.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      width: '',
      opacity: '0',
      visibility: 'visible',
      pointerEvents: 'none'
    });
    if (linesHost.clientWidth < 280) linesHost.style.width = `${Math.max(320, card.clientWidth)}px`;
    if (!linesMount) linesMount = mountLinesView(linesHost, linesInput());
    else linesMount.update(linesInput());
  }

  function setView(next: ViewMode): void {
    if (morph) {
      morph.reverse();
      state.view = state.view === 'bars' ? 'lines' : 'bars';
      timelineView = state.view;
      card.dataset.view = state.view;
      paintView();
      return;
    }
    if (next === state.view) return;
    const fromRoot = state.view === 'bars' ? barsHost : linesHost;
    const toRoot = next === 'bars' ? barsHost : linesHost;
    if (next === 'lines') ensureLines();
    state.view = next;
    timelineView = next;
    card.dataset.view = next;
    paintView();
    morph = startMorph({
      host: card,
      fromRoot,
      toRoot,
      reducedMotion: reduced
    });
    void morph.finished.then((result) => {
      morph = null;
      if (result === 'reversed') {
        card.dataset.view = state.view;
        timelineView = state.view;
        paintView();
      }
      linesHost.style.width = '';
      announce(state.view === 'lines' ? 'Lines' : 'Bars');
    });
  }

  function showHammond(on: boolean): void {
    announce(on ? 'Ask Hammond' : 'Hammond dismissed');
  }

  function toggle(ref: string, kind: TlRowKind): void {
    const key = kind === 'task' ? 'task' : kind === 'group' ? 'group' : kind === 'goal' ? 'goal' : 'project';
    const open = !isOpen(ref, key);
    state.expanded.set(ref, open);
    announce(`${open ? 'Expanded' : 'Collapsed'} ${ref}`);
    relayout(reduced ? 'settle' : 'expand');
  }

  function select(id: string | null): void {
    state.selected = id;
    svg.querySelectorAll('.is-selected').forEach((node) => node.classList.remove('is-selected'));
    if (id) {
      svg.querySelector(`[data-task-id="${CSS.escape(id)}"], [data-milestone-id="${CSS.escape(id)}"]`)?.classList.add('is-selected');
    }
  }

  function schedulables(): GanttSchedulable[] {
    return [
      ...tasks.map((task) => ({
        id: task.id,
        kind: 'task' as const,
        due_date: task.due_date,
        estimated_duration: task.estimated_duration
      })),
      ...projects.flatMap((project) =>
        projectMilestones(project).map((milestone) => ({
          id: milestone.id,
          kind: 'milestone' as const,
          due_date: milestone.due_date,
          estimated_duration: null
        }))
      )
    ];
  }

  function applyDue(id: string, due: string): void {
    const raw = tasks.find((task) => task.id === id);
    if (raw) raw.due_date = due;
    const row = state.tasks.find((task) => task.id === id);
    if (row) row.due = due;
    const milestone = model.milestones.find((item) => item.id === id);
    if (milestone) milestone.due = due;
    for (const project of projects) {
      const hit = projectMilestones(project).find((item) => item.id === id);
      if (hit) hit.due_date = due;
    }
  }

  function syncTask(task: Task): void {
    const row = state.tasks.find((item) => item.id === task.id);
    if (!row) return;
    row.due = task.due_date;
    row.est = task.estimated_duration;
    row.status = task.status;
    row.blocked = Boolean(task.blocked_since);
    row.blockedSince = task.blocked_since;
    row.title = task.title;
    row.deps = (task.dependency_links?.length ? task.dependency_links.map((link) => link.from_id) : task.depends_on) ?? [];
    row.marking = task.marking ?? null;
  }

  async function persistDue(id: string, due: string, est?: number): Promise<void> {
    const raw = tasks.find((task) => task.id === id);
    if (raw) {
      if (est !== undefined) raw.estimated_duration = est;
      const patch: { due_date: string; estimated_duration?: number; marking?: Task['marking'] } = { due_date: due };
      if (est !== undefined) patch.estimated_duration = est;
      if (raw.marking) {
        const delta = Math.round((toMs(due) - toMs(raw.marking.return_by)) / 86_400_000);
        raw.marking = {
          ...raw.marking,
          return_by: due,
          collected_on: addDaysKey(raw.marking.collected_on, delta)
        };
        const row = state.tasks.find((item) => item.id === id);
        if (row) row.marking = raw.marking;
        patch.marking = raw.marking;
      }
      const saved = await tasksApi.updateTask(id, patch);
      Object.assign(raw, saved);
      notifyTasksChanged([saved]);
      return;
    }
    for (const project of projects) {
      const hit = projectMilestones(project).find((item) => item.id === id);
      if (!hit) continue;
      hit.due_date = due;
      const saved = await tasksApi.updateProject(project.id, { milestones: projectMilestones(project) });
      const index = projects.findIndex((item) => item.id === project.id);
      if (index >= 0) projects[index] = saved;
    }
  }

  function cascadeFrom(id: string): Set<string> {
    const shifted = cascadeForward(schedulables(), collectDependencies(tasks, projects), id);
    for (const [sid, due] of shifted) applyDue(sid, due);
    for (const [sid, due] of shifted) void persistDue(sid, due).catch(() => undefined);
    return new Set(shifted.keys());
  }

  function showWallToast(due: string): void {
    const hit = wallContaining(due, liveWalls);
    toast.hidden = !hit;
    toast.textContent = hit ? `Lands inside ${hit.label}` : '';
  }

  function shiftTask(id: string, days: number): void {
    const task = state.tasks.find((item) => item.id === id);
    const milestone = model.milestones.find((item) => item.id === id);
    const due0 = task?.due ?? milestone?.due;
    if (!due0 || !days) return;
    const due = addDaysKey(due0, days);
    applyDue(id, due);
    const deps = cascadeFrom(id);
    state.release = reduced ? null : { id, deps };
    relayout(reduced ? 'settle' : 'release');
    showWallToast(due);
    const title = task?.title ?? milestone?.title ?? id;
    announce(`Moved ${title} by ${days} ${Math.abs(days) === 1 ? 'day' : 'days'}`);
    void persistDue(id, due).catch(() => undefined);
  }

  function resizeTask(id: string, days: number): void {
    const task = state.tasks.find((item) => item.id === id);
    if (!task?.due || !days) return;
    const current = Math.max(1, Math.ceil((task.est ?? 60) / 120));
    const nextDays = Math.max(1, current + days);
    const due = addDaysKey(task.due, days);
    const est = nextDays * 120;
    task.est = est;
    const raw = tasks.find((item) => item.id === id);
    if (raw) raw.estimated_duration = est;
    applyDue(id, due);
    cascadeFrom(id);
    relayout(reduced ? 'settle' : 'release');
    showWallToast(due);
    announce(`Resized ${task.title}`);
    void persistDue(id, due, est).catch(() => undefined);
  }

  async function addLink(fromId: string, toId: string): Promise<void> {
    const deps = collectDependencies(tasks, projects);
    if (deps.some((dep) => dep.fromId === fromId && dep.toId === toId)) return;
    if (wouldCreateCycle(deps, fromId, toId)) {
      announce('That link would loop');
      return;
    }
    const all = [...deps, { fromId, toId, type: 'FS' as const, offsetDays: 0 }];
    const raw = tasks.find((task) => task.id === toId);
    if (raw) {
      const patch = linksPatchForTask(toId, all);
      raw.depends_on = patch.depends_on;
      raw.dependency_links = patch.dependency_links;
      const row = state.tasks.find((task) => task.id === toId);
      if (row) row.deps = patch.depends_on;
      cascadeFrom(fromId);
      relayout('settle');
      const saved = await tasksApi.updateTask(toId, patch);
      Object.assign(raw, saved);
      notifyTasksChanged([saved]);
      announce('Linked');
      return;
    }
    for (const project of projects) {
      const hit = projectMilestones(project).find((item) => item.id === toId);
      if (!hit) continue;
      hit.depends_on = [...(hit.depends_on ?? []), fromId];
      const milestone = model.milestones.find((item) => item.id === toId);
      if (milestone) milestone.deps = hit.depends_on ?? [];
      cascadeFrom(fromId);
      relayout('settle');
      const saved = await tasksApi.updateProject(project.id, { milestones: projectMilestones(project) });
      const index = projects.findIndex((item) => item.id === project.id);
      if (index >= 0) projects[index] = saved;
      announce('Linked');
      return;
    }
  }

  function onScroll(): void {
    viewLeft = scroller.scrollLeft;
    for (const [id, spec] of specs) {
      if (spec.kind !== 'proj' && spec.kind !== 'band' && spec.kind !== 'dream' && spec.kind !== 'rowtitle') continue;
      const props = engine.get(id);
      if (props && nodes.has(id)) apply(id, props);
    }
  }

  function curveSnap(id: string): Map<string, Props> {
    const snap = new Map<string, Props>();
    for (const eid of lastIds) {
      if (!eid.startsWith('curve:')) continue;
      const [from, to] = eid.slice('curve:'.length).split('>');
      if (from !== id && to !== id) continue;
      const props = engine.get(eid);
      if (props) snap.set(eid, { ...props });
    }
    return snap;
  }

  function followCurves(id: string, dx: number, mode: 'move' | 'resize', snap: Map<string, Props>): void {
    for (const [eid, props] of snap) {
      const [from, to] = eid.slice('curve:'.length).split('>');
      const fromShift = from === id ? dx : 0;
      const toShift = to === id && mode === 'move' ? dx : 0;
      engine.place(eid, { x1: (props.x1 ?? 0) + fromShift, x2: (props.x2 ?? 0) + toShift });
    }
  }

  function cancelDrag(): void {
    state.drag?.linkLine?.remove();
    const id = state.drag?.id ?? state.preview?.id;
    state.drag = null;
    state.preview = null;
    banner.hidden = true;
    if (id) svg.querySelector(`[data-task-id="${CSS.escape(id)}"], [data-milestone-id="${CSS.escape(id)}"]`)?.classList.remove('is-dragging', 'is-wall-warn');
    toast.hidden = true;
    relayout('settle');
  }

  function shiftedLoads(id: string, days: number) {
    const shift = new Map<string, string>();
    if (days) {
      const due0 = state.tasks.find((item) => item.id === id)?.due ?? model.milestones.find((item) => item.id === id)?.due;
      const items = schedulables().map((item) =>
        item.id === id && item.due_date && due0 ? { ...item, due_date: addDaysKey(due0, days) } : item
      );
      for (const [sid, due] of cascadeForward(items, collectDependencies(tasks, projects), id)) shift.set(sid, due);
      if (due0) shift.set(id, addDaysKey(due0, days));
    }
    const samples = termSamples();
    return buildWeekLoad({
      today,
      rangeEnd: range.end,
      tasks: state.tasks.map((task) => {
        const due = shift.get(task.id) ?? task.due;
        const delta = task.due && due ? Math.round((toMs(due) - toMs(task.due)) / 86_400_000) : 0;
        const marking = task.marking && delta
          ? { ...task.marking, return_by: due ?? task.marking.return_by, collected_on: addDaysKey(task.marking.collected_on, delta) }
          : task.marking ?? null;
        return { status: task.status, due, est: task.est, marking };
      }),
      capacityOf: (date) => dayCapacity(date, profile).available_minutes,
      wallOn: (date) => Boolean(wallContaining(date, liveWalls)),
      factorFor: (monday) => termRhythmFactor(samples, weekIndex(monday, school))
    });
  }

  function gestureProblem(id: string, days: number): string | null {
    const task = state.tasks.find((item) => item.id === id);
    const milestone = model.milestones.find((item) => item.id === id);
    const due0 = task?.due ?? milestone?.due;
    if (!due0 || !days) return null;
    const due = addDaysKey(due0, days);
    const direct = wallContaining(due, liveWalls);
    if (direct) return `Lands inside ${direct.label}.`;
    const items = schedulables().map((item) =>
      item.id === id && item.due_date ? { ...item, due_date: due } : item
    );
    for (const [sid, nextDue] of cascadeForward(items, collectDependencies(tasks, projects), id)) {
      const hit = wallContaining(nextDue, liveWalls);
      if (hit) {
        const name = state.tasks.find((item) => item.id === sid)?.title ?? model.milestones.find((item) => item.id === sid)?.title ?? sid;
        return `${name} lands inside ${hit.label}.`;
      }
    }
    const before = shiftedLoads(id, 0);
    const after = shiftedLoads(id, days);
    const pushed = after.some((week) => week.over && !before.find((item) => item.key === week.key)?.over);
    if (pushed) return 'This pushes a week over capacity.';
    return null;
  }

  function paintDragPreview(): void {
    const next = layout();
    for (const [id, props] of next.entities) {
      if (!id.startsWith('ripple:') && !id.startsWith('load:') && id !== 'cap') continue;
      if (!nodes.has(id)) {
        createNode(id);
        engine.place(id, { opacity: 1, scale: 1, ...props });
      } else engine.place(id, { opacity: 1, scale: 1, ...props });
    }
    for (const id of lastIds) {
      if (id.startsWith('ripple:') && !next.entities.has(id)) {
        engine.forget(id);
        removeNode(id);
      }
    }
    const ripples = [...next.entities.keys()].filter((id) => id.startsWith('ripple:'));
    lastIds = [...new Set([...lastIds.filter((id) => !id.startsWith('ripple:')), ...ripples])];
  }

  function onPointerDown(event: PointerEvent): void {
    const mark = (event.target as Element).closest('[data-part="bar"], [data-part="step-bar"], [data-part="milestone"]') as SVGGElement | null;
    if (!mark || state.view !== 'bars') return;
    const id = mark.getAttribute('data-task-id') ?? mark.getAttribute('data-milestone-id');
    if (!id) return;
    const entityId = engine.has(`bar:${id}`) ? `bar:${id}` : engine.has(`step:${id}`) ? `step:${id}` : `ms:${id}`;
    const props = engine.get(entityId);
    if (!props) return;
    const target = event.target as Element;
    const milestoneDrag = mark.getAttribute('data-part') === 'milestone';
    const mode = milestoneDrag ? 'move' : target.closest('.tl-bar__link') ? 'link' : target.closest('.tl-bar__grip') ? 'resize' : 'move';
    const start = () => {
      event.preventDefault();
      mark.classList.add('is-dragging');
      select(id);
      let linkLine: SVGLineElement | null = null;
      if (mode === 'link') {
        const x = (props.x ?? 0) + (props.w ?? 0);
        const y = (props.y ?? 0) + TL.bar.h / 2;
        linkLine = svgEl('line', { class: 'tl-drag-link', x1: x, y1: y, x2: x, y2: y });
        svg.append(linkLine);
      }
      state.drag = {
        id,
        entityId,
        startX: event.clientX,
        originX: props.x ?? 0,
        originW: props.w ?? TL.bar.minW,
        days: 0,
        pointer: event.pointerId,
        mode,
        curves: curveSnap(id),
        linkLine
      };
      mark.setPointerCapture(event.pointerId);
    };
    if (mode === 'move' && card.classList.contains('is-compact')) {
      const timer = window.setTimeout(start, 300);
      const cancel = () => window.clearTimeout(timer);
      mark.addEventListener('pointerup', cancel, { once: true });
      mark.addEventListener('pointercancel', cancel, { once: true });
      return;
    }
    start();
  }

  function onPointerMove(event: PointerEvent): void {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.startX;
    const days = Math.round(dx / state.dayWidth);
    if (days !== drag.days && drag.mode !== 'link') {
      drag.days = days;
      paintDragPreview();
    } else drag.days = days;
    if (drag.mode === 'link' && drag.linkLine) {
      const rect = svg.getBoundingClientRect();
      drag.linkLine.setAttribute('x2', String(event.clientX - rect.left));
      drag.linkLine.setAttribute('y2', String(event.clientY - rect.top));
      return;
    }
    if (drag.mode === 'resize') engine.place(drag.entityId, { w: Math.max(TL.bar.minW, drag.originW + dx) });
    else engine.place(drag.entityId, { x: drag.originX + dx });
    followCurves(drag.id, dx, drag.mode === 'resize' ? 'resize' : 'move', drag.curves);
    const task = state.tasks.find((item) => item.id === drag.id);
    const milestone = model.milestones.find((item) => item.id === drag.id);
    const due0 = task?.due ?? milestone?.due ?? null;
    const preview = due0 ? addDaysKey(due0, drag.days) : null;
    const hit = preview ? wallContaining(preview, liveWalls) : null;
    const dragging = svg.querySelector(`[data-task-id="${CSS.escape(drag.id)}"], [data-milestone-id="${CSS.escape(drag.id)}"]`);
    dragging?.classList.toggle('is-wall-warn', Boolean(hit));
    toast.hidden = !hit;
    toast.textContent = hit ? `Lands inside ${hit.label}` : '';
  }

  function onPointerUp(event: PointerEvent): void {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.linkLine?.remove();
    svg.querySelector(`[data-task-id="${CSS.escape(drag.id)}"]`)?.classList.remove('is-dragging');
    state.drag = null;
    if (drag.mode === 'link') {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const target = hit?.closest('[data-part="bar"], [data-part="step-bar"], [data-part="milestone"]');
      const toId = target?.getAttribute('data-task-id') ?? target?.getAttribute('data-milestone-id');
      if (toId && toId !== drag.id) void addLink(drag.id, toId);
      else relayout('settle');
      return;
    }
    if (!drag.days) {
      toast.hidden = true;
      svg.querySelector(`[data-task-id="${CSS.escape(drag.id)}"], [data-milestone-id="${CSS.escape(drag.id)}"]`)?.classList.remove('is-wall-warn');
      state.drag = null;
      relayout('settle');
      return;
    }
    const problem = gestureProblem(drag.id, drag.days);
    if (problem) {
      state.preview = { id: drag.id, days: drag.days, mode: drag.mode };
      state.drag = null;
      bannerTitle.textContent = problem;
      bannerDetail.textContent = ' Drop anyway keeps the move. Suggest a fix waits for Hammond.';
      banner.hidden = false;
      paintDragPreview();
      return;
    }
    banner.hidden = true;
    state.preview = null;
    if (drag.mode === 'resize') resizeTask(drag.id, drag.days);
    else shiftTask(drag.id, drag.days);
  }

  critBtn.addEventListener('click', () => {
    state.critical = !state.critical;
    critBtn.setAttribute('aria-pressed', String(state.critical));
    relayout('settle');
    announce(state.critical ? 'Critical path on' : 'Critical path off');
  });
  loadBtn.addEventListener('click', () => {
    state.load = !state.load;
    loadBtn.setAttribute('aria-pressed', String(state.load));
    relayout('settle');
  });
  holBtn.addEventListener('click', () => {
    state.holidaysCompressed = !state.holidaysCompressed;
    holBtn.textContent = state.holidaysCompressed ? 'Holidays: compressed' : 'Holidays: full';
    relayout('settle');
  });
  todayBtn.addEventListener('click', () => scrollToToday(true));
  hammondBtn.addEventListener('click', () => showHammond(true));
  addBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  menuMarking.addEventListener('click', () => {
    menu.hidden = true;
    openShadowForm(null);
  });
  dropBtn.addEventListener('click', () => {
    const pending = state.preview;
    if (!pending) return;
    banner.hidden = true;
    state.preview = null;
    if (pending.mode === 'resize') resizeTask(pending.id, pending.days);
    else shiftTask(pending.id, pending.days);
  });
  fixBtn.addEventListener('click', () => announce('Suggest a fix waits for Hammond'));

  function inputRow(label: string, type: string, value = ''): HTMLInputElement {
    const row = el('label', 'tl-field');
    row.append(el('span', 'tl-field__label', label));
    const input = document.createElement('input');
    input.className = 'tl-field__input';
    input.type = type;
    input.value = value;
    row.append(input);
    composer.append(row);
    return input;
  }

  function openShadowForm(source: Task | null): void {
    composer.replaceChildren();
    composer.hidden = false;
    composer.append(el('p', 'tl-composer__title', source ? `Marking shadow for ${source.title}` : 'Marking shadow'));
    const classLabel = inputRow('Class', 'text', '');
    const scripts = inputRow('Scripts', 'number', '28');
    const collected = inputRow('Collected on', 'date', source?.due_date ?? today);
    const returnBy = inputRow('Return by', 'date', source?.due_date ? addDaysKey(source.due_date, 7) : addDaysKey(today, 7));
    const rate = inputRow('Minutes per script', 'number', String(prefs.marking_default_minutes_per_script));
    rate.placeholder = 'starting guess';
    const save = el('button', 'btn btn--primary', 'Create marking shadow');
    save.type = 'button';
    const cancel = el('button', 'btn btn--ghost', 'Cancel');
    cancel.type = 'button';
    const actions = el('div', 'tl-composer__actions');
    actions.append(cancel, save);
    composer.append(actions);
    cancel.addEventListener('click', () => {
      composer.hidden = true;
    });
    save.addEventListener('click', () => {
      const scriptsCount = Number(scripts.value);
      const minutes = rate.value.trim() ? Number(rate.value) : null;
      if (!classLabel.value.trim() || !Number.isInteger(scriptsCount) || scriptsCount < 1 || !collected.value || !returnBy.value) {
        announce('A marking shadow needs a class, a script count, and both dates');
        return;
      }
      void createShadow({
        classLabel: classLabel.value.trim(),
        scripts: scriptsCount,
        collected: collected.value,
        returnBy: returnBy.value,
        rate: minutes && minutes > 0 ? minutes : null,
        source
      });
    });
  }

  async function createShadow(input: {
    classLabel: string;
    scripts: number;
    collected: string;
    returnBy: string;
    rate: number | null;
    source: Task | null;
  }): Promise<void> {
    const marking = {
      class_label: input.classLabel,
      scripts: input.scripts,
      minutes_per_script: input.rate,
      collected_on: input.collected,
      return_by: input.returnBy,
      scripts_marked: 0
    };
    const created = await tasksApi.createTask({
      title: `${input.classLabel} marking`,
      domain: input.source?.domain ?? 'teaching',
      kind: 'marking_shadow',
      marking,
      depends_on: input.source ? [input.source.id] : [],
      dependency_links: input.source ? [{ from_id: input.source.id, type: 'FS' as const, offset_days: 0 }] : []
    });
    tasks.push(created);
    const row = toModel([created], projects, goals, colours, { project: null, goal: null }).tasks[0];
    if (row) state.tasks.push(row);
    composer.hidden = true;
    notifyTasksChanged([created]);
    relayout('settle');
    announce(`Created marking shadow ${created.title}`);
  }

  function openLog(task: Task): void {
    if (!task.marking) return;
    composer.replaceChildren();
    composer.hidden = false;
    composer.append(el('p', 'tl-composer__title', `Log marking · ${task.marking.class_label}`));
    const scripts = inputRow('Scripts marked', 'number', '10');
    const minutes = inputRow('Minutes', 'number', String(Math.round((task.marking.minutes_per_script ?? prefs.marking_default_minutes_per_script) * 10)));
    const save = el('button', 'btn btn--primary', 'Log marking');
    save.type = 'button';
    const cancel = el('button', 'btn btn--ghost', 'Cancel');
    cancel.type = 'button';
    const actions = el('div', 'tl-composer__actions');
    actions.append(cancel, save);
    composer.append(actions);
    cancel.addEventListener('click', () => {
      composer.hidden = true;
    });
    save.addEventListener('click', () => {
      const count = Number(scripts.value);
      const spent = Number(minutes.value);
      if (!Number.isInteger(count) || count < 1 || !(spent > 0)) {
        announce('Log how many scripts you marked and how long it took');
        return;
      }
      void logMarking(task, count, spent);
    });
  }

  async function logMarking(task: Task, scripts: number, minutes: number): Promise<void> {
    if (!task.marking) return;
    const now = new Date().toISOString();
    await tasksApi.createWorkSession({
      task_id: task.id,
      started_at: now,
      finished_at: now,
      actual_duration_minutes: minutes,
      result: 'done',
      source: 'manual',
      scripts_marked: scripts
    });
    const marking = bumpScriptsMarked(task.marking, scripts);
    const saved = await tasksApi.updateTask(task.id, { marking });
    const index = tasks.findIndex((item) => item.id === task.id);
    if (index >= 0) tasks[index] = saved;
    syncTask(saved);
    composer.hidden = true;
    notifyTasksChanged([saved]);
    relayout('settle');
    announce(`Logged ${scripts} scripts on ${saved.marking?.class_label ?? task.title}`);
  }

  const abort = new AbortController();
  scroller.addEventListener('scroll', onScroll, { passive: true, signal: abort.signal });
  svg.addEventListener('pointerdown', onPointerDown, { signal: abort.signal });
  svg.addEventListener('pointermove', onPointerMove, { signal: abort.signal });
  svg.addEventListener('pointerup', onPointerUp, { signal: abort.signal });
  svg.addEventListener('pointercancel', onPointerUp, { signal: abort.signal });
  svg.addEventListener('click', (event) => {
    const mark = (event.target as Element).closest('[data-part="bar"], [data-part="milestone"], [data-part="shadow"]');
    const id = mark?.getAttribute('data-task-id') ?? mark?.getAttribute('data-milestone-id') ?? null;
    select(id);
    const task = id ? tasks.find((item) => item.id === id && item.marking) : undefined;
    if (task?.marking) openLog(task);
  }, { signal: abort.signal });
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select')) return;
    if (event.key === 'Escape' && (state.drag || state.preview)) {
      event.preventDefault();
      cancelDrag();
      return;
    }
    if (event.key === '+' || event.key === '=') setZoom(state.zoom + 1);
    else if (event.key === '-' || event.key === '_') setZoom(state.zoom - 1);
    else if (event.key.toLowerCase() === 'l') setView(state.view === 'bars' ? 'lines' : 'bars');
    else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey) {
      const ids = rows.filter((row) => row.kind === 'task' || row.kind === 'step' || row.kind === 'milestone').map((row) => row.ref);
      if (!ids.length) return;
      event.preventDefault();
      const index = state.selected ? ids.indexOf(state.selected) : -1;
      const next = ids[(index + (event.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length] ?? null;
      select(next);
      if (next) announce(rows.find((row) => row.ref === next)?.label ?? next);
    }
    else if (event.key === ' ' && state.selected) {
      event.preventDefault();
      const row = rows.find((item) => item.ref === state.selected);
      if (row) toggle(row.ref, row.kind);
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && state.selected && event.shiftKey) {
      event.preventDefault();
      shiftTask(state.selected, event.key === 'ArrowRight' ? 1 : -1);
    }
  }, { signal: abort.signal });
  scroller.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(state.zoom + (event.deltaY < 0 ? 1 : -1), event.clientX);
  }, { passive: false, signal: abort.signal });

  const stopChanged = onTasksChanged((incoming) => {
    let moved = false;
    for (const task of incoming) {
      const raw = tasks.find((item) => item.id === task.id);
      if (raw) Object.assign(raw, task);
      if (!state.tasks.some((item) => item.id === task.id)) continue;
      syncTask(task);
      moved = true;
    }
    if (moved) relayout('settle');
  });
  const stopDeleted = onTasksDeleted((ids) => {
    const drop = new Set(ids);
    state.tasks = state.tasks.filter((task) => !drop.has(task.id));
    model.tasks = state.tasks;
    relayout('settle');
  });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (response.ok && method === 'PATCH' && /\/api\/tasks\/[^/?#]+/.test(url)) {
        const body = await response.clone().json();
        if (body?.data?.id) notifyTasksChanged([body.data as Task]);
      }
    } catch {
      /* The timeline still has the previous task if the body is not JSON. */
    }
    return response;
  };

  paintZoom();
  paintView();
  relayout('first');
  scrollToToday(false);
  onScroll();
  requestAnimationFrame(() => {
    moveThumb(zoomPills);
    moveThumb(viewPills);
  });

  if (import.meta.env.DEV) {
    const timelineWindow = window as Window & {
      __timeline?: {
        engine: ReturnType<typeof createMotion>;
        state: typeof state;
        setZoom: typeof setZoom;
        setView: typeof setView;
        showHammond: typeof showHammond;
      };
    };
    timelineWindow.__timeline = { engine, state, setZoom, setView, showHammond };
  }

  teardown = () => {
    morph?.cancel();
    linesMount?.teardown();
    abort.abort();
    window.clearTimeout(zoomSettle);
    stopChanged();
    stopDeleted();
    window.fetch = originalFetch;
    if (import.meta.env.DEV) delete (window as Window & { __timeline?: unknown }).__timeline;
  };
}
