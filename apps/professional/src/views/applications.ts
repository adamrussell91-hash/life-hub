import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import {
  createApplication,
  getApplication,
  isApplicationIncompleteLinksError,
  isApplicationTaskLinkIncompleteError,
  linkApplicationTask,
  listApplications,
  retryApplicationLinks,
  retryApplicationTaskLink,
  transitionApplication,
  updateApplication
} from '@/api/applications';
import { searchEntities } from '@/api/entities';
import { ApiClientError } from '@/api/client';
import { applicationRoute } from '@/app/router';
import { applicationRef } from '@/domain/ids';
import {
  APPLICATION_PIPELINE_TRANSITIONS,
  type ApplicationDocument,
  type ApplicationPipelineStatus,
  type ApplicationRecord,
  type InterviewRound,
  type OutcomeStatus,
  type RefereeRole,
  type SelectionCriterion
} from '@/domain/types';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import {
  mountKnowledgePagePicker,
  mountTaskLinkPanel
} from '@/components/schedule-relationships';
import {
  createUniversalLink,
  endUniversalLink,
  listUniversalLinksForEntity,
  type UniversalLinkEntry
} from '@/api/universal-links';
import { wallLocalToUtcIso, utcIsoToWallLocal } from '@/lib/wall-time';

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

const PIPELINE_ORDER: ApplicationPipelineStatus[] = [
  'drafting',
  'ready',
  'submitted',
  'under_review',
  'interviewing',
  'offer',
  'accepted',
  'declined',
  'withdrawn',
  'unsuccessful'
];

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

type ListMode = 'pipeline' | 'list';

export async function renderApplicationsView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading applications…');
  let mode: ListMode = 'pipeline';

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading applications…');
    try {
      const { applications } = await listApplications();
      paint(applications);
    } catch (err) {
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(applications: ApplicationRecord[]): void {
    canvas.replaceChildren();
    const actions = el('div', 'applications__actions');
    const compose = el('a', 'btn btn--primary', 'New application');
    compose.href = '#/application/new';

    const toggle = el('div', 'applications__toggle');
    const pipelineBtn = el('button', 'btn btn--secondary', 'Pipeline') as HTMLButtonElement;
    pipelineBtn.type = 'button';
    pipelineBtn.setAttribute('aria-pressed', mode === 'pipeline' ? 'true' : 'false');
    const listBtn = el('button', 'btn btn--secondary', 'List') as HTMLButtonElement;
    listBtn.type = 'button';
    listBtn.setAttribute('aria-pressed', mode === 'list' ? 'true' : 'false');
    pipelineBtn.addEventListener('click', () => {
      mode = 'pipeline';
      paint(applications);
    });
    listBtn.addEventListener('click', () => {
      mode = 'list';
      paint(applications);
    });
    toggle.append(pipelineBtn, listBtn);
    actions.append(compose, toggle);
    canvas.append(actions);

    if (!applications.length) {
      canvas.append(el('p', 'empty-state', 'No applications yet.'));
      return;
    }

    if (mode === 'list') {
      const list = document.createElement('ul');
      list.className = 'applications__list';
      for (const record of applications) {
        list.append(renderApplicationListItem(record));
      }
      canvas.append(list);
      return;
    }

    const board = el('div', 'applications__pipeline');
    for (const status of PIPELINE_ORDER) {
      const group = applications.filter((record) => record.pipeline_status === status);
      if (!group.length) continue;
      const column = el('section', 'applications__pipeline-column');
      column.append(el('h2', 'applications__pipeline-heading', statusLabel(status)));
      const list = document.createElement('ul');
      list.className = 'applications__list';
      for (const record of group) {
        list.append(renderApplicationListItem(record));
      }
      column.append(list);
      board.append(column);
    }
    canvas.append(board);
  }

  await load();
}

function renderApplicationListItem(record: ApplicationRecord): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'applications__item';
  const link = el('a', 'applications__link', record.position_title);
  link.href = applicationRoute(record.id);
  const meta = el(
    'p',
    'applications__meta',
    [
      record.organisation?.display_label ?? null,
      statusLabel(record.pipeline_status),
      record.closing_date
        ? `closes ${formatDisplayDate(record.closing_date) ?? record.closing_date}`
        : null,
      record.incomplete_links ? 'incomplete links' : null
    ]
      .filter(Boolean)
      .join(' · ')
  );
  item.append(link, meta);
  return item;
}

