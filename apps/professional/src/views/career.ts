import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderSkillCardDetail } from '@/views/career-card-detail';
import { getCareer, updateFuture } from '@/api/career';
import { openAddSkillSheet } from '@/views/career-skill-form';
import { listApplications } from '@/api/applications';
import { careerCardRoute, careerFutureRoute, parseRoute } from '@/app/router';
import { buildCareerModel, type CareerModel } from '@/domain/career-model';
import { riverJobShortLabel } from '@/domain/career-river-geometry';
import type { CareerOverview } from '@/domain/types';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import { mountCareerRiver } from '@/views/career-river';
import { renderCareerEmployment } from '@/views/career-employment';
import {
  openAddFutureSheet,
  openEditFutureSheet,
  renderFutureDetail
} from '@/views/career-future-panel';
import { renderSkillsScanPanel } from '@/views/career-skills-scan';
import { renderCareerApplications } from '@/views/career-criteria-mirror';

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

function futureCount(model: CareerModel): number {
  return model.futures.length + model.parked_futures.length;
}

/**
 * The Career page as last drawn. Picking a future only swaps the detail slot
 * and the river's highlight; it never refetches or redraws the page.
 */
type MountedCareer = {
  canvas: HTMLElement;
  page: HTMLElement;
  model: CareerModel;
  river: { destroy: () => void; setSelected: (id: string | null) => void };
  detailSlot: HTMLElement;
  futuresList: HTMLElement | null;
  reload: (reveal?: boolean) => void;
};

