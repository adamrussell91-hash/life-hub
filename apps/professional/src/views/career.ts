import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { getCareer } from '@/api/career';
import {
  applicationRoute,
  careerApplicationNewRoute,
  careerCardRoute,
  careerFutureRoute,
  parseRoute
} from '@/app/router';
import { buildCareerModel } from '@/domain/career-model';
import type { CareerOverview } from '@/domain/types';
import { isValidApplicationId } from '@/domain/ids';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { mountCareerRiver } from '@/views/career-river';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function surface(node: HTMLElement): void {
  node.style.background = 'var(--glass)';
  node.style.border = '1px solid var(--line)';
  node.style.borderRadius = 'var(--radius-md)';
  node.style.boxShadow = 'var(--elev-1)';
}

function renderRiver(
  host: HTMLElement,
  model: ReturnType<typeof buildCareerModel>,
  selectedFutureId: string | null
): void {
  const section = el('section', 'career-page__river');
  section.setAttribute('aria-label', 'Career river');
  const mount = el('div', 'career-page__river-mount');
  section.append(mount);
  host.append(section);
  mountCareerRiver(mount, model, {
    selectedFutureId,
    onSelectFuture: (id) => {
      if (id) location.hash = careerFutureRoute(id);
      else if (parseRoute(location.hash).name === 'career-future') {
        location.hash = '#/career';
      }
    }
  });
}

function renderFuturePanel(host: HTMLElement, model: ReturnType<typeof buildCareerModel>): void {
  const panel = el('section', 'career-page__panel career-page__futures');
  surface(panel);
  panel.append(el('h2', 'career-page__heading', 'Futures'));
  const active = model.futures.filter((f) => f.status === 'active');
  if (!active.length) {
    panel.append(
      el('p', 'empty-state', 'No futures yet. Add a target role to start a branch.')
    );
    const add = el('button', 'btn btn--secondary', 'Add a future') as HTMLButtonElement;
    add.type = 'button';
    add.addEventListener('click', () => {
      panel.append(el('p', 'career-page__note', 'Add-a-future sheet lands in Phase 4.'));
    });
    panel.append(add);
  } else {
    const list = el('ul', 'career-page__future-list');
    for (const future of active) {
      const li = document.createElement('li');
      li.className = 'career-page__future-row';
      const link = el('a', 'career-page__future-link', future.title);
      link.href = careerFutureRoute(future.id);
      li.append(link);
      li.append(
        el(
          'p',
          'career-page__meta',
          `${future.readiness_label}${future.arrival_label ? ` · ready around ${future.arrival_label}` : ''}`
        )
      );
      list.append(li);
    }
    panel.append(list);
  }
  host.append(panel);
}

function renderSkillsScan(host: HTMLElement, model: ReturnType<typeof buildCareerModel>): void {
  const panel = el('section', 'career-page__panel career-page__scan');
  surface(panel);
  panel.append(el('h2', 'career-page__heading', 'Skills scan'));
  const pending = model.scan?.pending_count ?? 0;
  if (!pending) {
    panel.append(
      el(
        'p',
        'empty-state',
        'All sorted. Next scan runs Sunday evening, or run one now.'
      )
    );
  } else {
    panel.append(el('p', 'career-page__meta', `${pending} proposals waiting.`));
  }
  const run = el('button', 'btn btn--secondary', 'Run scan now') as HTMLButtonElement;
  run.type = 'button';
  run.addEventListener('click', () => {
    panel.append(el('p', 'career-page__note', 'Weekly Skills scan lands in Phase 5.'));
  });
  panel.append(run);
  host.append(panel);
}

function renderApplicationsSection(
  host: HTMLElement,
  model: ReturnType<typeof buildCareerModel>,
  overview: CareerOverview
): void {
  const section = el('section', 'career-page__applications');
  section.id = 'applications';
  surface(section);
  const head = el('div', 'career-page__section-head');
  head.append(el('h2', 'career-page__heading', 'Applications'));
  const compose = el('a', 'btn btn--primary', 'New application');
  compose.href = careerApplicationNewRoute();
  head.append(compose);
  section.append(head);

  const apps = model.applications;
  if (!apps.length) {
    const legacy =
      overview.applications?.status === 'ok' ? overview.applications.items : [];
    if (!legacy.length) {
      section.append(el('p', 'empty-state', 'No applications yet.'));
    } else {
      const list = el('ul', 'career-page__app-list');
      for (const item of legacy) {
        const li = document.createElement('li');
        li.className = 'career-page__app-row';
        const title = item.position_title || item.display_label || item.id || 'Application';
        if (item.id && isValidApplicationId(item.id)) {
          const link = el('a', 'career-page__app-link', title);
          link.href = applicationRoute(item.id);
          li.append(link);
        } else {
          li.append(el('span', 'career-page__app-link', title));
        }
        const bits = [
          item.pipeline_status?.replace(/_/g, ' '),
          item.closing_date
            ? `closes ${formatDisplayDate(item.closing_date) ?? item.closing_date}`
            : null
        ].filter(Boolean);
        if (bits.length) li.append(el('p', 'career-page__meta', bits.join(' · ')));
        list.append(li);
      }
      section.append(list);
    }
  } else {
    const list = el('ul', 'career-page__app-list');
    for (const app of apps) {
      const li = document.createElement('li');
      li.className = 'career-page__app-row';
      const link = el('a', 'career-page__app-link', app.position_title);
      link.href = applicationRoute(app.id);
      li.append(link);
      const bits = [
        app.pipeline_status.replace(/_/g, ' '),
        app.match_label ? `match ${app.match_label}` : null,
        app.closing_date ? `closes ${formatDisplayDate(app.closing_date) ?? app.closing_date}` : null
      ].filter(Boolean);
      li.append(el('p', 'career-page__meta', bits.join(' · ')));
      list.append(li);
    }
    section.append(list);
  }
  host.append(section);
}

