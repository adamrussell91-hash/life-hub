import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { listApplications } from '@/api/applications';
import { createStone } from '@/api/career';
import { applicationRoute } from '@/app/router';
import type { CareerModel } from '@/domain/career-model';
import type { ApplicationRecord } from '@/domain/types';
import { renderApplicationWorkspace } from '@/views/career-application-workspace';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
  text?: string | null
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
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
    // Empty: one compact line, so a section with nothing in it doesn't dominate.
    section.classList.add('career-page__section--empty');
    compose.className = 'btn btn--secondary';
    head.querySelector('.career-page__heading')?.after(
      el('p', 'career-page__meta', 'No applications yet.')
    );
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
  const reopen = openMirrorId ? applications.find((a) => a.id === openMirrorId) : null;
  if (reopen) await openCriteriaMirror(mirrorHost, reopen, model, options);
  else openMirrorId = null;
}

/** "match 60%", "not checked", or nothing when there are no criteria (one model, V4). */
function modelMatch(app: ApplicationRecord, model: CareerModel): string | null {
  const fromModel = model.applications.find((a) => a.id === app.id);
  if (!fromModel?.criteria.length) return null;
  return fromModel.checked && fromModel.match_label ? `match ${fromModel.match_label}` : 'not checked';
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
    match,
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

/** The application whose workspace is open; a page refresh opens it again. */
let openMirrorId: string | null = null;

function openCriteriaMirror(
  host: HTMLElement,
  app: ApplicationRecord,
  model: CareerModel,
  options: { onChanged: () => void }
): Promise<void> {
  openMirrorId = app.id;
  return renderApplicationWorkspace(host, app, {
    model,
    onChanged: options.onChanged,
    onClose: () => {
      openMirrorId = null;
      host.replaceChildren();
    }
  });
}

/** For tests. */
export function closeCriteriaMirror(): void {
  openMirrorId = null;
}
