import '../../design-kit/css/tokens.css';
import '../../design-kit/css/overlays.css';
import '../../design-kit/css/chrome.css';
import '../../design-kit/css/rail.css';
import '../../design-kit/css/filters.css';
import '../../design-kit/css/calendar.css';
import '../../design-kit/css/sign-in.css';
import '../styles/hub.css';
import '../styles/views.css';
import '../styles/cards.css';
import '../styles/gantt.css';
import '../styles/daily-dial.css';
import '../styles/lesson-engine.css';
import 'katex/dist/katex.min.css';

import { fetchSession, logout, messageForSignInFailure, renderSignIn } from '@/auth/gate';
import {
  isKnownHashView,
  isSoftViewChange,
  parseCapacityShareToken,
  parseEntityPage,
  parseHashRoute,
  parseMapItemPage,
  parseNewExcursionPage,
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
import { renderGanttView } from '@/views/gantt';
import { renderOrbitView } from '@/views/orbit';
import { renderUniverseView } from '@/views/universe';
import { renderBranchView } from '@/views/branch';
import { renderConstellationView } from '@/views/constellation';
import { renderClareView } from '@/views/clare';
import { installClareSession } from '@/chat/clare-session';
import { renderExcursionsView, renderNewExcursionPage } from '@/views/excursions';
import { renderProgramsView } from '@/views/programs';
import { renderStressView } from '@/views/stress';
import { renderCoreyView, renderPublicCapacityView } from '@/views/corey';
import {
  renderDayView,
  renderListView,
  renderSearchView,
  renderTemplatesView
} from '@/views/dashboard';
import { renderProjectsView } from '@/views/projects';
import { renderWeekView, renderMonthView } from '@/views/calendar';
import { renderPageEditor } from '@/views/page-editor';
import { renderMapItemPage } from '@/views/map-page';
import { renderGoalsView } from '@/views/goals';
import { renderSomedayView } from '@/views/someday';
import { renderPropertiesView } from '@/views/properties';
import { renderReminderStrip } from '@/views/reminder-strip';
import { loadTaskProperties } from '@/services/task-properties';
import { tasksApi } from '@/services/client-api';
import { mapsOrSeed } from '@/domain/maps';

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
      return renderGanttView(canvas);
    case 'orbit':
      return renderOrbitView(canvas);
    case 'universe':
      return renderUniverseView(canvas);
    case 'branch':
      return renderBranchView(canvas);
    case 'constellation':
      return renderConstellationView(canvas);
    case 'day':
      return renderDayView(canvas);
    case 'week':
      return renderWeekView(canvas);
    case 'month':
      return renderMonthView(canvas);
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
    case 'programs':
      return renderProgramsView(canvas);
    case 'stress':
      return renderStressView(canvas);
    case 'corey':
      return renderCoreyView(canvas);
    case 'properties':
      return renderPropertiesView(canvas);
  }
}

async function bootPublicCapacity(root: HTMLElement, token: string): Promise<void> {
  root.replaceChildren();
  const shell = renderHubShell(root, {});
  shell.logoutButton?.remove();
  renderPageHeader(shell, {
    eyebrow: 'Shared',
    title: 'Capacity'
  });
  await renderPublicCapacityView(shell.canvas, token);
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
  void clare.start();
  await loadTaskProperties();

  let lastView: HubViewId | null = null;

  function resetPaint(): void {
    lastView = null;
  }

  async function paint(opts?: { force?: boolean }) {
    const nextView = isKnownHashView() && !parseEntityPage() && !parseMapItemPage() && !parseNewExcursionPage()
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
    }

    const share = parseCapacityShareToken();
    if (share) {
      resetPaint();
      await bootPublicCapacity(root, share);
      return;
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
    const chrome = viewChrome(view);
    renderPrimaryNav(shell.railNav, view);
    renderPageHeader(shell, chrome);
    clare.sync(view);
    try {
      if (!soft) await renderReminderStrip(shell.reminderHost, () => void paint({ force: true }));
      await renderActiveView(view, shell.canvas);
      lastView = view;
    } catch (err) {
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
  const share = parseCapacityShareToken();
  if (share) {
    await bootPublicCapacity(root, share);
    window.addEventListener('hashchange', () => {
      void boot(root);
    });
    return;
  }

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
  void boot(app);
}