function renderSkillsLedger(host: HTMLElement, model: ReturnType<typeof buildCareerModel>): void {
  const section = el('section', 'career-page__ledger');
  surface(section);
  const head = el('div', 'career-page__section-head');
  head.append(el('h2', 'career-page__heading', 'Skills ledger'));
  const add = el('button', 'btn btn--secondary', 'Add card') as HTMLButtonElement;
  add.type = 'button';
  add.addEventListener('click', () => {
    section.append(el('p', 'career-page__note', 'Add card with Ann draft lands with Skills scan.'));
  });
  head.append(add);
  section.append(head);

  const filters = el('div', 'career-page__ledger-filters');
  filters.append(el('button', 'hub-pills__btn is-active', 'All') as HTMLButtonElement);
  for (const future of model.futures.filter((f) => f.status === 'active')) {
    const chip = el(
      'button',
      'hub-pills__btn',
      future.title.split(' ')[0] || future.title
    ) as HTMLButtonElement;
    chip.type = 'button';
    filters.append(chip);
  }
  section.append(filters);

  if (!model.ledger.length) {
    section.append(
      el(
        'p',
        'empty-state',
        'No skill cards yet. Your first Skills scan runs Sunday evening, or add one now.'
      )
    );
  } else {
    const list = el('ul', 'career-page__ledger-list');
    for (const card of model.ledger) {
      const li = document.createElement('li');
      li.className = 'career-page__ledger-row';
      const link = el('a', 'career-page__ledger-link', card.title);
      link.href = careerCardRoute(card.id);
      const date =
        card.date_precision === 'year'
          ? card.occurred_on.slice(0, 4)
          : card.date_precision === 'month'
            ? formatDisplayDate(`${card.occurred_on.slice(0, 7)}-01`)?.replace(/^\d{2}\//, '') ||
              card.occurred_on.slice(0, 7)
            : formatDisplayDate(card.occurred_on) ?? card.occurred_on;
      li.append(el('span', 'career-page__ledger-date', date), link);
      list.append(li);
    }
    section.append(list);
  }
  host.append(section);
}

export async function renderCareerView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading career…');
  let overview: CareerOverview;
  try {
    overview = await getCareer();
  } catch (error) {
    renderLoadError(canvas, error, 'Could not load career.');
    return;
  }

  const model = buildCareerModel({
    achievements: (overview.achievements as CareerOverview['achievements']) as never,
    futures: overview.futures as never,
    stones: overview.stones as never,
    applications: [],
    supports_future: overview.supports_future as never,
    answers_criterion: overview.answers_criterion as never,
    stone_for: overview.stone_for as never,
    stone_actions: overview.stone_actions as never,
    employment: (overview.employment_items ??
      (overview.employment?.status === 'ok' ? overview.employment.items : [])) as never,
    scan: overview.scan
  });

  const route = parseRoute(location.hash);
  const selectedFutureId =
    route.name === 'career-future' && 'id' in route ? route.id : null;

  canvas.replaceChildren();
  const page = el('div', 'career-page');

  const stats = el('p', 'career-page__stats', model.stats_line);
  page.append(stats);

  renderRiver(page, model, selectedFutureId);

  const columns = el('div', 'career-page__columns');
  renderFuturePanel(columns, model);
  renderSkillsScan(columns, model);
  page.append(columns);

  renderApplicationsSection(page, model, overview);
  renderSkillsLedger(page, model);

  canvas.append(page);

  try {
    const scrollTo = sessionStorage.getItem('career-scroll-to');
    if (scrollTo === 'applications') {
      sessionStorage.removeItem('career-scroll-to');
      document.getElementById('applications')?.scrollIntoView({ block: 'start' });
    }
  } catch {
    /* ignore */
  }
}
