import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import {
  createFollowUpTask,
  getCommunication,
  isFollowUpIncompleteError,
  isIncompleteLinksError,
  listCommunications,
  retryCommunicationLinks,
  retryFollowUpTask,
  updateCommunication
} from '@/api/communications';
import { ApiClientError } from '@/api/client';
import { communicationRoute } from '@/app/router';
import type { CommunicationRecord, FollowUpOperationProjection } from '@/domain/types';
import { createAutoRetry, type AutoRetryHandle } from '@/lib/auto-retry';
import { renderScheduleDbPage, type ScheduleDbRow } from '@/components/schedule-db-page';
import { renderLoadError, showViewLoading } from '@/views/feedback';

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

function labelFor(record: CommunicationRecord): string {
  const subject = record.subject.trim();
  if (subject) return subject;
  return `${record.direction} ${record.channel.replace(/_/g, ' ')}`;
}

function notionPageHref(id: string): string | null {
  const match = /^notion_([0-9a-f]{32})$/i.exec(id);
  return match ? `https://www.notion.so/${match[1]}` : null;
}

function toRow(record: CommunicationRecord): ScheduleDbRow {
  const rawWhen = record.scheduled_start || record.occurred_at;
  const when =
    rawWhen && !String(rawWhen).startsWith('1970-01-01') ? rawWhen : '';
  const notionHref = notionPageHref(record.id);
  // Notion import has no inbound/outbound — channel filters only.
  const filterTokens = notionHref
    ? [record.channel]
    : [record.direction, record.channel];
  return {
    id: record.id,
    title: labelFor(record),
    href: notionHref ?? communicationRoute(record.id),
    when,
    meta: notionHref
      ? [record.channel.replace(/_/g, ' ')]
      : [record.direction, record.channel.replace(/_/g, ' ')],
    filterTokens,
    facetKey: record.channel,
    facetLabel: record.channel.replace(/_/g, ' ')
  };
}

export async function renderCommunicationsView(
  canvas: HTMLElement,
  options: { isCurrent?: () => boolean } = {}
): Promise<void> {
  await renderScheduleDbPage(canvas, {
    kind: 'comms',
    title: 'Comms',
    searchPlaceholder: 'Search subject or channel',
    searchAriaLabel: 'Search communications',
    emptyMessage: 'No communications yet.',
    primaryAction: { label: 'Log a conversation', href: '#/communication/new' },
    listHash: '#/communications',
    isCurrent: options.isCurrent,
    loadRows: async () => {
      const { communications } = await listCommunications();
      return communications.map(toRow);
    }
  });
}

export async function renderCommunicationDetailView(
  canvas: HTMLElement,
  id: string,
  options: { onTitleReady?: (title: string) => void; isCurrent?: () => boolean } = {}
): Promise<void> {
  showViewLoading(canvas, 'Loading…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading…');
    try {
      const { communication } = await getCommunication(id);
      if (options.isCurrent && !options.isCurrent()) return;
      paint(communication);
    } catch (err) {
      if (options.isCurrent && !options.isCurrent()) return;
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(record: CommunicationRecord): void {
    canvas.replaceChildren();
    options.onTitleReady?.(labelFor(record));

    const back = el('a', 'btn btn--ghost', 'Back to Communications');
    back.href = '#/communications';

    const facts = el('div', 'communication-detail__facts');
    facts.append(
      el('p', undefined, `${record.direction} · ${record.channel.replace(/_/g, ' ')} · ${record.status}`),
      el('p', undefined, formatDisplayDate(record.occurred_at) ?? record.occurred_at),
      el('p', undefined, record.subject || '(no subject)'),
      el('p', undefined, record.summary || '(no summary)')
    );

    const edit = document.createElement('form');
    edit.className = 'communication-detail__edit';
    const subject = document.createElement('input');
    subject.type = 'text';
    subject.value = record.subject;
    subject.setAttribute('aria-label', 'Subject');
    const summary = document.createElement('textarea');
    summary.rows = 4;
    summary.value = record.summary;
    summary.setAttribute('aria-label', 'Summary');
    const save = el('button', 'btn btn--secondary', 'Update subject and summary') as HTMLButtonElement;
    save.type = 'submit';
    const editStatus = el('p', 'communication-form__status');
    editStatus.hidden = true;
    edit.append(subject, summary, save, editStatus);
    edit.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        const updated = await updateCommunication(record.id, {
          subject: subject.value,
          summary: summary.value
        });
        paint(updated.communication);
      } catch (err) {
        editStatus.hidden = false;
        editStatus.textContent = err instanceof ApiClientError ? err.message : 'Update failed.';
        save.disabled = false;
      }
    });

    canvas.append(back, facts, edit);

    if (record.incomplete_links) {
      const incomplete = el('section', 'communication-detail__incomplete');
      incomplete.append(
        el(
          'p',
          undefined,
          `Incomplete links (operation ${record.incomplete_links.operation_id}). Failed intents: ${
            record.incomplete_links.failed_intent_ids.join(', ') || 'none listed'
          }.`
        )
      );
      const retry = el('button', 'btn btn--primary', 'Retry links') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          const result = await retryCommunicationLinks(record.id);
          paint(result.communication);
        } catch (err) {
          if (isIncompleteLinksError(err)) {
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

    const followUp = buildFollowUpSection(record, paint, load);
    canvas.append(followUp);
  }

  await load();
}

