import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderSkillCardDetail } from '@/views/career-card-detail';
import { getCareer } from '@/api/career';
import { openAddSkillSheet } from '@/views/career-skill-form';
import { listApplications } from '@/api/applications';
import { careerCardRoute, careerFutureRoute, parseRoute } from '@/app/router';
import { buildCareerModel, type CareerModel } from '@/domain/career-model';
import type { CareerOverview } from '@/domain/types';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { mountCareerRiver } from '@/views/career-river';
import { renderCareerEmployment } from '@/views/career-employment';
import { openAddFutureSheet, renderFutureDetail } from '@/views/career-future-panel';
import { renderSkillsScanPanel } from '@/views/career-skills-scan';
import { renderCareerApplications } from '@/views/career-criteria-mirror';
import { renderWhatIfPanel } from '@/views/career-what-if';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
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
  model: CareerModel,
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

function renderFuturePanel(
  host: HTMLElement,
  model: CareerModel,
  selectedFutureId: string | null,
  onReload: () => void
): void {
  if (selectedFutureId) {
    const future = model.futures.find((f) => f.id === selectedFutureId);
    if (future) {
      const wrap = el('div', 'career-page__panel-host');
      host.append(wrap);
      renderFutureDetail(wrap, future, { onChanged: onReload });
      return;
    }
  }

  const panel = el('section', 'career-page__panel career-page__futures');
  surface(panel);
  const head = el('div', 'career-page__section-head');
  head.append(el('h2', 'career-page__heading', 'Futures'));
  const add = el('button', 'btn btn--secondary', 'Add a future') as HTMLButtonElement;
  add.type = 'button';
  add.addEventListener('click', () => openAddFutureSheet(document.body, onReload));
  head.append(add);
  panel.append(head);

  const active = model.futures.filter((f) => f.status === 'active');
  if (!active.length) {
    panel.append(
      el('p', 'empty-state', 'No futures yet. Add a target role to start a branch.')
    );
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

function renderSkillsScan(
  host: HTMLElement,
  model: CareerModel,
  onReload: () => void
): void {
  const wrap = el('div', 'career-page__scan-host');
  host.append(wrap);
  renderSkillsScanPanel(wrap, model, {
    onChanged: onReload,
    onKept: () => {
      /* river remounts via onChanged */
    }
  });
}

export async function renderCareerView(canvas: HTMLElement): Promise<void> {
  const initialRoute = parseRoute(location.hash);
  if (initialRoute.name === 'career-card') { await renderSkillCardDetail(canvas, initialRoute.id); return; }
  showViewLoading(canvas, 'Loading career…');
  let overview: CareerOverview;
  try {
    overview = await getCareer();
  } catch (error) {
    renderLoadError(canvas, error, () => {
      void renderCareerView(canvas);
    });
    return;
  }

  let applicationRecords: Array<{
    id: string;
    position_title: string;
    pipeline_status: string;
    closing_date?: string | null;
    selection_criteria?: Array<{ id: string }>;
  }> = [];
  try {
    const listed = await listApplications();
    applicationRecords = (listed.applications ?? []).map((a) => ({
      id: a.id,
      position_title: a.position_title,
      pipeline_status: a.pipeline_status,
      closing_date: a.closing_date,
      selection_criteria: a.selection_criteria?.map((c) => ({ id: c.id }))
    }));
  } catch {
    applicationRecords = [];
  }

  const model = buildCareerModel({
    achievements: (overview.achievements as CareerOverview['achievements']) as never,
    futures: overview.futures as never,
    stones: overview.stones as never,
    applications: applicationRecords as never,
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

  const reload = () => {
    void renderCareerView(canvas);
  };

  canvas.replaceChildren();
  const page = el('div', 'career-page');

  const stats = el('p', 'career-page__stats', model.stats_line);
  page.append(stats);

  renderRiver(page, model, selectedFutureId);
  renderCareerEmployment(page, model);

  const columns = el('div', 'career-page__columns');
  renderFuturePanel(columns, model, selectedFutureId, reload);
  renderSkillsScan(columns, model, reload);
  page.append(columns);

  await renderCareerApplications(page, model, { onChanged: reload });
  renderSkillsLedger(page, model, reload);
  renderWhatIfPanel(page, model);

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

function renderSkillsLedger(host: HTMLElement, model: CareerModel, onReload: () => void): void {
  const section = el('section', 'career-page__ledger');
  surface(section);
  const head = el('div', 'career-page__section-head');
  head.append(el('h2', 'career-page__heading', 'Skills ledger'));
  const add = el('button', 'btn btn--secondary', 'Add card') as HTMLButtonElement;
  add.type = 'button';
  add.addEventListener('click', () => openAddSkillSheet(document.body, onReload));
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
