import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { listApplications, updateApplication, getApplication } from '@/api/applications';
import { createStone } from '@/api/career';
import { createTask } from '@/api/universal-links';
import { applicationRoute } from '@/app/router';
import type { buildCareerModel } from '@/domain/career-model';
import type { ApplicationRecord } from '@/domain/types';

type CareerModel = ReturnType<typeof buildCareerModel>;

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

const ACTIVE = new Set([
  'idea',
  'researching',
  'drafting',
  'ready_to_submit',
  'submitted',
  'interviewing',
  'awaiting_outcome'
]);

/**
 * Applications section with match % and Criteria Mirror.
 */
export async function renderCareerApplications(
  host: HTMLElement,
  model: CareerModel,
  options: { onChanged: () => void }
): Promise<void> {
  const section = el('section', 'career-page__applications');
  section.id = 'applications';
  surface(section);
  host.append(section);

  const head = el('div', 'career-page__section-head');
  head.append(el('h2', 'career-page__heading', 'Applications'));
  const compose = el('a', 'btn btn--primary', 'New application');
  compose.href = '#/career/application/new';
  head.append(compose);
  section.append(head);

  let applications: ApplicationRecord[] = [];
  try {
    const data = await listApplications();
    applications = data.applications ?? [];
  } catch {
    section.append(el('p', 'empty-state', 'Could not load applications.'));
    return;
  }

  if (!applications.length) {
    section.append(el('p', 'empty-state', 'No applications yet.'));
    return;
  }

  const active = applications.filter((a) => ACTIVE.has(a.pipeline_status));
  const past = applications.filter((a) => !ACTIVE.has(a.pipeline_status));
  const mirrorHost = el('div', 'career-mirror-host');

  if (active.length) {
    section.append(el('h3', 'career-future__subhead', 'Active'));
    const list = el('ul', 'career-page__app-list');
    for (const app of active) {
      list.append(renderActiveRow(app, model, mirrorHost, options));
    }
    section.append(list);
  }
  if (past.length) {
    section.append(el('h3', 'career-future__subhead', 'Past'));
    const list = el('ul', 'career-page__app-list');
    for (const app of past) {
      list.append(renderPastRow(app, options));
    }
    section.append(list);
  }

  section.append(mirrorHost);
}

function modelMatch(app: ApplicationRecord, model: CareerModel): string | null {
  const fromModel = model.applications.find((a) => a.id === app.id);
  return fromModel?.match_label ?? null;
}

function renderActiveRow(
  app: ApplicationRecord,
  model: CareerModel,
  mirrorHost: HTMLElement,
  options: { onChanged: () => void }
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'career-page__app-row';
  const link = el('a', 'career-page__app-link', app.position_title);
  link.href = applicationRoute(app.id);
  li.append(link);
  const match = modelMatch(app, model);
  const org = app.organisation?.display_label;
  const bits = [
    org,
    app.pipeline_status.replace(/_/g, ' '),
    match ? `match ${match}` : null,
    app.closing_date ? `closes ${formatDisplayDate(app.closing_date) ?? app.closing_date}` : null
  ].filter(Boolean);
  li.append(el('p', 'career-page__meta', bits.join(' · ')));
  const open = el('button', 'btn btn--secondary', 'Open Criteria Mirror') as HTMLButtonElement;
  open.type = 'button';
  open.addEventListener('click', () => {
    void openCriteriaMirror(mirrorHost, app, model, options);
    mirrorHost.scrollIntoView({ block: 'start' });
  });
  li.append(open);
  return li;
}

function renderPastRow(
  app: ApplicationRecord,
  options: { onChanged: () => void }
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'career-page__app-row';
  const link = el('a', 'career-page__app-link', app.position_title);
  link.href = applicationRoute(app.id);
  li.append(link);
  const outcome = app.outcome?.status?.replace(/_/g, ' ') || app.pipeline_status.replace(/_/g, ' ');
  li.append(el('p', 'career-page__meta', outcome));
  const feedback = app.outcome?.reason || app.reflection;
  if (feedback) {
    li.append(el('blockquote', 'career-app__feedback', feedback));
    const stone = el('button', 'btn btn--ghost', 'Turn feedback into a stepping stone') as HTMLButtonElement;
    stone.type = 'button';
    stone.addEventListener('click', () => {
      void (async () => {
        stone.disabled = true;
        try {
          await createStone({
            label: String(feedback).slice(0, 200),
            origin: 'feedback',
            target_term_start: null,
            status_override: null
          });
          options.onChanged();
        } catch {
          stone.disabled = false;
        }
      })();
    });
    li.append(stone);
  }
  return li;
}