/**
 * The follow-up Task section (auto-retrying link, Plan 1) — shared between
 * the legacy detail view above and the comm page's After face (Plan 2,
 * Task 17), which appends this unchanged rather than re-implementing it.
 */
export function buildFollowUpSection(
  record: CommunicationRecord,
  paint: (next: CommunicationRecord) => void,
  load: () => Promise<void>
): HTMLElement {
  const followUp = el('section', 'communication-detail__follow-up');
  followUp.append(el('h2', undefined, 'Follow up'));
  const followUpStatus = el('p', 'communication-form__status');
  followUpStatus.hidden = true;
  const followUpBtn = el('button', 'btn btn--secondary', 'Create follow up Task') as HTMLButtonElement;
  followUpBtn.type = 'button';

  let followUpRetry: AutoRetryHandle | null = null;

  function paintFollowUpFromOperation(operation: FollowUpOperationProjection): void {
    followUpStatus.hidden = false;
    if (operation.status === 'committed') {
      followUpStatus.textContent = `Follow up Task ${operation.task_id}.`;
      followUpBtn.textContent = 'Create follow up Task';
      followUpBtn.disabled = true;
      followUpBtn.hidden = true;
      return;
    }
    followUpBtn.hidden = true;
    followUpBtn.disabled = true;
    followUpStatus.textContent = 'Linking follow up…';
    followUpRetry?.stop();
    followUpRetry = createAutoRetry({
      run: async () => {
        if (!followUp.isConnected) {
          followUpRetry?.stop();
          return;
        }
        const result = await retryFollowUpTask(record.id);
        paint(result.communication);
      },
      onState: (state, error) => {
        if (state === 'stuck') {
          const reason = error instanceof Error && error.message ? error.message : 'Tasks did not answer.';
          followUpStatus.textContent = `● Follow up still linking. ${reason} It keeps trying.`;
        }
      }
    });
  }

  if (record.follow_up_operation) {
    paintFollowUpFromOperation(record.follow_up_operation);
  }

  followUpBtn.addEventListener('click', async () => {
    followUpBtn.disabled = true;
    followUpStatus.hidden = true;
    try {
      const result = await createFollowUpTask(record.id, {
        title: `Follow up: ${labelFor(record)}`
      });
      paint(result.communication);
    } catch (err) {
      if (isFollowUpIncompleteError(err)) {
        await load();
        return;
      }
      followUpStatus.hidden = false;
      followUpStatus.textContent = err instanceof ApiClientError ? err.message : 'Follow up failed.';
      followUpBtn.disabled = false;
    }
  });
  followUp.append(followUpBtn, followUpStatus);
  return followUp;
}
