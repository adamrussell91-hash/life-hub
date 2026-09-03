import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { ApiClientError } from '@/api/client';
import type { VersionIndexEntry, VersionKind, VersionReason } from '@/schemas/version';
import {
  createCheckpoint,
  getVersion,
  listVersions,
  restoreVersion
} from '@/teacher/version-api';

export const RESTORE_CONFIRM_MESSAGE =
  'Restores editable content only. Students keep the current published version until you republish.';

export const VERSION_REASON_LABEL: Record<VersionReason, string> = {
  save: 'Save',
  publish: 'Publish',
  restore: 'Restore',
  ai_accepted: 'AI accept',
  manual_checkpoint: 'Checkpoint'
};

export interface HistoryPanelOptions {
  kind: VersionKind;
  parentId: string;
  /** Called with the live parent entity returned by restore. */
  onRestored: (live: unknown) => void;
  /** Host element that receives the History toggle + expandable panel. */
  host: HTMLElement;
  /** Hide the History pill so a kebab (or other chrome) can open the panel. */
  hideToggle?: boolean;
}

export interface HistoryPanelHandle {
  dispose(): void;
  refresh(): Promise<void>;
  open(): void;
  close(): void;
}

export function formatReasonLabel(reason: VersionReason): string {
  return VERSION_REASON_LABEL[reason] ?? reason;
}

/** Compact absolute time for list rows (local). */
export function formatVersionTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });

  if (sameDay) return time;

  return `${formatDisplayDate(date)} · ${time}`;
}

export function summarizeVersionSnapshot(
  kind: VersionKind,
  snapshot: unknown
): { title: string; detail: string } {
  if (!snapshot || typeof snapshot !== 'object') {
    return { title: 'Snapshot', detail: 'Unable to summarize this revision.' };
  }

  const record = snapshot as Record<string, unknown>;

  if (kind === 'lesson') {
    const title = typeof record.title === 'string' && record.title.trim()
      ? record.title
      : 'Untitled lesson';
    const blocks = Array.isArray(record.blocks) ? record.blocks.length : 0;
    return {
      title,
      detail: `${blocks} block${blocks === 1 ? '' : 's'}`
    };
  }

  if (kind === 'unit') {
    const title = typeof record.title === 'string' && record.title.trim()
      ? record.title
      : 'Untitled unit';
    const blocks = Array.isArray(record.blocks) ? record.blocks.length : 0;
    return {
      title,
      detail: blocks > 0 ? `${blocks} block${blocks === 1 ? '' : 's'}` : 'No unit blocks'
    };
  }

  const homepage =
    record.homepage && typeof record.homepage === 'object'
      ? (record.homepage as Record<string, unknown>)
      : record;
  const announcements = Array.isArray(homepage.announcements) ? homepage.announcements.length : 0;
  const resources = Array.isArray(homepage.resources) ? homepage.resources.length : 0;
  const custom = Array.isArray(homepage.custom) ? homepage.custom.length : 0;
  const total = announcements + resources + custom;
  return {
    title: 'Class homepage',
    detail: `${total} block${total === 1 ? '' : 's'} (${announcements} announcements · ${resources} resources · ${custom} custom)`
  };
}

