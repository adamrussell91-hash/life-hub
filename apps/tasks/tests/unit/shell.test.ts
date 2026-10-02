import { describe, expect, it, vi } from 'vitest';
import {
  backlogHrefFromGraph,
  bindEditablePageTitle,
  canonicalizeGraphHash,
  graphReturnFromBacklog,
  graphViewFromHash,
  hashQuery,
  isSoftViewChange,
  parseHashRoute,
  railHighlightId,
  knownHubViews,
  renderHubShell,
  renderPageHeader,
  renderPrimaryNav,
  viewChrome,
  viewSurface
} from '../../src/shell/shell';

describe('hub shell chrome', () => {
  it('keeps a single uppercase rail brand and no labelled rail logout', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn() });

    const brand = refs.rail.querySelector('.hub-rail__brand');
    expect(brand?.textContent).toBe('Tasks Hub');
    expect(refs.rail.querySelector('.hub-rail__logout')).toBeNull();
    expect(refs.rail.textContent).not.toContain('Sign out');
  });

  it('places the refresh icon in page-header utilities and omits sign-out', () => {
    const root = document.createElement('div');
    const onRefresh = vi.fn();
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh });

    renderPageHeader(refs, {
      eyebrow: 'Tasks Hub',
      title: 'Dashboard',
      supporting: 'Today, projects, excursions — then your board grouped by status.'
    });

    const labels = [...refs.pageHeader.querySelectorAll('.hub-utilities .hub-icon-btn')].map(
      (btn) => btn.getAttribute('aria-label')
    );
    expect(labels).toEqual(['Refresh']);
    expect(refs.refreshButton?.querySelector('svg')).not.toBeNull();
    expect(refs.logoutButton).toBeNull();
    expect(refs.pageHeader.textContent).not.toContain('Sign out');
    expect(refs.pageHeader.querySelector('.page-header__actions .hub-utilities')).not.toBeNull();
    expect(refs.pageHeader.querySelector('.page-header__status')).not.toBeNull();
    expect(refs.pageHeader.querySelector('.page-header__copy')?.nextElementSibling?.className).toBe(
      'page-header__status'
    );

    refs.refreshButton?.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps utilities last after re-rendering header actions', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    const extra = document.createElement('button');
    extra.type = 'button';
    extra.className = 'btn btn--secondary';
    extra.textContent = 'Secondary';

    renderPageHeader(refs, {
      eyebrow: 'Home',
      title: 'Dashboard',
      actions: extra
    });

    const actions = [...refs.headerActions.children].map((el) => el.className);
    expect(actions[0]).toContain('btn');
    expect(actions.at(-1)).toBe('hub-utilities');
    expect(refs.pageHeader.querySelector('.hub-mark')).toBeNull();
    expect(refs.pageHeader.querySelector('[aria-label="Sign out"]')).toBeNull();
  });

  it('strips leftover title-row chrome on re-render', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    renderPageHeader(refs, { eyebrow: 'Home', title: 'Dashboard' });

    const leftover = document.createElement('img');
    leftover.className = 'hub-mark';
    leftover.src = '/icons/tasks.svg';
    leftover.alt = '';
    const count = document.createElement('span');
    count.className = 'backlog-count';
    count.textContent = '6';
    const row = refs.pageHeader.querySelector('.page-header__title-row');
    row?.prepend(leftover);
    row?.append(count);
    expect(refs.pageHeader.querySelector('.hub-mark')).not.toBeNull();
    expect(refs.pageHeader.querySelector('.backlog-count')?.textContent).toBe('6');

    renderPageHeader(refs, { eyebrow: 'Views', title: 'Today' });
    expect(refs.pageHeader.querySelector('.hub-mark')).toBeNull();
    expect(refs.pageHeader.querySelector('.backlog-count')).toBeNull();
    expect(refs.pageHeader.querySelector('.page-header__title')?.textContent).toBe('Today');
    expect(row?.children).toHaveLength(1);
  });

  it('never puts a hub tile or count beside any view title', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    for (const view of knownHubViews()) {
      renderPageHeader(refs, viewChrome(view));
      expect(refs.pageHeader.querySelector('.hub-mark'), view).toBeNull();
      expect(refs.pageHeader.querySelector('.backlog-count'), view).toBeNull();
      expect(refs.pageHeader.querySelector('img'), view).toBeNull();
      expect(refs.pageHeader.querySelector('.page-header__title-row')?.children).toHaveLength(1);
    }
  });

  it('renders sectioned rail links with a distinct icon per destination', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    renderPrimaryNav(refs.railNav, 'board');

    const majors = [
      ...refs.railNav.querySelectorAll('.hub-rail__list--desktop .hub-rail__majors .hub-rail__link')
    ].map((el) => el.textContent);
    expect(majors).toEqual(['Dashboard', 'Chat']);

    const sections = [
      ...refs.railNav.querySelectorAll('.hub-rail__list--desktop .hub-rail__section')
    ].map((el) => el.querySelector('span')?.textContent);
    expect(sections).toEqual(['Views', 'Plan', 'Work', 'Tools']);

    const links = [...refs.railNav.querySelectorAll('.hub-rail__list--desktop .hub-rail__link')];
    expect(links.some((link) => link.textContent === 'Orbit')).toBe(false);
    expect(links.some((link) => link.textContent === 'Dashboard')).toBe(true);
    expect(links.some((link) => link.textContent === 'Programs')).toBe(true);
    expect(links.some((link) => link.textContent === 'Chat')).toBe(true);
    expect(links.some((link) => link.textContent === 'Clare')).toBe(false);

    const signatures = links.map((link) =>
      [...link.querySelectorAll('path')].map((path) => path.getAttribute('d') ?? '').join('|')
    );
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(signatures.length).toBeGreaterThan(8);
  });

  it('highlights Graph for Orbit, Universe, and Branch', () => {
    expect(railHighlightId('orbit')).toBe('graph');
    expect(railHighlightId('universe')).toBe('graph');
    expect(railHighlightId('branch')).toBe('graph');
    expect(railHighlightId('graph')).toBe('graph');
    expect(railHighlightId('board')).toBe('board');
  });

  it('focuses the canvas on skip-link click without changing the hash to a route', () => {
    const root = document.createElement('div');
    document.body.append(root);
    renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    window.location.hash = '#/board';
    const skip = root.querySelector<HTMLAnchorElement>('.skip-link');
    const main = root.querySelector<HTMLElement>('#hub-main');
    expect(skip?.getAttribute('href')).toBe('#hub-main');
    expect(main?.getAttribute('tabindex')).toBe('-1');

    skip?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(window.location.hash).toBe('#/board');
    expect(document.activeElement).toBe(main);
    root.remove();
  });
});

