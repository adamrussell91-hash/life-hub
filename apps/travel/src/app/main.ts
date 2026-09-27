import '../../design-kit/tokens.css';
import '../../design-kit/overlays.css';
import '../../design-kit/chrome.css';
import '../../design-kit/actions.css';
import '../../design-kit/sign-in.css';
import '../../design-kit/motion.css';
import '../../design-kit/mobile.css';
import '../styles/travel.css';
import 'maplibre-gl/dist/maplibre-gl.css';

import { startHubMotion } from '../../design-kit/js/hub-motion.js';
import { fetchSession, logout, messageForSignInFailure, renderSignIn } from '@/auth/gate';
import { renderHubShell, renderPageHeader, renderPrimaryNav, type HubShellRefs, type RailHighlight } from '@/shell/shell';
import { parseRoute } from '@/app/router';
import { renderTripsList } from '@/views/trips-list';
import { renderTripPage } from '@/views/trip-page';
import { renderTodayView } from '@/views/today';
import { renderPublicTrip } from '@/views/public-trip';
import { listTrips } from '@/api/travel';
import { registerServiceWorker, mountOfflineBanner } from '@/lib/offline';

function publicToken(): string | null {
  const match = /\/travel\/t\/([^/]+)\/?$/.exec(location.pathname) ?? /^\/t\/([^/]+)\/?$/.exec(location.pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

async function bootApp(root: HTMLElement): Promise<void> {
  const shell: HubShellRefs = renderHubShell(root, {
    onLogout: async () => {
      await logout();
      await boot(root);
    },
    onRefresh: () => void paint(),
    onAdd: () => {
      if (!location.hash.startsWith('#/trip/')) location.hash = '#/';
    }
  });
  mountOfflineBanner(root);

  let routeGeneration = 0;
  let currentTripId: string | null = null;

  async function paint(): Promise<void> {
    const route = parseRoute();
    const generation = ++routeGeneration;

    if (route.name === 'trips') {
      const { trips } = await listTrips();
      if (generation !== routeGeneration) return;
      if (trips.length === 1) {
        location.hash = `#/trip/${encodeURIComponent(trips[0]!.id)}`;
        return;
      }
      renderHighlight('trips');
      renderPageHeader(shell, { eyebrow: 'Life Hub · Travel', title: 'Trips' });
      await renderTripsList(shell.canvas, { isCurrent: () => generation === routeGeneration });
      return;
    }

    if (route.name === 'today') {
      renderHighlight('today');
      renderPageHeader(shell, { eyebrow: 'Life Hub · Travel', title: 'Today' });
      await renderTodayView(shell.canvas, { isCurrent: () => generation === routeGeneration });
      return;
    }

    if (route.name === 'trip') {
      currentTripId = route.tripId;
      renderHighlight('trip');
      renderPageHeader(shell, { eyebrow: 'Life Hub · Travel', title: '' });
      await renderTripPage(shell.canvas, route.tripId, {
        cityId: route.cityId,
        date: route.date,
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
  }

  function renderHighlight(highlight: RailHighlight): void {
    const tripHref = currentTripId ? `#/trip/${encodeURIComponent(currentTripId)}` : '#/';
    renderPrimaryNav(shell, highlight, {
      tripHref,
      onAdd: () => {
        if (currentTripId) location.hash = `#/trip/${encodeURIComponent(currentTripId)}`;
      }
    });
  }

  window.addEventListener('hashchange', () => {
    void paint();
  });

  if (!location.hash || location.hash === '#/') location.hash = '#/';
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
  document.documentElement.dataset.hub = 'life';
  startHubMotion(document);
  registerServiceWorker();

  const token = publicToken();
  if (token) {
    void renderPublicTrip(app, token);
  } else {
    void boot(app);
  }
}