function sortEntriesNewestFirst(entries: VersionIndexEntry[]): VersionIndexEntry[] {
  return [...entries].sort((a, b) => b.revision - a.revision);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Mounts a collapsible version-history panel into `host`. Does not redesign
 * the surrounding editor — callers place `host` near Publish / toolbar actions.
 */
export function mountHistoryPanel(options: HistoryPanelOptions): HistoryPanelHandle {
  const { kind, parentId, onRestored, host } = options;
  let disposed = false;
  let open = false;
  let loadingList = false;
  let busy = false;

  const root = document.createElement('div');
  root.className = 'history-panel';
  root.dataset.historyKind = kind;
  root.dataset.historyParentId = parentId;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn--secondary history-panel__toggle';
  toggle.textContent = 'History';
  toggle.setAttribute('aria-expanded', 'false');
  if (options.hideToggle) {
    toggle.hidden = true;
    root.classList.add('history-panel--chromeless');
  }

  const panel = document.createElement('div');
  panel.className = 'history-panel__body glass-panel';
  panel.hidden = true;

  const header = document.createElement('div');
  header.className = 'history-panel__header';

  const heading = document.createElement('h2');
  heading.className = 'history-panel__heading';
  heading.textContent = 'Version history';

  const checkpointButton = document.createElement('button');
  checkpointButton.type = 'button';
  checkpointButton.className = 'btn btn--secondary history-panel__checkpoint';
  checkpointButton.textContent = 'Save checkpoint';

  header.append(heading, checkpointButton);

  const status = document.createElement('p');
  status.className = 'history-panel__status';
  status.hidden = true;

  const list = document.createElement('ul');
  list.className = 'history-panel__list';

  const preview = document.createElement('div');
  preview.className = 'history-panel__preview';
  preview.hidden = true;

  panel.append(header, status, list, preview);
  root.append(toggle, panel);
  host.append(root);

  function setStatus(text: string | null, isError = false): void {
    if (!text) {
      status.hidden = true;
      status.textContent = '';
      status.classList.remove('history-panel__status--error');
      return;
    }
    status.hidden = false;
    status.textContent = text;
    status.classList.toggle('history-panel__status--error', isError);
  }

  function setBusy(next: boolean): void {
    busy = next;
    checkpointButton.disabled = next || loadingList;
    for (const button of list.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = next;
    }
  }

  function clearPreview(): void {
    preview.hidden = true;
    preview.replaceChildren();
  }

  function renderPreview(revision: number, title: string, detail: string): void {
    preview.hidden = false;
    preview.replaceChildren();

    const label = document.createElement('p');
    label.className = 'history-panel__preview-label';
    label.textContent = `Revision ${revision}`;

    const titleEl = document.createElement('p');
    titleEl.className = 'history-panel__preview-title';
    titleEl.textContent = title;

    const detailEl = document.createElement('p');
    detailEl.className = 'history-panel__preview-detail';
    detailEl.textContent = detail;

    preview.append(label, titleEl, detailEl);
  }

  function renderEntries(entries: VersionIndexEntry[]): void {
    list.replaceChildren();
    clearPreview();

    if (entries.length === 0) {
      setStatus('No versions yet. Save a checkpoint to keep a recoverable snapshot.');
      return;
    }

    setStatus(null);
    for (const entry of sortEntriesNewestFirst(entries)) {
      const item = document.createElement('li');
      item.className = 'history-panel__item';
      item.dataset.revision = String(entry.revision);

      const meta = document.createElement('div');
      meta.className = 'history-panel__item-meta';

      const time = document.createElement('span');
      time.className = 'history-panel__time';
      time.textContent = formatVersionTime(entry.created_at);
      time.title = entry.created_at;

      const badge = document.createElement('span');
      badge.className = 'history-panel__reason';
      badge.dataset.reason = entry.reason;
      badge.textContent = formatReasonLabel(entry.reason);

      meta.append(time, badge);

      if (entry.label) {
        const label = document.createElement('span');
        label.className = 'history-panel__label';
        label.textContent = entry.label;
        meta.append(label);
      }

      const actions = document.createElement('div');
      actions.className = 'history-panel__item-actions';

      const previewButton = document.createElement('button');
      previewButton.type = 'button';
      previewButton.className = 'btn btn--ghost history-panel__preview-btn';
      previewButton.textContent = 'Preview';
      previewButton.addEventListener('click', () => {
        void (async () => {
          if (busy) return;
          setBusy(true);
          setStatus('Loading preview…');
          try {
            const record = await getVersion(kind, parentId, entry.revision);
            if (disposed) return;
            const summary = summarizeVersionSnapshot(kind, record.snapshot);
            renderPreview(entry.revision, summary.title, summary.detail);
            setStatus(null);
          } catch (error) {
            if (disposed) return;
            setStatus(errorMessage(error, 'Unable to load preview.'), true);
          } finally {
            if (!disposed) setBusy(false);
          }
        })();
      });

      const restoreButton = document.createElement('button');
      restoreButton.type = 'button';
      restoreButton.className = 'btn btn--ghost history-panel__restore-btn';
      restoreButton.textContent = 'Restore';
      restoreButton.addEventListener('click', () => {
        void (async () => {
          if (busy) return;
          if (!window.confirm(RESTORE_CONFIRM_MESSAGE)) return;
          setBusy(true);
          setStatus(`Restoring revision ${entry.revision}…`);
          try {
            const live = await restoreVersion(kind, parentId, entry.revision);
            if (disposed) return;
            onRestored(live);
            await refresh();
            setStatus(`Restored revision ${entry.revision}.`);
          } catch (error) {
            if (disposed) return;
            setStatus(errorMessage(error, 'Unable to restore this revision.'), true);
          } finally {
            if (!disposed) setBusy(false);
          }
        })();
      });

      actions.append(previewButton, restoreButton);
      item.append(meta, actions);
      list.append(item);
    }
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    loadingList = true;
    checkpointButton.disabled = true;
    setStatus('Loading history…');
    try {
      const index = await listVersions(kind, parentId);
      if (disposed) return;
      renderEntries(index.entries);
    } catch (error) {
      if (disposed) return;
      list.replaceChildren();
      clearPreview();
      setStatus(errorMessage(error, 'Unable to load version history.'), true);
    } finally {
      loadingList = false;
      if (!disposed) checkpointButton.disabled = busy;
    }
  }

  function setOpen(next: boolean): void {
    open = next;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.classList.toggle('history-panel__toggle--open', open);
    if (open) void refresh();
  }

  toggle.addEventListener('click', () => {
    setOpen(!open);
  });

  checkpointButton.addEventListener('click', () => {
    void (async () => {
      if (busy) return;
      const labelRaw = window.prompt('Checkpoint label (optional)', '');
      if (labelRaw === null) return;
      const label = labelRaw.trim();
      setBusy(true);
      setStatus('Saving checkpoint…');
      try {
        await createCheckpoint(kind, parentId, label || undefined);
        if (disposed) return;
        await refresh();
        setStatus('Checkpoint saved.');
      } catch (error) {
        if (disposed) return;
        setStatus(errorMessage(error, 'Unable to save checkpoint.'), true);
      } finally {
        if (!disposed) setBusy(false);
      }
    })();
  });

  return {
    dispose() {
      disposed = true;
      root.remove();
    },
    refresh,
    open() {
      if (!disposed) setOpen(true);
    },
    close() {
      if (!disposed) setOpen(false);
    }
  };
}