describe('viewChrome', () => {
  it('uses the rail group then the tab name', () => {
    expect(viewChrome('day')).toEqual({ eyebrow: 'Tasks Hub', title: 'Today' });
    expect(viewChrome('week')).toEqual({ eyebrow: 'Tasks Hub', title: 'Week' });
    expect(viewChrome('term')).toEqual({ eyebrow: 'Tasks Hub', title: 'Term' });
    expect(viewChrome('year')).toEqual({ eyebrow: 'Tasks Hub', title: 'Year' });
    expect(viewChrome('almanac')).toEqual({ eyebrow: 'Tasks Hub', title: 'Almanac' });
    expect(viewChrome('list')).toEqual({ eyebrow: 'Tasks Hub', title: 'Backlog' });
    expect(viewChrome('excursions')).toEqual({ eyebrow: 'Tasks Hub', title: 'Excursions' });
    expect(viewChrome('maps')).toEqual({ eyebrow: 'Tasks Hub', title: 'Maps' });
    expect(viewChrome('orbit')).toEqual({ eyebrow: 'Tasks Hub', title: 'Orbit' });
    expect(viewChrome('board')).toEqual({ eyebrow: 'Tasks Hub', title: 'Dashboard' });
    expect(viewChrome('clare')).toEqual({ eyebrow: 'Tasks Hub', title: 'Chat' });
  });
});

describe('graph ↔ backlog return', () => {
  it('encodes and restores Graph view on Backlog links', () => {
    expect(backlogHrefFromGraph('#/graph')).toBe('#/list?from=graph');
    expect(backlogHrefFromGraph('#/graph?view=orbit')).toBe('#/list?from=graph&graphView=orbit');
    expect(graphReturnFromBacklog('#/list?from=graph')).toBe('#/graph');
    expect(graphReturnFromBacklog('#/list?from=graph&graphView=branch')).toBe('#/graph?view=branch');
    expect(graphReturnFromBacklog('#/list')).toBeNull();
  });

  it('renders a kit page-header back link when provided', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    renderPageHeader(refs, {
      eyebrow: 'Views',
      title: 'Backlog',
      back: { href: '#/graph', label: '← Graph' }
    });
    const back = refs.pageHeader.querySelector<HTMLAnchorElement>('.page-header__back');
    expect(back?.textContent).toBe('← Graph');
    expect(back?.getAttribute('href')).toBe('#/graph');
    renderPageHeader(refs, { eyebrow: 'Views', title: 'Backlog', back: null });
    expect(refs.pageHeader.querySelector('.page-header__back')).toBeNull();
  });
});

