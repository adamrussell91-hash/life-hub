import '../../design-kit/tokens.css';
import '../../design-kit/overlays.css';
import '../../design-kit/chrome.css';
import '../../design-kit/actions.css';
import '../../design-kit/sign-in.css';
import '../../design-kit/motion.css';
import '../../design-kit/mobile.css';
import '../styles/travel.css';
import '../styles/journal.css';
import 'maplibre-gl/dist/maplibre-gl.css';

import { startHubMotion } from '../../design-kit/js/hub-motion.js';
import {
  fetchSession,
  isUnauthenticatedError,
  logout,
  messageForSignInFailure,
  renderSignIn
} from '@/auth/gate';
import { ApiClientError } from '@/api/client';
import { renderHubShell, renderPageHeader, renderPrimaryNav, type HubShellRefs, type RailHighlight } from '@/shell/shell';
import { journalPatternOff, parseRoute } from '@/app/router';
import { ensureJournal } from '@/api/journal';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import type { JournalFixture } from '@/journal/types';
import { renderJournal } from '@/journal/render-journal';
import { renderTripsList } from '@/views/trips-list';
import { renderTripPage } from '@/views/trip-page';
import { renderTodayView } from '@/views/today';
import { renderPublicTrip } from '@/views/public-trip';
import { listTrips } from '@/api/travel';
import { pickPrimaryTrip } from '@/lib/pick-trip';
import { registerServiceWorker, mountOfflineBanner } from '@/lib/offline';

function journalUseFixture(): boolean {
  return new URLSearchParams(location.search).get('fixture') === '1';
}

function publicToken(): string | null {
  const match = /\/travel\/t\/([^/]+)\/?$/.exec(location.pathname) ?? /^\/t\/([^/]+)\/?$/.exec(location.pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError || err instanceof Error) return err.message;
  return 'Travel could not load.';
}

/** In-app failure after a valid umbrella session — never the passphrase gate. */
function renderLoadFailure(container: HTMLElement, err: unknown, onRetry: () => void): void {
  container.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.setAttribute('role', 'alert');
  p.textContent = errorMessage(err);
  const retry = document.createElement('button');
  retry.className = 'btn btn--primary';
  retry.type = 'button';
  retry.textContent = 'Try again';
  retry.addEventListener('click', onRetry);
  wrap.append(p, retry);
  container.append(wrap);
}

function showSignIn(root: HTMLElement): void {
  renderSignIn(root, {
    onSuccess: () => {
      void bootApp(root);
    }
  });
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
  let journalHandle: { destroy(): void } | null = null;

  async function paint(): Promise<void> {
    const route = parseRoute();
    const generation = ++routeGeneration;

    if (route.name !== 'journal') {
      journalHandle?.destroy();
      journalHandle = null;
    }

    try {
      if (route.name === 'trips') {
        // Always show the list at #/ so New trip stays reachable with one holiday.
        // Bare /travel/ (empty hash) opens the primary trip in bootApp instead.
        renderHighlight('trips');
        // Title lives in the list canvas (same pattern as the trip page), not a second h1.
        renderPageHeader(shell, { eyebrow: 'Life Hub · Travel', title: '' });
        await renderTripsList(shell.canvas, { isCurrent: () => generation === routeGeneration });
        return;
      }

      if (route.name === 'today') {
        renderHighlight('today');
        renderPageHeader(shell, { eyebrow: 'Life Hub · Travel', title: 'Today' });
        await renderTodayView(shell.canvas, { isCurrent: () => generation === routeGeneration });
        return;
      }

      if (route.name === 'journal') {
        currentTripId = route.tripId;
        renderHighlight('trip');
        renderPageHeader(shell, { eyebrow: 'Life Hub · Travel', title: '' });
        journalHandle?.destroy();
        let fixture: JournalFixture;
        if (journalUseFixture()) {
          fixture = klIstanbulFixture();
        } else {
          const { journal } = await ensureJournal(route.tripId);
          fixture = journal;
        }
        journalHandle = renderJournal(shell.canvas, {
          fixture,
          momentId: route.momentId,
          patternOff: journalPatternOff()
        });
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
      }
    } catch (err) {
      if (generation !== routeGeneration) return;
      if (isUnauthenticatedError(err)) {
        showSignIn(root);
        return;
      }
      renderPageHeader(shell, { eyebrow: 'Life Hub · Travel', title: 'Travel' });
      renderLoadFailure(shell.canvas, err, () => void paint());
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

  // Empty hash (landing on /travel/) → primary trip when one exists. Explicit #/
  // is the Trips list (create another holiday). Never location.hash= here (V3).
  if (!location.hash || location.hash === '#') {
    try {
      const { trips } = await listTrips();
      const primary = pickPrimaryTrip(trips);
      history.replaceState(
        null,
        '',
        primary ? `#/trip/${encodeURIComponent(primary.id)}` : '#/'
      );
      if (primary) currentTripId = primary.id;
    } catch {
      history.replaceState(null, '', '#/');
    }
  }
  await paint();
}

/**
 * Umbrella SSO: Travel uses the same `life_hub_session` cookie as Life Hub
 * (`credentials: 'include'` → api.adam-russell.com). Passphrase gate only when
 * `/api/session` says unauthenticated. Trip/API failures stay in-app.
 */
async function boot(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  let session;
  try {
    session = await fetchSession();
  } catch (err) {
    if (isUnauthenticatedError(err)) {
      showSignIn(root);
      return;
    }
    renderLoadFailure(root, err, () => void boot(root));
    return;
  }

  if (!session.authenticated) {
    showSignIn(root);
    return;
  }

  try {
    await bootApp(root);
  } catch (err) {
    if (isUnauthenticatedError(err)) {
      renderSignIn(root, {
        initialError: messageForSignInFailure(err),
        onSuccess: () => {
          void bootApp(root);
        }
      });
      return;
    }
    renderLoadFailure(root, err, () => void boot(root));
  }
}

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  document.documentElement.dataset.hub = 'life';
  startHubMotion(document);
  registerServiceWorker();

  const token = publicToken();
  if (token) {
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.append(robots);
    }
    robots.setAttribute('content', 'noindex');
    void renderPublicTrip(app, token);
  } else {
    void boot(app);
  }
}
