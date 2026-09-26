import '../../design-kit/tokens.css';
import '../../design-kit/overlays.css';
import '../../design-kit/chrome.css';
import '../../design-kit/rail.css';
import '../../design-kit/filters.css';
import '../../design-kit/calendar.css';
import '../../design-kit/calendar-tideline.css';
import '../../design-kit/calendar-day-dial.css';
import '../../design-kit/calendar-almanac.css';
import '../../design-kit/calendar-term-river.css';
import '../../design-kit/sign-in.css';
import '../../design-kit/motion.css';
import '../../design-kit/view-on-map.css';
import '../../design-kit/entity-links.css';
import '../styles/hub.css';
import '../styles/views.css';
import '../styles/cards.css';
import '../styles/gantt.css';
import '../styles/timeline.css';
import '../styles/daily-dial.css';
import '../styles/lesson-engine.css';
import '../styles/graph.css';
import '../styles/backlog.css';
import '../styles/goals.css';
import 'katex/dist/katex.min.css';

import { startHubMotion } from '../../design-kit/js/hub-motion.js';
import { openHubCommandSearch } from '../../design-kit/js/hub-command-search.js';
import { fetchSession, logout, messageForSignInFailure, renderSignIn } from '@/auth/gate';
import {
  canonicalizeGanttHash,
  canonicalizeGraphHash,
  isKnownHashView,
  isSoftViewChange,
  viewSurface,
  parseEntityPage,
  parseGoalPage,
  parseHashRoute,
  parseMapItemPage,
  parseNewExcursionPage,
  parseSomedaySubPage,
  renderHubShell,
  renderPageHeader,
  renderPrimaryNav,
  viewChrome,
  type HubViewId
} from '@/shell/shell';
import { renderLoadError } from '@/views/feedback';
import { renderBoardView } from '@/views/board';
import { renderGraphView } from '@/views/graph';
import { renderMapsView } from '@/views/maps';
import { renderTimelineView } from '@/views/timeline';
import { renderClareView } from '@/views/clare';
import { installClareSession } from '@/chat/clare-session';
import { attachVisualViewportInset } from '@/chat/visual-viewport';
import { renderExcursionsView, renderNewExcursionPage } from '@/views/excursions';
import { renderSomedayWheelView } from '@/views/someday-wheel';
import { renderSomedayOdysseyView } from '@/views/someday-odyssey';
import { renderArchiveView } from '@/views/archive';
import { renderProgramsView } from '@/views/programs';
import {
  renderListView,
  renderSearchView,
  renderTemplatesView
} from '@/views/dashboard';
import { renderProjectsView } from '@/views/projects';
import { mountTasksCalendar, unmountTasksCalendar } from '@/views/hub-calendar';
import type { HubCalendarHandle } from '../../design-kit/js/calendar/mount-hub-calendar.js';
import { renderPageEditor } from '@/views/page-editor';
import { renderMapItemPage } from '@/views/map-page';
import { renderGoalsView } from '@/views/goals';
import { renderGoalPage } from '@/views/goal-page';
import { renderSomedayView } from '@/views/someday';
import { renderPropertiesView } from '@/views/properties';
import { renderTermDatesView } from '@/views/term-dates';
import { renderReminderStrip } from '@/views/reminder-strip';
import { loadTaskProperties } from '@/services/task-properties';
import { tasksApi } from '@/services/client-api';
import { mapsOrSeed } from '@/domain/maps';
import { getFocus, hydrateFocusFromHash, mergeFocusIntoHash } from '@/domain/focus';

let kitCalendarHandle: HubCalendarHandle | null = null;

function renderNotFound(canvas: HTMLElement, hash: string): void {
  canvas.replaceChildren();
  const lede = document.createElement('p');
  lede.className = 'view-lede';
  lede.textContent = `${hash || '#/'} is not a Tasks Hub page.`;
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'btn btn--primary';
  home.textContent = 'Back to Dashboard';
  home.addEventListener('click', () => {
    location.hash = '#/board';
  });
  canvas.append(lede, home);
}

async function renderActiveView(view: HubViewId, canvas: HTMLElement): Promise<void> {
  switch (view) {
    case 'board':
      return renderBoardView(canvas);
    case 'goals':
      return renderGoalsView(canvas);
    case 'someday':
      return renderSomedayView(canvas);
    case 'clare':
      return renderClareView(canvas);
    case 'graph':
      return renderGraphView(canvas);
    case 'maps':
      return renderMapsView(canvas);
    case 'gantt':
      return renderTimelineView(canvas);
    case 'timeline':
      return renderTimelineView(canvas);
    case 'orbit':
    case 'universe':
    case 'branch':
      return renderGraphView(canvas);
    case 'day':
    case 'week':
    case 'month':
    case 'term':
    case 'year':
    case 'almanac': {
      if (kitCalendarHandle) {
        void kitCalendarHandle.syncZoom();
        return;
      }
      canvas.replaceChildren();
      const host = document.createElement('div');
      host.className = 'tasks-calendar-host';
      host.style.minWidth = '0';
      canvas.append(host);
      kitCalendarHandle = mountTasksCalendar(host);
      return;
    }
    case 'list':
      return renderListView(canvas);
    case 'search':
      return renderSearchView(canvas);
    case 'templates':
      return renderTemplatesView(canvas);
    case 'projects':
      return renderProjectsView(canvas);
    case 'excursions':
      return renderExcursionsView(canvas);
    case 'archive':
      return renderArchiveView(canvas);
    case 'programs':
      return renderProgramsView(canvas);
    case 'properties':
      return renderPropertiesView(canvas);
    case 'term-dates':
      return renderTermDatesView(canvas);
  }
}


