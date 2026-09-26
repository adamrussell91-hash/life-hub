import '../../design-kit/tokens.css';
import '../../design-kit/overlays.css';
import '../../design-kit/chrome.css';
import '../../design-kit/sign-in.css';
import '../../design-kit/motion.css';
import '../../design-kit/entity-links.css';
import '../../design-kit/relationship-timeline.css';
import '../../design-kit/filters.css';
import '../../design-kit/person-brief.css';
import '../../design-kit/view-on-map.css';
import '../../design-kit/calendar.css';
import '../../design-kit/calendar-tideline.css';
import '../../design-kit/calendar-day-dial.css';
import '../../design-kit/calendar-almanac.css';
import '../../design-kit/calendar-term-river.css';
import '../styles/hub.css';

import { startHubMotion } from '../../design-kit/js/hub-motion.js';
import { fetchSession, logout, messageForSignInFailure, renderSignIn } from '@/auth/gate';
import { renderHubShell, renderPageHeader, renderPrimaryNav, viewChrome, type HubShellRefs } from '@/shell/shell';
import { parseRoute, railHighlightFor } from '@/app/router';
import {
  mountProfessionalCalendar,
  unmountProfessionalCalendar
} from '@/calendar/hub-calendar';
import type { HubCalendarHandle } from '../../design-kit/js/calendar/mount-hub-calendar.js';
import { renderPeoplePage } from '@/views/people';
import { renderHomeView } from '@/views/home';
import { renderOrganisationsView } from '@/views/organisations';
import { renderRelationshipsView } from '@/views/relationships';
import {
  renderCommunicationDetailView,
  renderCommunicationNewView,
  renderCommunicationsView
} from '@/views/communications';
import {
  renderMeetingDetailView,
  renderMeetingNewView,
  renderMeetingsView
} from '@/views/meetings';
import {
  renderEventDetailView,
  renderEventNewView,
  renderEventsView
} from '@/views/events';
import {
  renderApplicationDetailView,
  renderApplicationNewView,
  renderApplicationsView
} from '@/views/applications';
import { renderCareerView } from '@/views/career';
import { renderOrganisationPage } from '@/views/organisation-page';
import { renderNetworkEcologyView } from '@/views/network-ecology';
import { personRoute } from '@/app/router';

function renderNotFound(canvas: HTMLElement, hash: string): void {
  canvas.replaceChildren();
  const lede = document.createElement('p');
  lede.className = 'empty-state';
  lede.textContent = `${hash || '#/'} is not a Professional Hub page.`;
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'btn btn--primary';
  home.textContent = 'Back to Home';
  home.addEventListener('click', () => {
    location.hash = '#/home';
  });
  canvas.append(lede, home);
}

