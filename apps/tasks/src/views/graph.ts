import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { loadTaskProperties } from '@/services/task-properties';
import { canonicalizeGraphHash, graphViewFromHash, hashQuery, type GraphPageView } from '@/shell/shell';
import { setFocus } from '@/domain/focus';
import { addDays, toDateKey } from '@/domain/queries';
import {
  buildGraphInsights,
  insightFingerprint,
  rankInsights,
  type GraphInsight,
  type InsightDismissal
} from '@/domain/graph-insights';
import { parseHubPrefs } from '@/domain/hub-prefs';
import { showConfirmWrite, showViewLoading } from '@/views/feedback';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { createHubFilter, createHubPills, createHubSearch, createHubToolbar, domainFilterOptions, el } from '@/views/hub-kit';
import { createVizNodeList } from '@/views/viz-node-list';
import { renderGraphDrawer } from '@/views/graph-drawer';
import { mountLinesView, type LinesMount } from '@/views/graph-lines';
import { mountBranchView, type BranchMount } from '@/views/graph-branch';
import { mountOrbitView, type OrbitMount } from '@/views/graph-orbit';

type LiveGraph = {
  canvas: HTMLElement;
  teardown: () => void;
};

let liveGraph: LiveGraph | null = null;
let selectedId: string | null = null;
let insightsOpen = false;
let listMode = false;
let lookAhead = 0;
let orbitPaused = false;
let hideDone = false;
let scaleLines = false;
let focusedProjectId: string | null = null;
let hubFilter = 'all';
let projectFilter = 'all';
let searchQuery = '';

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function setGraphView(view: GraphPageView): void {
  const query = hashQuery();
  if (view === 'lines') query.delete('view');
  else query.set('view', view);
  const qs = query.toString();
  const next = qs ? `#/graph?${qs}` : '#/graph';
  if (location.hash !== next) location.hash = next;
}

async function loadDismissals(): Promise<InsightDismissal[]> {
  try {
    const prefs = parseHubPrefs(await tasksApi.getHubPrefs());
    return prefs.dismissed_insight_ids;
  } catch {
    return [];
  }
}