export async function renderApplicationNewView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const form = document.createElement('form');
  form.className = 'application-form';
  form.noValidate = true;

  const positionTitle = document.createElement('input');
  positionTitle.type = 'text';
  positionTitle.required = true;
  positionTitle.placeholder = 'Position title';
  positionTitle.setAttribute('aria-label', 'Position title');

  const adTitle = document.createElement('input');
  adTitle.type = 'text';
  adTitle.placeholder = 'Advertisement title';
  adTitle.setAttribute('aria-label', 'Advertisement title');

  const adUrl = document.createElement('input');
  adUrl.type = 'url';
  adUrl.placeholder = 'Advertisement URL';
  adUrl.setAttribute('aria-label', 'Advertisement URL');

  const adSource = document.createElement('input');
  adSource.type = 'text';
  adSource.placeholder = 'Advertisement source';
  adSource.setAttribute('aria-label', 'Advertisement source');

  const adSummary = document.createElement('textarea');
  adSummary.rows = 3;
  adSummary.placeholder = 'Advertisement summary';
  adSummary.setAttribute('aria-label', 'Advertisement summary');

  const closingDate = document.createElement('input');
  closingDate.type = 'date';
  closingDate.setAttribute('aria-label', 'Closing date');

  const orgInput = document.createElement('input');
  orgInput.type = 'text';
  orgInput.placeholder = 'Type @ to add organisation (applies to)';
  orgInput.setAttribute('aria-label', 'Organisation');

  const contactInput = document.createElement('input');
  contactInput.type = 'text';
  contactInput.placeholder = 'Type @ to add application contact';
  contactInput.setAttribute('aria-label', 'Application contact');

  const refereeInput = document.createElement('input');
  refereeInput.type = 'text';
  refereeInput.placeholder = 'Type @ to add referee';
  refereeInput.setAttribute('aria-label', 'Referee');

  const refereeRole = document.createElement('select');
  refereeRole.setAttribute('aria-label', 'Referee role');
  for (const value of ['professional', 'character', 'academic'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    refereeRole.append(option);
  }

  const knowledgeInput = document.createElement('input');
  knowledgeInput.type = 'text';
  knowledgeInput.placeholder = 'Type @ to link a Knowledge page';
  knowledgeInput.setAttribute('aria-label', 'Related knowledge page');

  const chipsHost = el('div', 'application-form__chips');
  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => undefined
  });

  const orgPicker = createEntityPicker({
    input: orgInput,
    allowedKinds: ['organisation'],
    emptyText: 'No matching organisations.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'organisation', { signal });
      return {
        groups: {
          person: result.groups.person,
          organisation: result.groups.organisation,
          task: result.groups.task
        }
      };
    },
    onSelect: (item) => {
      chipList.addPending({
        id: `pending:${item.ref}:applies_to`,
        ref: item.ref,
        label: `${item.display_label} (applies to)`,
        relationshipType: 'applies_to',
        state: 'pending',
        href: item.href ?? null
      });
    }
  });

  const contactPicker = createEntityPicker({
    input: contactInput,
    allowedKinds: ['person'],
    emptyText: 'No matching people.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'person', { signal });
      return {
        groups: {
          person: result.groups.person,
          organisation: result.groups.organisation,
          task: result.groups.task
        }
      };
    },
    onSelect: (item) => {
      chipList.addPending({
        id: `pending:${item.ref}:application_contact`,
        ref: item.ref,
        label: `${item.display_label} (contact)`,
        relationshipType: 'application_contact',
        state: 'pending',
        href: item.href ?? null
      });
    }
  });

  const refereePicker = createEntityPicker({
    input: refereeInput,
    allowedKinds: ['person'],
    emptyText: 'No matching people.',
    search: async (query, signal) => {
      const result = await searchEntities(query, 'person', { signal });
      return {
        groups: {
          person: result.groups.person,
          organisation: result.groups.organisation,
          task: result.groups.task
        }
      };
    },
    onSelect: (item) => {
      const role = refereeRole.value as RefereeRole;
      chipList.addPending({
        id: `pending:${item.ref}:referee:${role}`,
        ref: item.ref,
        label: `${item.display_label} (referee · ${role})`,
        relationshipType: 'referee',
        state: 'pending',
        supportingLabel: role,
        href: item.href ?? null
      });
    }
  });

  const knowledgePicker = mountKnowledgePagePicker({
    input: knowledgeInput,
    onSelect: (item) => {
      chipList.addPending({
        id: `pending:${item.ref}:related_to`,
        ref: item.ref,
        label: item.display_label,
        relationshipType: 'related_to',
        state: 'pending',
        href: item.href
      });
    }
  });

  const status = el('p', 'application-form__status');
  status.hidden = true;
  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'submit';
  const cancel = el('a', 'btn btn--ghost', 'Cancel');
  cancel.href = '#/applications';

  form.append(
    el('label', undefined, 'Position title'),
    positionTitle,
    el('label', undefined, 'Advertisement title'),
    adTitle,
    el('label', undefined, 'Advertisement URL'),
    adUrl,
    el('label', undefined, 'Advertisement source'),
    adSource,
    el('label', undefined, 'Advertisement summary'),
    adSummary,
    el('label', undefined, 'Closing date'),
    closingDate,
    el('label', undefined, 'Organisation (applies to)'),
    orgInput,
    orgPicker.root,
    el('label', undefined, 'Application contact'),
    contactInput,
    contactPicker.root,
    el('label', undefined, 'Referee role for next pick'),
    refereeRole,
    el('label', undefined, 'Referee'),
    refereeInput,
    refereePicker.root,
    el('label', undefined, 'Related Knowledge page'),
    knowledgeInput,
    knowledgePicker.root,
    chipsHost,
    status,
    save,
    cancel
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.hidden = true;
    save.disabled = true;
    const pending = chipList.getChips().filter((chip) => chip.state === 'pending');
    const links = pending.map((chip) => {
      if (chip.relationshipType === 'referee') {
        return {
          target_ref: chip.ref,
          relationship_type: 'referee' as const,
          role: (chip.supportingLabel as RefereeRole) || 'professional'
        };
      }
      if (chip.relationshipType === 'application_contact') {
        return {
          target_ref: chip.ref,
          relationship_type: 'application_contact' as const
        };
      }
      if (chip.relationshipType === 'related_to') {
        return {
          target_ref: chip.ref,
          relationship_type: 'related_to' as const
        };
      }
      return {
        target_ref: chip.ref,
        relationship_type: 'applies_to' as const
      };
    });
    try {
      const result = await createApplication({
        position_title: positionTitle.value,
        advertisement: {
          title: adTitle.value || null,
          url: adUrl.value || null,
          source: adSource.value || null,
          summary: adSummary.value || null
        },
        closing_date: closingDate.value || null,
        links
      });
      window.location.hash = applicationRoute(result.application.id);
    } catch (err) {
      if (isApplicationIncompleteLinksError(err)) {
        window.location.hash = applicationRoute(err.data.application_id);
        return;
      }
      status.hidden = false;
      status.textContent = err instanceof ApiClientError ? err.message : 'Save failed.';
      save.disabled = false;
    }
  });

  canvas.append(form);
}