async function bootApp(root: HTMLElement): Promise<void> {
  const shell = renderHubShell(root, {
    onLogout: async () => {
      await logout();
      await boot(root);
    },
    onRefresh: () => void paint({ force: true })
  });
  const clare = installClareSession(root);
  // #region agent log
  const agentLog = (payload: Record<string, unknown>) => {
    try {
      void fetch('/api/_agent-debug', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      /* ignore */
    }
  };
  agentLog({
    hypothesisId: 'H4',
    location: 'main.ts:bootApp',
    message: 'clare.start invoking',
    data: { hash: location.hash }
  });
  // Keep rejection unhandled so pageerror still surfaces; only observe.
  void clare
    .start()
    .then(() =>
      agentLog({
        hypothesisId: 'H4',
        location: 'main.ts:bootApp',
        message: 'clare.start resolved',
        data: {}
      })
    )
    .catch((err: unknown) => {
      agentLog({
        hypothesisId: 'H4',
        location: 'main.ts:bootApp',
        message: 'clare.start rejected (rethrow)',
        data: { error: err instanceof Error ? err.message : String(err) }
      });
      queueMicrotask(() => {
        throw err instanceof Error ? err : new Error(String(err));
      });
    });
  // #endregion
  attachVisualViewportInset();
  await loadTaskProperties();

  let lastView: HubViewId | null = null;

  function resetPaint(): void {
    lastView = null;
  }

  async function paint(opts?: { force?: boolean }) {
    const redirected = canonicalizeGraphHash() ?? canonicalizeGanttHash();
    if (redirected && redirected !== location.hash) {
      history.replaceState(null, '', redirected);
    }
    const nextView = isKnownHashView() && !parseEntityPage() && !parseGoalPage() && !parseMapItemPage() && !parseNewExcursionPage() && !parseSomedaySubPage()
      ? parseHashRoute()
      : null;
    const soft = !opts?.force && nextView !== null && isSoftViewChange(lastView, nextView);

    if (!soft) {
      window.scrollTo(0, 0);
      document.body.classList.remove('is-universe-fullscreen');
      const canvasWrap = shell.canvas.closest('.hub-canvas');
      if (canvasWrap instanceof HTMLElement) canvasWrap.scrollTop = 0;
      shell.canvas.scrollTop = 0;
      clare.park();
      // Leaving the kit calendar surface tears the mount down.
      if (nextView == null || viewSurface(nextView) !== 'kit-calendar') {
        unmountTasksCalendar();
        kitCalendarHandle = null;
      }
    }

    const mapItem = parseMapItemPage();
    if (mapItem) {
      resetPaint();
      const listed = await tasksApi.listMaps().catch(() => []);
      const map = mapsOrSeed(listed).find((entry) => entry.id === mapItem.mapId);
      const named =
        mapItem.kind === 'station'
          ? map?.stations.find((entry) => entry.id === mapItem.id)
          : map?.ticks.find((entry) => entry.id === mapItem.id);
      renderPrimaryNav(shell.railNav, 'maps');
      renderPageHeader(shell, {
        eyebrow: 'Maps',
        title: named?.label ?? 'Page'
      });
      try {
        await renderMapItemPage(shell.canvas, mapItem);
      } catch (err) {
        renderLoadError(shell.canvas, err, () => void paint({ force: true }), 'Could not open card');
      }
      return;
    }
    const goalPage = parseGoalPage();
    if (goalPage) {
      resetPaint();
      renderPrimaryNav(shell.railNav, 'goals');
      const goal = await tasksApi.getGoal(goalPage.id).catch(() => null);
      renderPageHeader(shell, { eyebrow: 'Goals', title: goal?.title ?? 'Goal' });
      try {
        await renderGoalPage(shell.canvas, goalPage.id, undefined, undefined, { header: shell.pageHeader });
      } catch (err) {
        renderLoadError(shell.canvas, err, () => void paint({ force: true }), 'Could not open goal');
      }
      return;
    }
    const entity = parseEntityPage();
    if (entity) {
      resetPaint();
      let rail: HubViewId = entity.kind === 'project' ? 'projects' : 'board';
      let eyebrow = entity.kind === 'task' ? 'Dashboard' : 'Projects';
      let title = 'Page';
      if (entity.kind === 'task') {
        const task = await tasksApi.getTask(entity.id).catch(() => null);
        if (task) title = task.title;
      } else {
        const project = await tasksApi.getProject(entity.id).catch(() => null);
        if (project) {
          title = project.title;
          if (project.type === 'excursion') {
            rail = 'excursions';
            eyebrow = 'Excursions';
          }
        }
      }
      renderPrimaryNav(shell.railNav, rail);
      renderPageHeader(shell, { eyebrow, title });
      try {
        await renderPageEditor(shell.canvas, entity, { header: shell.pageHeader });
      } catch (err) {
        renderLoadError(shell.canvas, err, () => void paint({ force: true }), 'Could not open page');
      }
      return;
    }
    if (!isKnownHashView()) {
      resetPaint();
      renderPrimaryNav(shell.railNav, 'board');
      renderPageHeader(shell, {
        eyebrow: 'Missing',
        title: 'Page not found'
      });
      renderNotFound(shell.canvas, location.hash);
      return;
    }
    const somedaySub = parseSomedaySubPage();
    if (somedaySub) {
      resetPaint();
      renderPrimaryNav(shell.railNav, 'someday');
      renderPageHeader(shell, {
        eyebrow: 'Plan',
        title: somedaySub.kind === 'wheel' ? 'Life coverage' : 'Odyssey mode',
        supporting:
          somedaySub.kind === 'wheel'
            ? "Where your someday dreams cluster — and where they don't."
            : undefined
      });
      clare.sync('someday');
      try {
        await renderReminderStrip(shell.reminderHost, () => void paint({ force: true }));
        if (somedaySub.kind === 'wheel') {
          await renderSomedayWheelView(shell.canvas);
        } else {
          await renderSomedayOdysseyView(shell.canvas, somedaySub.taskId);
        }
      } catch (err) {
        renderLoadError(shell.canvas, err, () => void paint({ force: true }), 'Could not load Someday');
      }
      return;
    }
    if (parseNewExcursionPage()) {
      resetPaint();
      renderPrimaryNav(shell.railNav, 'excursions');
      renderPageHeader(shell, { eyebrow: 'Excursions', title: 'New' });
      clare.sync('excursions');
      try {
        await renderReminderStrip(shell.reminderHost, () => void paint({ force: true }));
        await renderNewExcursionPage(shell.canvas);
      } catch (err) {
        renderLoadError(shell.canvas, err, () => void paint({ force: true }), 'Could not load Excursion');
      }
      return;
    }
    const view = nextView ?? parseHashRoute();
    // #region agent log
    try {
      void fetch('/api/_agent-debug', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hypothesisId: 'H3',
          location: 'main.ts:paint',
          message: 'paint view',
          data: {
            hash: location.hash,
            view,
            soft,
            surface: viewSurface(view),
            kitHandle: Boolean(kitCalendarHandle)
          }
        })
      });
    } catch {
      /* ignore */
    }
    // #endregion
    const chrome = viewChrome(view);
    renderPrimaryNav(shell.railNav, view);
    renderPageHeader(shell, chrome);
    clare.sync(view);
    try {
      if (!soft) await renderReminderStrip(shell.reminderHost, () => void paint({ force: true }));
      hydrateFocusFromHash();
      // Sidebar links are bare `#/week` etc. — re-attach focus so multi-rep selection survives.
      mergeFocusIntoHash(getFocus());
      await renderActiveView(view, shell.canvas);
      lastView = view;
    } catch (err) {
      // #region agent log
      try {
        void fetch('/api/_agent-debug', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hypothesisId: 'H4',
            location: 'main.ts:paint-catch',
            message: 'paint failed',
            data: { error: err instanceof Error ? err.message : String(err), view }
          })
        });
      } catch {
        /* ignore */
      }
      // #endregion
      resetPaint();
      renderLoadError(shell.canvas, err, () => void paint({ force: true }), `Could not load ${chrome.title}`);
    }
  }

  window.addEventListener('hashchange', () => {
    void paint();
  });

  if (!location.hash || location.hash === '#/') location.hash = '#/board';
  await paint();
}