export async function renderGraphView(canvas: HTMLElement): Promise<void> {
  const redirect = canonicalizeGraphHash();
  if (redirect && redirect !== location.hash) {
    history.replaceState(null, '', redirect);
  }

  liveGraph?.teardown();
  showViewLoading(canvas, 'Loading graph…', '.graph-page');
  await loadTaskProperties(true);
  const [tasks, projects, dismissals] = await Promise.all([
    tasksApi.listTasks(),
    tasksApi.listProjects(),
    loadDismissals()
  ]);

  let workingTasks = tasks;
  let workingProjects = projects;
  let dismissed = dismissals;
  let insights = rankInsights(buildGraphInsights(workingTasks, workingProjects, new Date(), dismissed));
  let view = graphViewFromHash();
  let mount: (LinesMount | BranchMount | OrbitMount) | null = null;
  let mountedView: GraphPageView | null = null;

  const page = el('div', 'graph-page');
  const pills = () =>
    createHubPills({
      label: 'Graph view',
      items: [
        { id: 'lines', label: 'Lines' },
        { id: 'branch', label: 'Branch' },
        { id: 'orbit', label: 'Orbit' }
      ],
      value: view,
      onSelect: (id) => {
        view = id;
        setGraphView(id);
        void paintView();
      }
    });

  const toolbar = createHubToolbar('graph-toolbar');
  const search = createHubSearch({
    placeholder: 'Search graph…',
    ariaLabel: 'Search graph',
    onInput: (value) => {
      searchQuery = value;
      void paintView();
    }
  });
  const insightsBtn = el('button', 'btn btn--ghost', 'Insights');
  insightsBtn.type = 'button';
  insightsBtn.setAttribute('aria-pressed', insightsOpen ? 'true' : 'false');
  const listBtn = el('button', 'btn btn--ghost', 'List');
  listBtn.type = 'button';
  listBtn.setAttribute('aria-pressed', listMode ? 'true' : 'false');
  const matchCount = el('p', 'graph-toolbar__meta', '');
  const confirmHost = el('div', 'graph-confirm');
  const stage = el('div', 'graph-stage');
  const drawer = el('aside', 'graph-drawer glass-panel');
  drawer.hidden = true;
  const insightDrawer = el('aside', 'graph-insights glass-panel');
  const live = el('p', 'visually-hidden');
  live.setAttribute('aria-live', 'polite');

  function scopedTasks(): Task[] {
    return workingTasks.filter((task) => {
      if (hubFilter !== 'all' && task.domain !== hubFilter) return false;
      if (projectFilter !== 'all' && task.parent_project_id !== projectFilter) return false;
      return true;
    });
  }

  function paintChrome(): void {
    const filters = createCollapsibleFilters({
      id: 'graph',
      ariaLabel: 'Filters',
      className: 'hub-filters--inline'
    });
    const hub = createHubFilter({
      key: 'hub',
      label: 'Hub',
      value: hubFilter,
      defaultValue: 'all',
      options: domainFilterOptions(true),
      onChange: (value) => {
        hubFilter = value;
        void paintView();
      }
    });
    const proj = createHubFilter({
      key: 'project',
      label: 'Project',
      value: projectFilter,
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'All projects' },
        ...workingProjects.map((p) => ({ value: p.id, label: p.title }))
      ],
      onChange: (value) => {
        projectFilter = value;
        void paintView();
      }
    });
    filters.panel.append(hub.el, proj.el, search.el, insightsBtn, listBtn, matchCount);
    toolbar.replaceChildren(pills(), filters.root);
  }

  function paintInsights(): void {
    insightDrawer.hidden = !insightsOpen;
    insightDrawer.replaceChildren(el('h2', 'graph-insights__title', 'Insights'));
    const rows = insights.filter((ins) => insightsOpen);
    if (!rows.length) {
      insightDrawer.append(el('p', 'hierarchy-meta', 'No insights right now.'));
      return;
    }
    for (const insight of rows) {
      const btn = el('button', `graph-insight graph-insight--${insight.severity}`, `${insight.headline}. ${insight.detail}`);
      btn.type = 'button';
      btn.addEventListener('click', () => reviewInsight(insight));
      insightDrawer.append(btn);
    }
  }

  function reviewInsight(insight: GraphInsight): void {
    if (insight.anchor.kind === 'task') {
      selectedId = insight.anchor.id;
      openDrawer();
    }
    if (!insight.proposal?.length && !insight.draft) return;
    const summary = insight.detail + (insight.draft ? ` Draft: ${insight.draft.subject ?? ''}` : '');
    showConfirmWrite(confirmHost, insight.headline, summary, async () => {
      if (insight.proposal?.length) {
        await tasksApi.applyAgentMutations(insight.proposal);
        live.textContent = `${insight.headline} applied.`;
      }
      if (insight.draft) {
        const mail = `mailto:${encodeURIComponent(insight.draft.to ?? '')}?subject=${encodeURIComponent(insight.draft.subject ?? '')}&body=${encodeURIComponent(insight.draft.body)}`;
        const copy = el('button', 'btn btn--secondary', 'Copy');
        copy.type = 'button';
        copy.addEventListener('click', () => void navigator.clipboard.writeText(insight.draft!.body));
        const open = el('a', 'btn btn--primary', 'Open in Mail');
        (open as HTMLAnchorElement).href = mail;
        confirmHost.append(copy, open);
      }
    });
  }

  async function dismissInsight(insight: GraphInsight): Promise<void> {
    dismissed = [...dismissed, { id: insight.id, fingerprint: insightFingerprint(insight) }];
    try {
      await tasksApi.updateHubPrefs({ dismissed_insight_ids: dismissed });
    } catch {
      /* mock or offline — keep in memory */
    }
    insights = rankInsights(buildGraphInsights(workingTasks, workingProjects, new Date(), dismissed));
    paintInsights();
  }

  function openDrawer(): void {
    const task = workingTasks.find((item) => item.id === selectedId) ?? null;
    renderGraphDrawer(drawer, task, workingTasks, workingProjects, {
      onComplete: (item) => void completeTask(item.id),
      onOpen: (item) => {
        location.hash = `#/task/${item.id}`;
      },
      onReschedule: (item) => {
        const next = prompt('New due date (YYYY-MM-DD)', item.due_date ?? '');
        if (next) void tasksApi.updateTask(item.id, { due_date: next });
      },
      onSnooze: (item) => {
        const due = item.due_date ? new Date(`${item.due_date}T12:00:00`) : new Date();
        void tasksApi.updateTask(item.id, { due_date: toDateKey(addDays(due, 1)) });
      },
      onAskClare: (item) => {
        setFocus({ type: 'task', id: item.id });
        location.hash = `#/clare?focus=task:${encodeURIComponent(item.id)}`;
      },
      onClose: () => {
        selectedId = null;
        drawer.hidden = true;
      }
    });
  }

  async function completeTask(id: string): Promise<void> {
    const task = await tasksApi.updateTask(id, { status: 'done', completed_at: new Date().toISOString() });
    workingTasks = workingTasks.map((item) => (item.id === task.id ? task : item));
    live.textContent = `${task.title} completed.`;
    void paintView();
  }

  function listNodes() {
    const scoped = scopedTasks();
    if (view === 'lines') {
      return workingProjects
        .filter((p) => scoped.some((t) => t.parent_project_id === p.id))
        .map((p) => ({ id: p.id, kind: 'project', label: `${p.title} · ${insights.find((i) => i.anchor.kind === 'project' && i.anchor.id === p.id)?.headline ?? 'line'}` }));
    }
    if (view === 'orbit') {
      return scoped
        .filter((t) => t.due_date)
        .map((t) => ({ id: t.id, kind: 'task', label: `${t.title} · ${t.due_date}` }));
    }
    return scoped.map((t) => ({
      id: t.id,
      kind: 'task',
      label: `${t.title} · blocked by ${(t.depends_on ?? []).length} · unlocks later`
    }));
  }

  async function paintView(): Promise<void> {
    view = graphViewFromHash();
    paintChrome();
    insights = rankInsights(buildGraphInsights(scopedTasks(), workingProjects, new Date(), dismissed));
    paintInsights();
    const q = searchQuery.trim().toLowerCase();
    const matches = scopedTasks().filter((t) => t.title.toLowerCase().includes(q));
    matchCount.textContent = q ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : '';
    if (listMode) {
      if (mount) {
        mount.teardown();
        mount = null;
        mountedView = null;
      }
      stage.replaceChildren();
      stage.append(
        createVizNodeList(
          `${view} list`,
          listNodes(),
          (node) => {
            if (node.kind === 'task') {
              selectedId = node.id;
              openDrawer();
            } else {
              focusedProjectId = node.id;
            }
          },
          { selectedId }
        )
      );
      return;
    }
    const common = {
      tasks: scopedTasks(),
      projects: workingProjects,
      now: new Date(),
      selectedId,
      search: searchQuery,
      insights,
      reducedMotion: prefersReducedMotion(),
      onSelect: (id: string) => {
        selectedId = id;
        openDrawer();
        void paintView();
      },
      onReviewInsight: (id: string) => {
        const insight = insights.find((row) => row.id === id);
        if (insight) reviewInsight(insight);
      },
      onDismissInsight: (id: string) => {
        const insight = insights.find((row) => row.id === id);
        if (insight) void dismissInsight(insight);
      }
    };
    const linesInput = {
      ...common,
      scale: scaleLines,
      focusedProjectId,
      onComplete: (id: string) => void completeTask(id),
      onFocusProject: (id: string | null) => {
        focusedProjectId = id;
        void paintView();
      },
      onAddStation: (projectId: string, stepOrder: number) => {
        const domain = workingProjects.find((p) => p.id === projectId)
          ? scopedTasks().find((t) => t.parent_project_id === projectId)?.domain ?? 'other'
          : 'other';
        void tasksApi.createTask({
          title: 'New station',
          domain,
          parent_project_id: projectId,
          step_order: stepOrder
        });
      },
      onReorder: (taskId: string, stepOrder: number) => {
        void tasksApi.updateTask(taskId, { step_order: stepOrder });
      },
      onToggleScale: () => {
        scaleLines = !scaleLines;
        void paintView();
      }
    };
    const branchInput = {
      ...common,
      hideDone,
      onLink: (fromId: string, toId: string) => {
        const target = workingTasks.find((t) => t.id === toId);
        if (!target) return;
        void tasksApi.updateTask(toId, { depends_on: [...(target.depends_on ?? []), fromId] });
      },
      onUnlink: (fromId: string, toId: string) => {
        const target = workingTasks.find((t) => t.id === toId);
        if (!target) return;
        void tasksApi.updateTask(toId, { depends_on: (target.depends_on ?? []).filter((id) => id !== fromId) });
      },
      onToggleHideDone: () => {
        hideDone = !hideDone;
        void paintView();
      },
      onWhatIf: () => undefined,
      onApplyWhatIf: () => undefined
    };
    const orbitInput = {
      ...common,
      lookAhead,
      paused: orbitPaused || prefersReducedMotion(),
      onPauseChange: (paused: boolean) => {
        orbitPaused = paused;
      },
      onLookAhead: (days: number) => {
        lookAhead = days;
        if (mount && 'setLookAhead' in mount) mount.setLookAhead(days);
      },
      onReschedule: (taskId: string, dateKey: string) => {
        showConfirmWrite(confirmHost, 'Move due date', `Set due date to ${dateKey}?`, async () => {
          await tasksApi.updateTask(taskId, { due_date: dateKey });
        });
      }
    };
    if (mount && mountedView === view) {
      if (view === 'lines' && 'update' in mount) mount.update(linesInput);
      else if (view === 'branch' && 'update' in mount) mount.update(branchInput);
      else if (view === 'orbit' && 'update' in mount) mount.update(orbitInput);
    } else {
      if (mount && !prefersReducedMotion()) {
        stage.classList.add('is-fading');
        await new Promise((resolve) => window.setTimeout(resolve, 160));
      }
      mount?.teardown();
      mount = null;
      stage.replaceChildren();
      stage.classList.remove('is-fading');
      if (view === 'lines') mount = mountLinesView(stage, linesInput);
      else if (view === 'branch') mount = mountBranchView(stage, branchInput);
      else mount = mountOrbitView(stage, orbitInput);
      mountedView = view;
    }
    if (selectedId) {
      openDrawer();
      mount?.focus(selectedId);
    }
  }

  insightsBtn.addEventListener('click', () => {
    insightsOpen = !insightsOpen;
    insightsBtn.setAttribute('aria-pressed', insightsOpen ? 'true' : 'false');
    paintInsights();
  });
  listBtn.addEventListener('click', () => {
    listMode = !listMode;
    listBtn.setAttribute('aria-pressed', listMode ? 'true' : 'false');
    void paintView();
  });

  const onKey = (event: KeyboardEvent) => {
    if (event.key === ' ' && view === 'orbit' && mount && 'setPaused' in mount) {
      event.preventDefault();
      mount.setPaused(!mount.isPaused());
    }
    if (event.key === 'Escape') {
      focusedProjectId = null;
      selectedId = null;
      drawer.hidden = true;
      void paintView();
    }
    if ((event.key === '[' || event.key === ']') && view === 'orbit') {
      lookAhead = Math.max(0, Math.min(30, lookAhead + (event.key === ']' ? 1 : -1)));
      if (mount && 'setLookAhead' in mount) mount.setLookAhead(lookAhead);
    }
  };
  document.addEventListener('keydown', onKey);

  const stopChanged = onTasksChanged((incoming) => {
    for (const task of incoming) {
      const idx = workingTasks.findIndex((item) => item.id === task.id);
      if (idx >= 0) workingTasks[idx] = task;
      else workingTasks.push(task);
    }
    void paintView();
  });
  const stopDeleted = onTasksDeleted((ids) => {
    workingTasks = workingTasks.filter((task) => !ids.includes(task.id));
    void paintView();
  });

  void tasksApi.graphInsights?.({
    view,
    findings: insights,
    tasks: scopedTasks().slice(0, 40),
    projects: workingProjects.slice(0, 20)
  }).then((enriched) => {
    if (Array.isArray(enriched?.insights) && enriched.insights.length) {
      insights = rankInsights(enriched.insights as GraphInsight[]);
      paintInsights();
    }
  }).catch(() => {
    matchCount.textContent = `${matchCount.textContent} Clare offline, showing basic insights`.trim();
  });

  page.append(toolbar, confirmHost, stage, drawer, insightDrawer, live);
  canvas.replaceChildren(page);
  paintChrome();
  await paintView();

  const teardown = () => {
    document.removeEventListener('keydown', onKey);
    stopChanged();
    stopDeleted();
    mount?.teardown();
    if (liveGraph?.teardown === teardown) liveGraph = null;
  };
  liveGraph = { canvas, teardown };
  void dismissInsight;
}

export function resetGraphSession(): void {
  liveGraph?.teardown();
  liveGraph = null;
  selectedId = null;
}