let mounted: MountedCareer | null = null;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function showSelection(view: MountedCareer, futureId: string | null, scroll: boolean): void {
  view.river.setSelected(futureId);
  const future = futureId ? view.model.futures.find((f) => f.id === futureId) : null;
  view.detailSlot.replaceChildren();
  if (future) {
    renderFutureDetail(view.detailSlot, future, {
      onChanged: () => view.reload(),
      onClose: () => {
        location.hash = '#/career';
      }
    });
  }
  view.futuresList?.querySelectorAll<HTMLElement>('[data-future-id]').forEach((row) => {
    row.classList.toggle('is-selected', row.dataset.futureId === futureId);
  });
  if (future && scroll) {
    requestAnimationFrame(() => {
      view.detailSlot.scrollIntoView({
        block: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
    });
  }
}

/**
 * Router hook for `#/career` ⇄ `#/career/future/<id>`. Returns false when the
 * page isn't on screen (or the future is unknown) so the router renders it.
 */
export function selectCareerFutureInPlace(canvas: HTMLElement, futureId: string | null): boolean {
  const view = mounted;
  if (!view || view.canvas !== canvas || !canvas.contains(view.page)) return false;
  if (futureId && !view.model.futures.some((f) => f.id === futureId)) return false;
  showSelection(view, futureId, true);
  return true;
}

function openCriteriaFor(model: CareerModel, futureId: string, onReload: () => void): void {
  const future = model.futures.find((f) => f.id === futureId);
  if (future) openEditFutureSheet(document.body, future, onReload, { focusCriteria: true });
}

function addFuture(model: CareerModel, onReload: (reveal?: boolean) => void): void {
  openAddFutureSheet(
    document.body,
    (id) => {
      // replaceState, not location.hash: the reload below draws the new
      // future selected, and a hashchange would start a second render.
      history.replaceState(null, '', careerFutureRoute(id));
      onReload(true);
    },
    futureCount(model)
  );
}

function renderRiver(
  host: HTMLElement,
  model: CareerModel,
  selectedFutureId: string | null,
  onReload: (reveal?: boolean) => void
): MountedCareer['river'] {
  const section = el('section', 'career-page__river');
  section.setAttribute('aria-label', 'Career river');
  const mount = el('div', 'career-page__river-mount');
  section.append(mount);
  host.append(section);
  // The river sets the URL itself; the router's hashchange then calls
  // selectCareerFutureInPlace, which draws the detail panel.
  return mountCareerRiver(mount, model, {
    selectedFutureId,
    onAddFuture: () => addFuture(model, onReload),
    onAddCriteria: (id) => openCriteriaFor(model, id, () => onReload()),
    onRestoreFuture: (id) => {
      const done = () => onReload();
      void updateFuture(id, { status: 'active' }).then(done, done);
    }
  });
}

function renderFuturesList(
  host: HTMLElement,
  model: CareerModel,
  onReload: (reveal?: boolean) => void
): HTMLElement {
  const panel = el('section', 'career-page__panel career-page__futures');
  surface(panel);
  const head = el('div', 'career-page__section-head');
  head.append(el('h2', 'career-page__heading', 'Futures'));
  const add = el('button', 'btn btn--secondary', 'Add a future') as HTMLButtonElement;
  add.type = 'button';
  add.addEventListener('click', () => addFuture(model, onReload));
  head.append(add);
  panel.append(head);

  const active = model.futures.filter((f) => f.status === 'active');
  if (!active.length) {
    // Empty: one compact line, so a section with nothing in it doesn't dominate.
    panel.classList.add('career-page__section--empty');
    head.querySelector('.career-page__heading')?.after(
      el('p', 'career-page__meta', 'No futures yet. Add a target role to start a branch.')
    );
  } else {
    const list = el('ul', 'career-page__future-list');
    for (const future of active) {
      const li = document.createElement('li');
      li.className = 'career-page__future-row';
      li.dataset.futureId = future.id;
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
  return panel;
}

function renderSkillsScan(
  host: HTMLElement,
  model: CareerModel,
  onReload: () => void
): void {
  const wrap = el('div', 'career-page__scan-host');
  host.append(wrap);
  renderSkillsScanPanel(wrap, model, { onChanged: onReload });
}

let renderToken = 0;

/**
 * `quiet`: a refresh after an edit. The old page stays up until the new one
 * is ready, so the scroll position survives instead of jumping to a spinner.
 * `reveal`: scroll to the selected future anyway (a future just added).
 */
export async function renderCareerView(
  canvas: HTMLElement,
  options: { quiet?: boolean; reveal?: boolean } = {}
): Promise<void> {
  const token = ++renderToken;
  const initialRoute = parseRoute(location.hash);
  if (initialRoute.name === 'career-card') {
    mounted?.river.destroy();
    mounted = null;
    await renderSkillCardDetail(canvas, initialRoute.id);
    return;
  }
  const quiet = Boolean(options.quiet && mounted && canvas.contains(mounted.page));
  if (!quiet) showViewLoading(canvas, 'Loading career…');
  let overview: CareerOverview;
  try {
    overview = await getCareer();
  } catch (error) {
    if (token !== renderToken) return;
    mounted?.river.destroy();
    mounted = null;
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

  if (token !== renderToken) return;

  const route = parseRoute(location.hash);
  const selectedFutureId =
    route.name === 'career-future' && 'id' in route ? route.id : null;

  const reload = (reveal = false) => {
    void renderCareerView(canvas, { quiet: true, reveal });
  };
  // For callbacks that may pass their own arguments (a saved record).
  const refresh = () => reload();

  const page = el('div', 'career-page');

  const stats = el('p', 'career-page__stats', model.stats_line);
  page.append(stats);

  const river = renderRiver(page, model, selectedFutureId, reload);
  // The selected future opens right under the river, where the click was.
  const detailSlot = el('div', 'career-page__detail-slot');
  page.append(detailSlot);
  renderCareerEmployment(page, model, { selfRef: overview.self_ref ?? null, onReload: refresh });

  const columns = el('div', 'career-page__columns');
  const futuresList = renderFuturesList(columns, model, reload);
  renderSkillsScan(columns, model, refresh);
  page.append(columns);

  await renderCareerApplications(page, model, { onChanged: refresh });
  renderSkillsLedger(page, model, refresh);

  if (token !== renderToken) {
    river.destroy();
    return;
  }
  mounted?.river.destroy();
  canvas.replaceChildren(page);
  mounted = { canvas, page, model, river, detailSlot, futuresList, reload };
  // Deep link: scroll to the panel. A quiet refresh keeps the reader's place.
  showSelection(mounted, selectedFutureId, !quiet || Boolean(options.reveal));

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

  const activeFutures = model.futures.filter((f) => f.status === 'active');
  const filters = el('div', 'career-page__ledger-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Show cards for');
  const filterButtons: HTMLButtonElement[] = [];
  const addFilter = (label: string, futureId: string | null) => {
    const chip = el('button', 'hub-pills__btn', label) as HTMLButtonElement;
    chip.type = 'button';
    chip.dataset.futureId = futureId ?? '';
    chip.addEventListener('click', () => applyFilter(futureId));
    filterButtons.push(chip);
    filters.append(chip);
  };
  // One filter per future only earns its place when there's a choice to make.
  if (model.ledger.length && activeFutures.length) {
    addFilter('All', null);
    for (const future of activeFutures) addFilter(riverJobShortLabel(future.title), future.id);
    section.append(filters);
  }
  const filterNote = el('p', 'career-page__meta');

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
      li.dataset.futureIds = card.future_ids.join(' ');
      li.append(el('span', 'career-page__ledger-date', date), link);
      if (card.merged_ids.length) {
        const kept = card.merged_ids.length + 1;
        const note = el('span', 'career-page__meta career-page__ledger-merged', `Kept ${kept} times`);
        note.title = 'The scan kept this skill more than once; it now shows as one card.';
        li.append(note);
      }
      list.append(li);
    }
    section.append(list, filterNote);
  }
  host.append(section);

  function applyFilter(futureId: string | null): void {
    let shown = 0;
    section.querySelectorAll<HTMLElement>('.career-page__ledger-row').forEach((row) => {
      const match = !futureId || (row.dataset.futureIds ?? '').split(' ').includes(futureId);
      row.hidden = !match;
      if (match) shown += 1;
    });
    for (const button of filterButtons) {
      const on = (button.dataset.futureId || null) === futureId;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const future = futureId ? activeFutures.find((f) => f.id === futureId) : null;
    filterNote.textContent =
      future && !shown ? `No cards support ${future.title} yet. Keep one from the Skills scan.` : '';
  }
  applyFilter(null);
}
