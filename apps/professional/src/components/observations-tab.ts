import type { TabDef } from '@/components/entity-detail';
import { ApiClientError } from '@/api/client';
import { createObservation, fetchObservations } from '@/api/observations';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { EntityOverview, ObservationRecord } from '@/domain/types';

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

const SOURCE_LABELS: Record<ObservationRecord['source'], string> = {
  meeting: 'Meeting',
  communication: 'Communication',
  manual: 'Manual',
  imported: 'Imported'
};

const SOURCE_OPTIONS: ObservationRecord['source'][] = ['manual', 'meeting', 'communication', 'imported'];

export function formatObservationSource(source: string): string {
  return SOURCE_LABELS[source as ObservationRecord['source']] ?? source;
}

export function formatObservationDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function renderObservationList(host: HTMLElement, observations: ObservationRecord[]): void {
  host.replaceChildren();
  if (!observations.length) {
    host.append(el('p', 'empty-state', 'No observations recorded.'));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'entity-detail__observation-list';
  // Newest first — the server already sorts by `occurred_at` descending, so
  // this renders `observations` in the order it is handed, never re-sorting.
  for (const observation of observations) {
    const item = document.createElement('li');
    item.className = 'entity-detail__observation';
    item.append(el('p', 'entity-detail__observation-text', observation.text));
    item.append(
      el(
        'p',
        'entity-detail__observation-meta',
        `${formatObservationDate(observation.occurred_at)} · ${formatObservationSource(observation.source)}`
      )
    );
    list.append(item);
  }
  host.append(list);
}

/**
 * Add-observation form. `occurred_at` defaults to "now" (an Observation is
 * typically logged at the moment it's noticed, not backdated) and
 * `linked_ref` is always omitted (`null`) — Phase 1 has no UI to link an
 * observation to a specific meeting/communication; that's a documented scope
 * cut, not an oversight.
 */
function renderObservationForm(
  host: HTMLElement,
  aboutRef: string,
  onCreated: (observation: ObservationRecord) => void
): void {
  const form = document.createElement('form');
  form.className = 'entity-detail__observation-form';

  const uid = Math.random().toString(36).slice(2);
  const textareaId = `observation-text-${uid}`;
  const selectId = `observation-source-${uid}`;

  const textLabel = el('label', 'entity-detail__observation-form-label', 'New observation');
  textLabel.htmlFor = textareaId;
  const textarea = document.createElement('textarea');
  textarea.id = textareaId;
  textarea.required = true;

  const sourceLabel = el('label', 'entity-detail__observation-form-label', 'Source');
  sourceLabel.htmlFor = selectId;
  const select = document.createElement('select');
  select.id = selectId;
  for (const source of SOURCE_OPTIONS) {
    const option = document.createElement('option');
    option.value = source;
    option.textContent = formatObservationSource(source);
    select.append(option);
  }
  select.value = 'manual';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn--primary';
  submit.textContent = 'Add observation';

  const status = el('p', 'entity-detail__observation-form-status');
  status.hidden = true;

  form.append(textLabel, textarea, sourceLabel, select, submit, status);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;
    submit.disabled = true;
    status.hidden = true;
    createObservation({
      about_ref: aboutRef,
      text,
      occurred_at: new Date().toISOString(),
      source: select.value as ObservationRecord['source'],
      linked_ref: null
    })
      .then((result) => {
        submit.disabled = false;
        textarea.value = '';
        select.value = 'manual';
        onCreated(result.observation);
      })
      .catch((err: unknown) => {
        submit.disabled = false;
        status.hidden = false;
        status.textContent = err instanceof ApiClientError ? err.message : 'Could not add observation.';
      });
  });

  host.append(form);
}

/**
 * Unlike the other five Person Profile tabs, Observations does its own
 * fetch on activation rather than reusing the already-loaded `overview` — so
 * this is the first tab that actually exercises `ctx.isCurrent()` for real:
 * if the user has navigated away by the time `fetchObservations` resolves,
 * this bails out before touching `host`.
 */
async function renderObservationsTab(
  host: HTMLElement,
  overview: EntityOverview,
  ctx: { isCurrent: () => boolean }
): Promise<void> {
  const aboutRef = overview.entity.ref;

  async function load(): Promise<void> {
    showViewLoading(host, 'Loading observations…');
    try {
      const result = await fetchObservations(aboutRef);
      if (!ctx.isCurrent()) return;
      renderLoaded(result.observations);
    } catch (err) {
      if (!ctx.isCurrent()) return;
      renderLoadError(host, err, () => void load());
    }
  }

  function renderLoaded(initialObservations: ObservationRecord[]): void {
    let observations = initialObservations;
    host.replaceChildren();

    const section = el('div', 'entity-detail__section');
    section.append(el('h2', 'entity-detail__heading', 'Observations'));

    const listHost = el('div');
    renderObservationList(listHost, observations);
    section.append(listHost);

    // Optimistic prepend on create (documented choice, not a refetch): the
    // server already returned the full created record, so there is nothing
    // more to learn from a second GET, and it keeps the form snappy.
    renderObservationForm(section, aboutRef, (created) => {
      observations = [created, ...observations];
      renderObservationList(listHost, observations);
    });

    host.append(section);
  }

  await load();
}

export function buildObservationsTab(): TabDef {
  return {
    id: 'observations',
    label: 'Observations',
    render: renderObservationsTab
  };
}