describe('parseHashRoute', () => {
  it('keeps Maps on Maps instead of falling back to Board', () => {
    location.hash = '#/maps';
    expect(parseHashRoute()).toBe('maps');
  });

  it('falls back to Board for unknown hashes', () => {
    location.hash = '#/nope';
    expect(parseHashRoute()).toBe('board');
  });
});

describe('view surfaces', () => {
  it('keeps day/week/term/year/almanac on one kit-calendar surface', () => {
    expect(viewSurface('day')).toBe('kit-calendar');
    expect(viewSurface('week')).toBe('kit-calendar');
    expect(viewSurface('month')).toBe('kit-calendar');
    expect(viewSurface('term')).toBe('kit-calendar');
    expect(viewSurface('year')).toBe('kit-calendar');
    expect(viewSurface('almanac')).toBe('kit-calendar');
    expect(isSoftViewChange('week', 'term')).toBe(true);
    expect(isSoftViewChange('day', 'week')).toBe(true);
    expect(isSoftViewChange('graph', 'graph')).toBe(true);
    expect(isSoftViewChange('week', 'board')).toBe(false);
    expect(isSoftViewChange(null, 'week')).toBe(false);
  });

  it('updates rail highlight and header copy without remounting chrome', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    renderPrimaryNav(refs.railNav, 'term');
    renderPageHeader(refs, { eyebrow: 'Views', title: 'Term' });

    const nav = refs.railNav.querySelector('.hub-rail__list');
    const title = refs.pageHeader.querySelector('.page-header__title');
    const refresh = refs.refreshButton;
    expect(refs.railNav.querySelector('[aria-current="page"]')?.textContent).toBe('Term');

    renderPrimaryNav(refs.railNav, 'week');
    renderPageHeader(refs, { eyebrow: 'Views', title: 'Week' });

    expect(refs.railNav.querySelector('.hub-rail__list')).toBe(nav);
    expect(refs.pageHeader.querySelector('.page-header__title')).toBe(title);
    expect(refs.refreshButton).toBe(refresh);
    expect(title?.textContent).toBe('Week');
    expect(refs.railNav.querySelector('[aria-current="page"]')?.textContent).toBe('Week');
  });

  it('restores a heading when leaving an editable task title', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    renderPageHeader(refs, { eyebrow: 'Dashboard', title: 'Plan Year 5/6 Pathfinders STEAM extension course' });
    bindEditablePageTitle(refs.pageHeader, 'Plan Year 5/6 Pathfinders STEAM extension course', {
      onCommit: vi.fn(),
      current: () => 'Plan Year 5/6 Pathfinders STEAM extension course'
    });

    expect(refs.pageHeader.querySelector('textarea.page-header__title-input')).not.toBeNull();

    renderPageHeader(refs, { eyebrow: 'Home', title: 'Dashboard' });

    const title = refs.pageHeader.querySelector('.page-header__title');
    expect(title?.tagName).toBe('H1');
    expect(title?.textContent).toBe('Dashboard');
    expect(refs.pageHeader.querySelector('.page-header__title-input')).toBeNull();
  });
});

describe('graph hash', () => {
  it('reads Lines by default and Branch / Orbit from query or old routes', () => {
    expect(graphViewFromHash('#/graph')).toBe('lines');
    expect(graphViewFromHash('#/graph?view=branch')).toBe('branch');
    expect(graphViewFromHash('#/graph?view=orbit')).toBe('orbit');
    expect(graphViewFromHash('#/orbit')).toBe('orbit');
    expect(graphViewFromHash('#/branch')).toBe('branch');
  });

  it('canonicalises old Graph family hashes', () => {
    expect(canonicalizeGraphHash('#/orbit')).toBe('#/graph?view=orbit');
    expect(canonicalizeGraphHash('#/branch')).toBe('#/graph?view=branch');
    expect(canonicalizeGraphHash('#/universe')).toBe('#/graph');
    expect(canonicalizeGraphHash('#/graph?mode=workstreams')).toBe('#/graph');
    expect(canonicalizeGraphHash('#/graph?mode=blockers')).toBe('#/graph?view=branch');
    expect(canonicalizeGraphHash('#/graph')).toBeNull();
    expect(canonicalizeGraphHash('#/graph?view=orbit')).toBeNull();
  });
});

describe('hashQuery', () => {
  it('reads query params from a view hash', () => {
    window.location.hash = '#/excursions?template=ext_ethics_olympiad';
    expect(hashQuery().get('template')).toBe('ext_ethics_olympiad');
    window.location.hash = '#/graph?view=orbit';
    expect(hashQuery().get('view')).toBe('orbit');
  });
});
