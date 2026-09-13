import '../../design-kit/tokens.css';
import '../../design-kit/overlays.css';
import '../../design-kit/chrome.css';
import '../../design-kit/sign-in.css';
import '../../design-kit/motion.css';
import '../styles/hub.css';

import { startHubMotion } from '../../design-kit/js/hub-motion.js';
import { fetchSession, logout, messageForSignInFailure, renderSignIn } from '@/auth/gate';
import { renderHubShell, renderPageHeader, renderPrimaryNav, viewChrome, type HubShellRefs } from '@/shell/shell';
import { parseRoute, railHighlightFor } from '@/app/router';
import { renderPeopleView } from '@/views/people';
import { renderOrganisationsView } from '@/views/organisations';
import { renderRelationshipsView } from '@/views/relationships';
import { renderCommunicationsView } from '@/views/communications';
import { renderPersonPage } from '@/views/person-page';
import { renderOrganisationPage } from '@/views/organisation-page';

function renderNotFound(canvas: HTMLElement, hash: string): void {
  canvas.replaceChildren();
  const lede = document.createElement('p');
  lede.className = 'empty-state';
  lede.textContent = `${hash || '#/'} is not a Professional Hub page.`;
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'btn btn--primary';
  home.textContent = 'Back to People';
  home.addEventListener('click', () => {
    location.hash = '#/people';
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

  async function paint(): Promise<void> {
    const route = parseRoute();
    const highlight = railHighlightFor(route);
    renderPrimaryNav(shell.railNav, highlight);

    if (route.name === 'not-found') {
      renderPageHeader(shell, { eyebrow: 'Missing', title: 'Page not found' });
      renderNotFound(shell.canvas, location.hash);
      return;
    }

    if (route.name === 'people') {
      renderPageHeader(shell, viewChrome('people'));
      renderPeopleView(shell.canvas);
      return;
    }
    if (route.name === 'organisations') {
      renderPageHeader(shell, viewChrome('organisations'));
      renderOrganisationsView(shell.canvas);
      return;
    }
    if (route.name === 'relationships') {
      renderPageHeader(shell, viewChrome('relationships'));
      renderRelationshipsView(shell.canvas);
      return;
    }
    if (route.name === 'communications') {
      renderPageHeader(shell, viewChrome('communications'));
      renderCommunicationsView(shell.canvas);
      return;
    }
    if (route.name === 'person') {
      renderPageHeader(shell, { eyebrow: 'People', title: 'Loading…' });
      await renderPersonPage(shell.canvas, route.id, {
        onTitleReady: (title) => renderPageHeader(shell, { eyebrow: 'People', title })
      });
      return;
    }
    if (route.name === 'organisation') {
      renderPageHeader(shell, { eyebrow: 'Organisations', title: 'Loading…' });
      await renderOrganisationPage(shell.canvas, route.id, {
        onTitleReady: (title) => renderPageHeader(shell, { eyebrow: 'Organisations', title })
      });
    }
  }

  window.addEventListener('hashchange', () => {
    void paint();
  });

  if (!location.hash || location.hash === '#/') location.hash = '#/people';
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