async function boot(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  try {
    const session = await fetchSession();
    if (!session.authenticated) {
      renderSignIn(root, {
        onSuccess: () => {
          void bootApp(root);
        }
      });
      return;
    }
    await bootApp(root);
  } catch (err) {
    renderSignIn(root, {
      initialError: messageForSignInFailure(err),
      onSuccess: () => {
        void bootApp(root);
      }
    });
  }
}

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  document.documentElement.dataset.hub = 'tasks';
  startHubMotion(document);
  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
    if ((event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return;
    event.preventDefault();
    openHubCommandSearch({
      placeholder: 'Jump in Tasks Hub',
      groups: [{
        heading: 'Go to',
        items: [
          { id: 'board', label: 'Board', onSelect: () => { location.hash = '#/board'; } },
          { id: 'today', label: 'Today', onSelect: () => { location.hash = '#/today'; } },
          { id: 'week', label: 'Week', onSelect: () => { location.hash = '#/week'; } },
          { id: 'backlog', label: 'Backlog', onSelect: () => { location.hash = '#/backlog'; } },
          { id: 'graph', label: 'Graph', onSelect: () => { location.hash = '#/graph'; } },
          { id: 'clare', label: 'Clare', onSelect: () => { location.hash = '#/clare'; } }
        ]
      }]
    });
  });
  void boot(app);
}