async function openCriteriaMirror(
  host: HTMLElement,
  appSeed: ApplicationRecord,
  model: CareerModel,
  options: { onChanged: () => void }
): Promise<void> {
  host.replaceChildren();
  const panel = el('section', 'career-mirror');
  surface(panel);
  host.append(panel);
  panel.append(el('h3', 'career-page__heading', 'Criteria Mirror'));
  panel.append(el('p', 'career-page__meta', appSeed.position_title));

  let app = appSeed;
  try {
    const fresh = await getApplication(appSeed.id);
    app = fresh.application;
  } catch {
    /* use seed */
  }

  const grid = el('div', 'career-mirror__grid');
  const left = el('div', 'career-mirror__ad');
  left.append(el('h4', 'career-future__subhead', 'Advertisement'));
  const ad = el('textarea', 'career-mirror__ad-text') as HTMLTextAreaElement;
  ad.rows = 12;
  ad.value = app.advertisement?.summary || app.advertisement?.title || '';
  left.append(ad);
  const split = el('button', 'btn btn--secondary', 'Split into criteria') as HTMLButtonElement;
  split.type = 'button';
  split.addEventListener('click', () => {
    void (async () => {
      split.disabled = true;
      try {
        const lines = ad.value
          .split(/\n+/)
          .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
          .filter((l) => l.length > 8)
          .slice(0, 12);
        if (!lines.length) {
          split.disabled = false;
          return;
        }
        const confirm = window.confirm(
          `Add ${lines.length} criteria from the ad? Existing criteria are kept.`
        );
        if (!confirm) {
          split.disabled = false;
          return;
        }
        const existing = app.selection_criteria ?? [];
        const next = [
          ...existing,
          ...lines.map((criterion, index) => ({
            criterion,
            order: existing.length + index + 1,
            completed: false,
            notes: null,
            evidence_refs: [] as string[]
          }))
        ];
        await updateApplication(app.id, { selection_criteria: next as never });
        options.onChanged();
        await openCriteriaMirror(host, app, model, options);
      } catch {
        split.disabled = false;
      }
    })();
  });
  left.append(split);
  grid.append(left);

  const right = el('div', 'career-mirror__criteria');
  right.append(el('h4', 'career-future__subhead', 'Criteria'));
  const modelApp = model.applications.find((a) => a.id === app.id);
  if (modelApp?.match_percent != null) {
    right.append(el('p', 'career-page__meta', `Overall match ${modelApp.match_percent}%`));
  }

  const sorted = [...(app.selection_criteria ?? [])].sort((a, b) => a.order - b.order);
  if (!sorted.length) {
    right.append(
      el('p', 'empty-state', 'No selection criteria yet. Paste the ad and split, or edit the application.')
    );
  }

  for (const criterion of sorted) {
    const row = el('div', 'career-mirror__row');
    // Coverage from answers_criterion lands when links exist; default 0 until matched.
    const pct = 0;
    const headRow = el('div', 'career-mirror__row-head');
    headRow.append(el('span', 'career-mirror__num', String(criterion.order)));
    headRow.append(el('span', 'career-mirror__text', criterion.criterion));
    headRow.append(el('span', 'career-mirror__pct', `${pct}%`));
    row.append(headRow);
    const bar = el('div', 'career-mirror__bar');
    const fill = el('div', 'career-mirror__bar-fill');
    fill.style.width = `${pct}%`;
    bar.append(fill);
    row.append(bar);

    if (pct === 0) {
      const gap = el(
        'button',
        'btn btn--ghost',
        `Make it a stepping stone: ${criterion.criterion.slice(0, 40)}`
      ) as HTMLButtonElement;
      gap.type = 'button';
      gap.addEventListener('click', () => {
        void (async () => {
          gap.disabled = true;
          try {
            await createStone({
              label: criterion.criterion.slice(0, 200),
              origin: 'gap',
              target_term_start: null,
              status_override: null
            });
            await createTask({
              title: criterion.criterion.slice(0, 200),
              status: 'todo',
              domain: 'work'
            });
            gap.textContent = 'Stepping stone added · in Tasks';
            options.onChanged();
          } catch {
            gap.disabled = false;
          }
        })();
      });
      row.append(gap);
    }
    right.append(row);
  }
  grid.append(right);
  panel.append(grid);

  const close = el('button', 'btn btn--ghost', 'Close mirror') as HTMLButtonElement;
  close.type = 'button';
  close.addEventListener('click', () => host.replaceChildren());
  panel.append(close);
}