export async function renderApplicationDetailView(
  canvas: HTMLElement,
  id: string,
  options: { onTitleReady?: (title: string) => void; isCurrent?: () => boolean } = {}
): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const { application } = await getApplication(id);
      if (options.isCurrent && !options.isCurrent()) return;
      paint(application);
    } catch (err) {
      if (options.isCurrent && !options.isCurrent()) return;
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(record: ApplicationRecord): void {
    canvas.replaceChildren();
    options.onTitleReady?.(record.position_title);

    const back = el('a', 'btn btn--ghost', 'Back to Applications');
    back.href = '#/applications';

    const facts = el('div', 'application-detail__facts');
    facts.append(
      el('p', undefined, `Pipeline · ${statusLabel(record.pipeline_status)}`),
      el(
        'p',
        undefined,
        record.closing_date
          ? `Closing · ${formatDisplayDate(record.closing_date) ?? record.closing_date}`
          : 'No closing date'
      ),
      el('p', undefined, record.advertisement.title || 'No advertisement title'),
      el('p', undefined, record.advertisement.url || 'No advertisement URL'),
      el('p', undefined, record.advertisement.source || 'No advertisement source'),
      el('p', undefined, record.advertisement.summary || 'No advertisement summary'),
      el(
        'p',
        undefined,
        `Outcome · ${record.outcome.status}${record.outcome.date ? ` · ${record.outcome.date}` : ''}`
      ),
      el('p', undefined, record.outcome.offer_details || 'No offer details'),
      el('p', undefined, record.outcome.reason || 'No outcome reason'),
      el('p', undefined, record.reflection || 'No reflection')
    );

    if (record.documents.length) {
      const docs = el('section', 'application-detail__section');
      docs.append(el('h2', undefined, 'Documents'));
      for (const doc of record.documents) {
        docs.append(
          el(
            'p',
            undefined,
            `${doc.document_type} · ${doc.label} · v${doc.version} · ${doc.status}`
          )
        );
      }
      facts.append(docs);
    }

    if (record.selection_criteria.length) {
      const criteria = el('section', 'application-detail__section');
      criteria.append(el('h2', undefined, 'Selection criteria'));
      const sorted = [...record.selection_criteria].sort((a, b) => a.order - b.order);
      for (const criterion of sorted) {
        criteria.append(
          el(
            'p',
            undefined,
            `${criterion.order}. ${criterion.criterion}${criterion.completed ? ' (done)' : ''}`
          )
        );
        if (criterion.response) criteria.append(el('p', undefined, criterion.response));
      }
      facts.append(criteria);
    }

    if (record.interview_rounds.length) {
      const rounds = el('section', 'application-detail__section');
      rounds.append(el('h2', undefined, 'Interview rounds'));
      for (const round of record.interview_rounds) {
        rounds.append(
          el(
            'p',
            undefined,
            [
              round.format,
              round.lifecycle_state,
              round.scheduled_at
                ? formatDisplayDate(round.scheduled_at) ?? round.scheduled_at
                : null,
              round.result
            ]
              .filter(Boolean)
              .join(' · ')
          )
        );
      }
      facts.append(rounds);
    }

    const actions = el('div', 'application-detail__actions');
    const actionStatus = el('p', 'application-form__status');
    actionStatus.hidden = true;

    async function runAction(
      label: string,
      fn: () => Promise<{ application: ApplicationRecord }>
    ): Promise<void> {
      actionStatus.hidden = true;
      try {
        const result = await fn();
        paint(result.application);
      } catch (err) {
        actionStatus.hidden = false;
        actionStatus.textContent = err instanceof ApiClientError ? err.message : `${label} failed.`;
      }
    }

    const nextStates = APPLICATION_PIPELINE_TRANSITIONS[record.pipeline_status] ?? [];
    for (const next of nextStates) {
      const button = el('button', 'btn btn--secondary', `Move to ${statusLabel(next)}`) as HTMLButtonElement;
      button.type = 'button';
      button.dataset.pipelineTransition = next;
      button.addEventListener('click', () =>
        void runAction(`Transition to ${next}`, () => transitionApplication(record.id, next))
      );
      actions.append(button);
    }

    const docsForm = mountDocumentsForm(record, (patch) =>
      runAction('Update documents', () => updateApplication(record.id, patch))
    );
    const criteriaForm = mountCriteriaForm(record, (patch) =>
      runAction('Update criteria', () => updateApplication(record.id, patch))
    );
    const interviewsForm = mountInterviewsForm(record, (patch) =>
      runAction('Update interviews', () => updateApplication(record.id, patch))
    );
    const outcomeForm = mountOutcomeForm(record, (patch) =>
      runAction('Update outcome', () => updateApplication(record.id, patch))
    );
    const reflectionForm = mountReflectionForm(record, (patch) =>
      runAction('Update reflection', () => updateApplication(record.id, patch))
    );

    const relationships = el('section', 'application-detail__relationships');
    relationships.append(el('p', undefined, 'Loading relationships…'));

    const taskPanels = el('div', 'application-detail__task-panels');
    mountTaskLinkPanel({
      host: taskPanels,
      heading: 'Application action Task',
      relationshipType: 'application_action',
      incompleteOperationId:
        record.application_action_operation?.status === 'incomplete'
          ? record.application_action_operation.operation_id
          : null,
      statusMessage:
        record.application_action_operation?.status === 'committed'
          ? `Application action Task ${record.application_action_operation.task_id}`
          : record.application_action_operation?.status === 'incomplete'
            ? 'Application action link incomplete.'
            : null,
      onSubmit: async (input) => {
        try {
          const result = await linkApplicationTask(record.id, {
            relationship_type: 'application_action',
            ...input
          });
          paint(result.application);
        } catch (err) {
          if (isApplicationTaskLinkIncompleteError(err)) {
            await load();
            return;
          }
          throw err;
        }
      },
      onRetry: async (operationId) => {
        const result = await retryApplicationTaskLink(record.id, operationId);
        paint(result.application);
      }
    });

    canvas.append(
      back,
      facts,
      actions,
      actionStatus,
      docsForm,
      criteriaForm,
      interviewsForm,
      outcomeForm,
      reflectionForm,
      relationships,
      taskPanels
    );

    void mountApplicationRelationshipEditor({
      host: relationships,
      applicationId: record.id,
      onChanged: () => void load()
    });

    if (record.incomplete_links) {
      const incomplete = el('section', 'application-detail__incomplete');
      incomplete.append(
        el(
          'p',
          undefined,
          `Incomplete links (operation ${record.incomplete_links.operation_id}).`
        )
      );
      const retry = el('button', 'btn btn--primary', 'Retry links') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          const result = await retryApplicationLinks(record.id);
          paint(result.application);
        } catch (err) {
          if (isApplicationIncompleteLinksError(err)) {
            await load();
            return;
          }
          incomplete.append(
            el('p', undefined, err instanceof ApiClientError ? err.message : 'Retry failed.')
          );
          retry.disabled = false;
        }
      });
      incomplete.append(retry);
      canvas.append(incomplete);
    }
  }

  await load();
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function mountDocumentsForm(
  record: ApplicationRecord,
  onSave: (patch: {
    documents: Array<Partial<ApplicationDocument> & {
      document_type: string;
      label: string;
      version: string;
      status: string;
    }>;
  }) => Promise<void>
): HTMLElement {
  const section = el('section', 'application-detail__edit');
  section.append(el('h2', undefined, 'Documents'));
  const list = el('ul', 'application-detail__editable-list');
  section.append(list);

  function paintList(): void {
    list.replaceChildren();
    for (const doc of record.documents) {
      const item = document.createElement('li');
      item.dataset.documentId = doc.id;
      item.append(
        el(
          'p',
          undefined,
          `${doc.document_type} · ${doc.label} · v${doc.version} · ${doc.status}`
        )
      );
      const url = document.createElement('input');
      url.type = 'url';
      url.value = doc.url ?? '';
      url.placeholder = 'URL';
      url.setAttribute('aria-label', `Document URL ${doc.label}`);
      const storage = document.createElement('input');
      storage.type = 'text';
      storage.value = doc.storage_ref ?? '';
      storage.placeholder = 'Storage reference';
      storage.setAttribute('aria-label', `Document storage reference ${doc.label}`);
      const label = document.createElement('input');
      label.type = 'text';
      label.value = doc.label;
      label.setAttribute('aria-label', `Document label ${doc.id}`);
      const save = el('button', 'btn btn--secondary', 'Save document') as HTMLButtonElement;
      save.type = 'button';
      save.addEventListener('click', () => {
        const next = record.documents.map((entry) =>
          entry.id === doc.id
            ? {
                ...entry,
                label: label.value.trim() || entry.label,
                url: url.value.trim() || null,
                storage_ref: storage.value.trim() || null
              }
            : entry
        );
        void onSave({ documents: next });
      });
      const remove = el('button', 'btn btn--ghost', 'Remove') as HTMLButtonElement;
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove document ${doc.label}`);
      remove.addEventListener('click', () => {
        void onSave({ documents: record.documents.filter((entry) => entry.id !== doc.id) });
      });
      item.append(label, url, storage, save, remove);
      list.append(item);
    }
  }
  paintList();

  const form = document.createElement('form');
  form.className = 'application-detail__add';
  const type = document.createElement('select');
  type.setAttribute('aria-label', 'Document type');
  for (const value of ['resume', 'cover_letter', 'selection_criteria', 'other'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    type.append(option);
  }
  const label = document.createElement('input');
  label.type = 'text';
  label.placeholder = 'Document label';
  label.setAttribute('aria-label', 'Document label');
  const version = document.createElement('input');
  version.type = 'text';
  version.value = '1';
  version.setAttribute('aria-label', 'Document version');
  const url = document.createElement('input');
  url.type = 'url';
  url.placeholder = 'URL';
  url.setAttribute('aria-label', 'Document URL');
  const storage = document.createElement('input');
  storage.type = 'text';
  storage.placeholder = 'Storage reference';
  storage.setAttribute('aria-label', 'Document storage reference');
  const docStatus = document.createElement('select');
  docStatus.setAttribute('aria-label', 'Document status');
  for (const value of ['draft', 'final', 'submitted'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    docStatus.append(option);
  }
  const save = el('button', 'btn btn--secondary', 'Add document') as HTMLButtonElement;
  save.type = 'submit';
  form.append(type, label, version, url, storage, docStatus, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!label.value.trim()) return;
    if (!url.value.trim() && !storage.value.trim()) return;
    await onSave({
      documents: [
        ...record.documents,
        {
          id: newId('adoc'),
          document_type: type.value as ApplicationDocument['document_type'],
          label: label.value.trim(),
          url: url.value.trim() || null,
          storage_ref: storage.value.trim() || null,
          version: version.value.trim() || '1',
          status: docStatus.value as ApplicationDocument['status']
        }
      ]
    });
  });
  section.append(form);
  return section;
}

function mountCriteriaForm(
  record: ApplicationRecord,
  onSave: (patch: {
    selection_criteria: Array<Partial<SelectionCriterion> & {
      criterion: string;
      order: number;
      completed: boolean;
    }>;
  }) => Promise<void>
): HTMLElement {
  const section = el('section', 'application-detail__edit');
  section.append(el('h2', undefined, 'Selection criteria'));
  const list = el('ul', 'application-detail__editable-list');
  section.append(list);
  const sorted = [...record.selection_criteria].sort((a, b) => a.order - b.order);
  for (const criterion of sorted) {
    const item = document.createElement('li');
    item.dataset.criterionId = criterion.id;
    const text = document.createElement('input');
    text.type = 'text';
    text.value = criterion.criterion;
    text.setAttribute('aria-label', `Criterion ${criterion.id}`);
    const response = document.createElement('textarea');
    response.rows = 2;
    response.value = criterion.response ?? '';
    response.setAttribute('aria-label', `Criterion response ${criterion.id}`);
    const completed = document.createElement('input');
    completed.type = 'checkbox';
    completed.checked = criterion.completed;
    completed.setAttribute('aria-label', `Complete criterion ${criterion.id}`);
    const up = el('button', 'btn btn--ghost', 'Up') as HTMLButtonElement;
    up.type = 'button';
    up.setAttribute('aria-label', `Move criterion ${criterion.id} up`);
    up.addEventListener('click', () => {
      const next = [...sorted];
      const index = next.findIndex((entry) => entry.id === criterion.id);
      if (index <= 0) return;
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      void onSave({
        selection_criteria: next.map((entry, order) => ({ ...entry, order: order + 1 }))
      });
    });
    const down = el('button', 'btn btn--ghost', 'Down') as HTMLButtonElement;
    down.type = 'button';
    down.setAttribute('aria-label', `Move criterion ${criterion.id} down`);
    down.addEventListener('click', () => {
      const next = [...sorted];
      const index = next.findIndex((entry) => entry.id === criterion.id);
      if (index < 0 || index >= next.length - 1) return;
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      void onSave({
        selection_criteria: next.map((entry, order) => ({ ...entry, order: order + 1 }))
      });
    });
    const save = el('button', 'btn btn--secondary', 'Save') as HTMLButtonElement;
    save.type = 'button';
    save.addEventListener('click', () => {
      void onSave({
        selection_criteria: record.selection_criteria.map((entry) =>
          entry.id === criterion.id
            ? {
                ...entry,
                criterion: text.value.trim() || entry.criterion,
                response: response.value.trim() || null,
                completed: completed.checked
              }
            : entry
        )
      });
    });
    const remove = el('button', 'btn btn--ghost', 'Remove') as HTMLButtonElement;
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove criterion ${criterion.id}`);
    remove.addEventListener('click', () => {
      const next = record.selection_criteria
        .filter((entry) => entry.id !== criterion.id)
        .sort((a, b) => a.order - b.order)
        .map((entry, order) => ({ ...entry, order: order + 1 }));
      void onSave({ selection_criteria: next });
    });
    item.append(text, response, completed, up, down, save, remove);
    list.append(item);
  }

  const form = document.createElement('form');
  form.className = 'application-detail__add';
  const criterion = document.createElement('input');
  criterion.type = 'text';
  criterion.placeholder = 'Criterion';
  criterion.setAttribute('aria-label', 'Selection criterion');
  const response = document.createElement('textarea');
  response.rows = 2;
  response.placeholder = 'Response';
  response.setAttribute('aria-label', 'Criterion response');
  const save = el('button', 'btn btn--secondary', 'Add criterion') as HTMLButtonElement;
  save.type = 'submit';
  form.append(criterion, response, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!criterion.value.trim()) return;
    await onSave({
      selection_criteria: [
        ...record.selection_criteria,
        {
          id: newId('acrit'),
          criterion: criterion.value.trim(),
          response: response.value.trim() || null,
          order: record.selection_criteria.length + 1,
          completed: false
        }
      ]
    });
  });
  section.append(form);
  return section;
}