async function bootApp(root: HTMLElement): Promise<void> {
  const shell: HubShellRefs = renderHubShell(root, {
    onLogout: async () => {
      await logout();
      await boot(root);
    },
    onRefresh: () => void paint()
  });

  let routeGeneration = 0;
  let calendarHandle: HubCalendarHandle | null = null;

  async function paint(): Promise<void> {
    const route = parseRoute();

    // Soft zoom change: keep the kit mount so Term/Year tween in place.
    if (route.name === 'calendar' && calendarHandle) {
      renderPrimaryNav(shell.railNav, railHighlightFor(route));
      void calendarHandle.syncZoom();
      return;
    }

    const generation = ++routeGeneration;
    const highlight = railHighlightFor(route);
    renderPrimaryNav(shell.railNav, highlight);
    unmountProfessionalCalendar();
    calendarHandle = null;

    if (route.name === 'not-found') {
      renderPageHeader(shell, { eyebrow: 'Missing', title: 'Page not found' });
      renderNotFound(shell.canvas, location.hash);
      return;
    }

    if (route.name === 'home') {
      renderPageHeader(shell, viewChrome('home'));
      await renderHomeView(shell.canvas);
      return;
    }
    if (route.name === 'calendar') {
      renderPageHeader(shell, {
        eyebrow: 'Professional Hub',
        title: 'Calendar',
        supporting: 'Day · Week · Term · Year · Almanac'
      });
      shell.canvas.replaceChildren();
      const host = document.createElement('div');
      host.className = 'pro-calendar-host';
      host.style.minWidth = '0';
      shell.canvas.append(host);
      calendarHandle = mountProfessionalCalendar(host, { routeZoom: true });
      return;
    }
    if (route.name === 'people') {
      // One h1 lives in the People page canvas (P3 — no shell "People / People").
      shell.pageHeader.classList.add('page-header--people-redesign');
      renderPageHeader(shell, { eyebrow: 'Professional Hub', title: '' });
      await renderPeoplePage(shell.canvas, {
        selectedId: route.id,
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
    shell.pageHeader.classList.remove('page-header--people-redesign');
    if (route.name === 'organisations') {
      // Page owns its single Organisations h1 (People pattern).
      renderPageHeader(shell, { eyebrow: '', title: '' });
      await renderOrganisationsView(shell.canvas, {
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
    if (route.name === 'relationships') {
      renderPageHeader(shell, viewChrome('relationships'));
      renderRelationshipsView(shell.canvas);
      return;
    }
    if (route.name === 'communications') {
      renderPageHeader(shell, viewChrome('communications'));
      await renderCommunicationsView(shell.canvas);
      return;
    }
    if (route.name === 'communication-new') {
      renderPageHeader(shell, { eyebrow: 'Communications', title: 'Compose' });
      await renderCommunicationNewView(shell.canvas);
      return;
    }
    if (route.name === 'communication') {
      renderPageHeader(shell, { eyebrow: 'Communications', title: 'Loading…' });
      await renderCommunicationDetailView(shell.canvas, route.id, {
        onTitleReady: (title) => {
          if (generation !== routeGeneration) return;
          renderPageHeader(shell, { eyebrow: 'Communications', title });
        },
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
    if (route.name === 'meetings') {
      renderPageHeader(shell, viewChrome('meetings'));
      await renderMeetingsView(shell.canvas);
      return;
    }
    if (route.name === 'meeting-new') {
      renderPageHeader(shell, { eyebrow: 'Meetings', title: 'Schedule' });
      await renderMeetingNewView(shell.canvas);
      return;
    }
    if (route.name === 'meeting') {
      renderPageHeader(shell, { eyebrow: 'Meetings', title: 'Loading…' });
      await renderMeetingDetailView(shell.canvas, route.id, {
        onTitleReady: (title) => {
          if (generation !== routeGeneration) return;
          renderPageHeader(shell, { eyebrow: 'Meetings', title });
        },
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
    if (route.name === 'events') {
      renderPageHeader(shell, viewChrome('events'));
      await renderEventsView(shell.canvas);
      return;
    }
    if (route.name === 'event-new') {
      renderPageHeader(shell, {
        eyebrow: 'Events',
        title: 'Add event',
        supporting: 'A record for your hours, not a party invite. Type, date, people, and evidence on one page.'
      });
      await renderEventNewView(shell.canvas);
      return;
    }
    if (route.name === 'event') {
      renderPageHeader(shell, { eyebrow: 'Events', title: 'Loading…' });
      await renderEventDetailView(shell.canvas, route.id, {
        onTitleReady: (title) => {
          if (generation !== routeGeneration) return;
          renderPageHeader(shell, { eyebrow: 'Events', title });
        },
        onHeaderReady: (header) => {
          if (generation !== routeGeneration) return;
          renderPageHeader(shell, {
            eyebrow: 'Events',
            title: header.title,
            supporting: header.supporting,
            actions: header.actions
          });
        },
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
    if (route.name === 'applications') {
      renderPageHeader(shell, viewChrome('applications'));
      await renderApplicationsView(shell.canvas);
      return;
    }
    if (route.name === 'application-new') {
      renderPageHeader(shell, { eyebrow: 'Applications', title: 'New application' });
      await renderApplicationNewView(shell.canvas);
      return;
    }
    if (route.name === 'application') {
      renderPageHeader(shell, { eyebrow: 'Applications', title: 'Loading…' });
      await renderApplicationDetailView(shell.canvas, route.id, {
        onTitleReady: (title) => {
          if (generation !== routeGeneration) return;
          renderPageHeader(shell, { eyebrow: 'Applications', title });
        },
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
    if (route.name === 'career') {
      renderPageHeader(shell, viewChrome('career'));
      await renderCareerView(shell.canvas);
      return;
    }
    if (route.name === 'network-ecology') {
      renderPageHeader(shell, viewChrome('network-ecology'));
      await renderNetworkEcologyView(shell.canvas, {
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
    if (route.name === 'person' || route.name === 'person-brief') {
      // People redesign Phase 1: brief and legacy person routes redirect to `#/people/<id>`.
      location.replace(personRoute(route.id));
      return;
    }
    if (route.name === 'organisation') {
      // Detail page owns its org title h1.
      renderPageHeader(shell, { eyebrow: '', title: '' });
      await renderOrganisationPage(shell.canvas, route.id, {
        onTitleReady: () => {
          /* title rendered in-page */
        },
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
  }

  window.addEventListener('hashchange', () => {
    void paint();
  });

  if (!location.hash || location.hash === '#/') location.hash = '#/home';
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
  document.documentElement.dataset.hub = 'professional';
  startHubMotion(document);
  void boot(app);
}