function mountInterviewsForm(
  record: ApplicationRecord,
  onSave: (patch: {
    interview_rounds: Array<Partial<InterviewRound> & {
      format: string;
      lifecycle_state: string;
    }>;
  }) => Promise<void>
): HTMLElement {
  const section = el('section', 'application-detail__edit');
  section.append(el('h2', undefined, 'Interview rounds'));
  const list = el('ul', 'application-detail__editable-list');
  section.append(list);

  for (const round of record.interview_rounds) {
    const item = document.createElement('li');
    item.dataset.interviewId = round.id;
    const zone = document.createElement('input');
    zone.type = 'text';
    zone.value = round.time_zone ?? 'Australia/Sydney';
    zone.setAttribute('aria-label', `Interview time zone ${round.id}`);
    const when = document.createElement('input');
    when.type = 'datetime-local';
    when.value =
      round.scheduled_at && round.time_zone
        ? utcIsoToWallLocal(round.scheduled_at, round.time_zone)
        : '';
    when.setAttribute('aria-label', `Interview date and time ${round.id}`);
    const format = document.createElement('select');
    format.setAttribute('aria-label', `Interview format ${round.id}`);
    for (const value of ['in_person', 'video', 'phone', 'other'] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (value === round.format) option.selected = true;
      format.append(option);
    }
    const location = document.createElement('input');
    location.type = 'text';
    location.value = round.location_text ?? '';
    location.setAttribute('aria-label', `Interview location ${round.id}`);
    const prep = document.createElement('textarea');
    prep.rows = 2;
    prep.value = round.preparation_notes ?? '';
    prep.setAttribute('aria-label', `Interview preparation notes ${round.id}`);
    const panel = document.createElement('textarea');
    panel.rows = 2;
    panel.value = round.panel_notes ?? '';
    panel.setAttribute('aria-label', `Interview panel notes ${round.id}`);
    const result = document.createElement('select');
    result.setAttribute('aria-label', `Interview result ${round.id}`);
    for (const value of ['pending', 'advanced', 'unsuccessful', 'withdrawn'] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if ((round.result ?? 'pending') === value) option.selected = true;
      result.append(option);
    }
    const lifecycle = document.createElement('select');
    lifecycle.setAttribute('aria-label', `Interview lifecycle ${round.id}`);
    for (const value of ['planned', 'completed', 'cancelled'] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (value === round.lifecycle_state) option.selected = true;
      lifecycle.append(option);
    }
    const save = el('button', 'btn btn--secondary', 'Save interview') as HTMLButtonElement;
    save.type = 'button';
    save.addEventListener('click', () => {
      const timeZone = zone.value.trim() || null;
      let scheduledAt: string | null = null;
      if (when.value && timeZone) {
        scheduledAt = wallLocalToUtcIso(when.value, timeZone);
      }
      void onSave({
        interview_rounds: record.interview_rounds.map((entry) =>
          entry.id === round.id
            ? {
                ...entry,
                scheduled_at: scheduledAt,
                time_zone: timeZone,
                format: format.value as InterviewRound['format'],
                location_text: location.value.trim() || null,
                preparation_notes: prep.value.trim() || null,
                panel_notes: panel.value.trim() || null,
                result: result.value as InterviewRound['result'],
                lifecycle_state: lifecycle.value as InterviewRound['lifecycle_state']
              }
            : entry
        )
      });
    });
    const complete = el('button', 'btn btn--ghost', 'Complete') as HTMLButtonElement;
    complete.type = 'button';
    complete.addEventListener('click', () => {
      void onSave({
        interview_rounds: record.interview_rounds.map((entry) =>
          entry.id === round.id ? { ...entry, lifecycle_state: 'completed' } : entry
        )
      });
    });
    const cancel = el('button', 'btn btn--ghost', 'Cancel round') as HTMLButtonElement;
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      void onSave({
        interview_rounds: record.interview_rounds.map((entry) =>
          entry.id === round.id ? { ...entry, lifecycle_state: 'cancelled' } : entry
        )
      });
    });
    const remove = el('button', 'btn btn--ghost', 'Remove') as HTMLButtonElement;
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove interview ${round.id}`);
    remove.addEventListener('click', () => {
      void onSave({
        interview_rounds: record.interview_rounds.filter((entry) => entry.id !== round.id)
      });
    });
    item.append(when, zone, format, location, prep, panel, result, lifecycle, save, complete, cancel, remove);
    list.append(item);
  }

  const form = document.createElement('form');
  form.className = 'application-detail__add';
  const format = document.createElement('select');
  format.setAttribute('aria-label', 'Interview format');
  for (const value of ['in_person', 'video', 'phone', 'other'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    format.append(option);
  }
  const zone = document.createElement('input');
  zone.type = 'text';
  zone.value = 'Australia/Sydney';
  zone.setAttribute('aria-label', 'Interview time zone');
  const when = document.createElement('input');
  when.type = 'datetime-local';
  when.setAttribute('aria-label', 'Interview date and time');
  const location = document.createElement('input');
  location.type = 'text';
  location.placeholder = 'Location';
  location.setAttribute('aria-label', 'Interview location');
  const prep = document.createElement('textarea');
  prep.rows = 2;
  prep.placeholder = 'Preparation notes';
  prep.setAttribute('aria-label', 'Interview preparation notes');
  const save = el('button', 'btn btn--secondary', 'Add interview') as HTMLButtonElement;
  save.type = 'submit';
  form.append(format, zone, when, location, prep, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const timeZone = zone.value.trim() || null;
    let scheduledAt: string | null = null;
    if (when.value && timeZone) {
      scheduledAt = wallLocalToUtcIso(when.value, timeZone);
    }
    await onSave({
      interview_rounds: [
        ...record.interview_rounds,
        {
          id: newId('aint'),
          scheduled_at: scheduledAt,
          time_zone: timeZone,
          format: format.value as InterviewRound['format'],
          location_text: location.value.trim() || null,
          preparation_notes: prep.value.trim() || null,
          panel_notes: null,
          result: 'pending',
          lifecycle_state: 'planned'
        }
      ]
    });
  });
  section.append(form);
  return section;
}

async function mountApplicationRelationshipEditor(options: {
  host: HTMLElement;
  applicationId: string;
  onChanged: () => void | Promise<void>;
}): Promise<void> {
  const { host, applicationId, onChanged } = options;
  const sourceRef = applicationRef(applicationId);
  host.replaceChildren(el('h2', undefined, 'Relationships'), el('p', undefined, 'Loading relationships…'));

  try {
    const { outgoing, incoming } = await listUniversalLinksForEntity(sourceRef);
    const currentOutgoing = outgoing.filter((entry) => entry.link.status === 'current');
    const currentIncoming = incoming.filter((entry) => entry.link.status === 'current');
    host.replaceChildren();
    host.append(el('h2', undefined, 'Relationships'));

    const outList = el('ul', 'application-detail__relationship-list');
    outList.setAttribute('aria-label', 'Outgoing relationships');
    if (!currentOutgoing.length) {
      outList.append(el('li', 'empty-state', 'No outgoing organisation, contact, referee, or knowledge links yet.'));
    }
    for (const entry of currentOutgoing) {
      const item = document.createElement('li');
      const label =
        entry.endpoint?.display_label ?? entry.link.target_ref ?? entry.link.source_ref;
      const role =
        typeof entry.link.role === 'string' && entry.link.role ? ` (${entry.link.role})` : '';
      item.append(
        el('span', undefined, `${entry.link.relationship_type} · ${label}${role} · owned`)
      );
      const remove = el('button', 'btn btn--ghost', 'Remove') as HTMLButtonElement;
      remove.type = 'button';
      remove.setAttribute(
        'aria-label',
        `Remove ${entry.link.relationship_type} link to ${label}`
      );
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await endUniversalLink(entry.link.id, {});
          await onChanged();
        } catch (err) {
          host.append(
            el(
              'p',
              undefined,
              err instanceof ApiClientError ? err.message : 'Could not remove relationship.'
            )
          );
          remove.disabled = false;
        }
      });
      item.append(remove);
      outList.append(item);
    }
    host.append(outList);

    const inList = el('ul', 'application-detail__relationship-list');
    inList.setAttribute('aria-label', 'Incoming relationships');
    for (const entry of currentIncoming) {
      const item = document.createElement('li');
      const label =
        entry.endpoint?.display_label ?? entry.link.source_ref ?? entry.link.target_ref;
      item.append(
        el(
          'span',
          undefined,
          `${entry.link.relationship_type} · ${label} · incoming (owned by ${entry.link.source_ref})`
        )
      );
      item.dataset.readonly = 'true';
      inList.append(item);
    }
    if (currentIncoming.length) host.append(inList);

    function addPicker(
      ariaLabel: string,
      placeholder: string,
      kinds: Array<'organisation' | 'person' | 'task'>,
      relationshipType: 'applies_to' | 'application_contact' | 'referee' | 'related_to',
      roleSelect?: HTMLSelectElement
    ): void {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.setAttribute('aria-label', ariaLabel);
      const chipsHost = el('div', 'application-detail__picker-chips');
      host.append(input, chipsHost);
      if (roleSelect) host.append(roleSelect);
      createEntityPicker({
        input,
        allowedKinds: kinds,
        emptyText: 'No matches.',
        search: async (query, signal) => {
          const kind = kinds[0];
          const result = await searchEntities(query, kind, { signal });
          return {
            groups: {
              person: result.groups.person,
              organisation: result.groups.organisation,
              task: result.groups.task
            }
          };
        },
        onSelect: (item) => {
          void (async () => {
            try {
              await createUniversalLink({
                source_ref: sourceRef,
                target_ref: item.ref,
                relationship_type: relationshipType,
                role: roleSelect ? roleSelect.value : null
              });
              await onChanged();
            } catch (err) {
              host.append(
                el(
                  'p',
                  undefined,
                  err instanceof ApiClientError ? err.message : 'Could not add relationship.'
                )
              );
            }
          })();
        }
      });
    }

    addPicker('Organisation', 'Type @ to set organisation (applies to)', ['organisation'], 'applies_to');
    addPicker('Application contact', 'Type @ to add application contact', ['person'], 'application_contact');
    const refereeRole = document.createElement('select');
    refereeRole.setAttribute('aria-label', 'Referee role');
    for (const value of ['professional', 'character', 'academic'] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      refereeRole.append(option);
    }
    addPicker('Referee', 'Type @ to add referee', ['person'], 'referee', refereeRole);

    const knowledgeInput = document.createElement('input');
    knowledgeInput.type = 'text';
    knowledgeInput.placeholder = 'Type @ to link a Knowledge page';
    knowledgeInput.setAttribute('aria-label', 'Related knowledge page');
    host.append(knowledgeInput);
    mountKnowledgePagePicker({
      input: knowledgeInput,
      onSelect: (item) => {
        void (async () => {
          try {
            await createUniversalLink({
              source_ref: sourceRef,
              target_ref: item.ref,
              relationship_type: 'related_to'
            });
            await onChanged();
          } catch (err) {
            host.append(
              el(
                'p',
                undefined,
                err instanceof ApiClientError ? err.message : 'Could not add knowledge link.'
              )
            );
          }
        })();
      }
    });
  } catch (err) {
    host.replaceChildren(
      el('h2', undefined, 'Relationships'),
      el(
        'p',
        'empty-state',
        err instanceof ApiClientError ? err.message : 'Relationships unavailable.'
      )
    );
  }
}

function mountOutcomeForm(
  record: ApplicationRecord,
  onSave: (patch: {
    outcome: {
      status: OutcomeStatus;
      date: string | null;
      offer_details: string | null;
      reason: string | null;
    };
  }) => Promise<void>
): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'application-detail__edit';
  form.append(el('h2', undefined, 'Edit outcome'));
  const status = document.createElement('select');
  status.setAttribute('aria-label', 'Outcome status');
  for (const value of ['none', 'offer', 'accepted', 'declined', 'unsuccessful'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    if (value === record.outcome.status) option.selected = true;
    status.append(option);
  }
  const date = document.createElement('input');
  date.type = 'date';
  date.value = record.outcome.date?.slice(0, 10) ?? '';
  date.setAttribute('aria-label', 'Outcome date');
  const details = document.createElement('textarea');
  details.rows = 2;
  details.value = record.outcome.offer_details ?? '';
  details.setAttribute('aria-label', 'Offer details');
  const reason = document.createElement('input');
  reason.type = 'text';
  reason.value = record.outcome.reason ?? '';
  reason.setAttribute('aria-label', 'Outcome reason');
  const save = el('button', 'btn btn--secondary', 'Update outcome') as HTMLButtonElement;
  save.type = 'submit';
  form.append(status, date, details, reason, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await onSave({
      outcome: {
        status: status.value as OutcomeStatus,
        date: date.value || null,
        offer_details: details.value.trim() || null,
        reason: reason.value.trim() || null
      }
    });
  });
  return form;
}

function mountReflectionForm(
  record: ApplicationRecord,
  onSave: (patch: { reflection: string | null }) => Promise<void>
): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'application-detail__edit';
  form.append(el('h2', undefined, 'Edit reflection'));
  const reflection = document.createElement('textarea');
  reflection.rows = 4;
  reflection.value = record.reflection ?? '';
  reflection.setAttribute('aria-label', 'Reflection');
  const save = el('button', 'btn btn--secondary', 'Update reflection') as HTMLButtonElement;
  save.type = 'submit';
  form.append(reflection, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await onSave({ reflection: reflection.value.trim() || null });
  });
  return form;
}
