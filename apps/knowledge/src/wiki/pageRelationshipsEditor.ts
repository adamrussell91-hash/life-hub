/**
 * Explicit related_to editor for Knowledge compose.
 * Ordinary page Save never touches these chips — only Save relationships
 * calls replacePageRelationships.
 */
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import { KnowledgeApiError, searchPages } from '../api/client';
import { connectedDisplayRefs } from './connectedRelationships';
import { labelForHubRef, parseHubRef } from '../domain/hub-ref';

export type RelatedChip = {
  id: string;
  /** HubRef storage form accepted by replace-relationships (page id or hub:kind:id). */
  hubRef: string;
  entityRef: string;
  label: string;
  linkId?: string | null;
  state: 'saved' | 'pending';
};

export type RelatedStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'saving'
  | 'incomplete'
  | 'failure';

export type PageRelationshipRow = {
  legacy_hub_ref?: string | null;
  target_ref?: string;
  link_id?: string | null;
};

export function hubRefFromEntityRef(entityRef: string): string | null {
  const parts = entityRef.split(':');
  if (parts.length !== 3) return null;
  const [namespace, kind, id] = parts;
  if (!namespace || !kind || !id) return null;
  if (namespace === 'knowledge' && kind === 'page') return id;
  if (
    (namespace === 'teaching' && kind === 'unit') ||
    (namespace === 'tasks' && kind === 'project') ||
    (namespace === 'life' && kind === 'decision')
  ) {
    return `${namespace}:${kind}:${id}`;
  }
  return null;
}

export function entityRefFromHubRef(hubRef: string): string | null {
  const parsed = parseHubRef(hubRef);
  if (!parsed) return null;
  return `${parsed.hub}:${parsed.kind}:${parsed.id}`;
}

export function chipsFromDualRead(input: {
  pageId: string;
  legacyConnected?: string[];
  relationships?: PageRelationshipRow[] | null;
  relationshipsStatus?: 'ready' | 'unavailable' | null;
  entries?: { id: string; title: string }[];
}): { chips: RelatedChip[]; status: RelatedStatus; message: string } {
  if (input.relationshipsStatus === 'unavailable') {
    return {
      chips: [],
      status: 'unavailable',
      message: 'Related pages are unavailable. Retry to reload.',
    };
  }
  const refs = connectedDisplayRefs({
    legacyConnected: input.legacyConnected ?? [],
    relationships: input.relationships ?? null,
  });
  const byHub = new Map<string, PageRelationshipRow>();
  for (const row of Array.isArray(input.relationships) ? input.relationships : []) {
    const hub = typeof row.legacy_hub_ref === 'string' ? row.legacy_hub_ref : null;
    if (hub) byHub.set(hub, row);
  }
  const chips: RelatedChip[] = [];
  for (const hubRef of refs) {
    if (hubRef === input.pageId) continue;
    const entityRef = entityRefFromHubRef(hubRef);
    if (!entityRef) continue;
    const row = byHub.get(hubRef);
    const parsed = parseHubRef(hubRef);
    const pageTitle =
      parsed?.hub === 'knowledge'
        ? input.entries?.find(entry => entry.id === parsed.id)?.title
        : null;
    chips.push({
      id: `saved:${hubRef}`,
      hubRef,
      entityRef,
      label: pageTitle || (parsed ? labelForHubRef(parsed) : hubRef),
      linkId: row?.link_id ?? null,
      state: 'saved',
    });
  }
  return { chips, status: 'ready', message: '' };
}

export type PageRelationshipsEditorHandle = {
  root: HTMLElement;
  getDesiredHubRefs: () => string[];
  setStatus: (status: RelatedStatus, message?: string) => void;
  setBusy: (busy: boolean) => void;
  destroy: () => void;
};

/**
 * Mount picker + chips into a host. Mutates `chips` in place via callbacks.
 */
export function mountPageRelationshipsEditor(options: {
  host: HTMLElement;
  pageId: string;
  chips: RelatedChip[];
  status: RelatedStatus;
  message: string;
  entries: { id: string; title: string }[];
  disabled?: boolean;
  onChange: (chips: RelatedChip[]) => void;
  onSave: () => void;
  onRetryLoad: () => void;
}): PageRelationshipsEditorHandle {
  const root = document.createElement('section');
  root.className = 'compose__field compose__relationships';
  root.setAttribute('aria-label', 'Related pages');

  const heading = document.createElement('h3');
  heading.className = 'compose__relationships-heading';
  heading.textContent = 'Related pages';

  const copy = document.createElement('p');
  copy.className = 'compose__hint';
  copy.textContent =
    'Link other archive pages with the shared picker. Title, body, tags, and attachments keep their own Save — relationships only change when you use Save relationships.';

  const pickerInput = document.createElement('input');
  pickerInput.type = 'text';
  pickerInput.className = 'compose__relationship-picker';
  pickerInput.placeholder = 'Type @ to link a page';
  pickerInput.setAttribute('aria-label', 'Link a related page');
  pickerInput.disabled = Boolean(options.disabled);

  const chipsHost = document.createElement('div');
  chipsHost.className = 'compose__relationship-chips';

  const statusEl = document.createElement('p');
  statusEl.className = 'compose__relationship-status';
  statusEl.hidden = !options.message && options.status === 'ready';

  const actions = document.createElement('div');
  actions.className = 'compose__relationship-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--secondary';
  saveBtn.dataset.relationshipSave = '1';
  saveBtn.textContent = 'Save relationships';
  saveBtn.disabled = Boolean(options.disabled);

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'btn btn--ghost';
  retryBtn.dataset.relationshipRetry = '1';
  retryBtn.textContent = 'Retry';
  retryBtn.hidden = true;

  actions.append(saveBtn, retryBtn);
  root.append(heading, copy, pickerInput, chipsHost, statusEl, actions);
  options.host.replaceChildren(root);

  let chips = [...options.chips];

  const chipList = createEntityChipList({
    container: chipsHost,
    chips: chips.map(toPickerChip),
    endLabel: 'Remove',
    onRemovePending: (chip: { id: string }) => {
      chips = chips.filter(item => item.id !== chip.id);
      options.onChange(chips);
    },
    onEndSaved: (chip: { id: string }) => {
      // Pending removal — lifecycle runs only on Save relationships.
      chips = chips.filter(item => item.id !== chip.id);
      chipList.setChips(chips.map(toPickerChip));
      options.onChange(chips);
      setStatus(
        'ready',
        'Relationship marked for removal. Use Save relationships to apply.',
      );
    },
  });

  const picker = createEntityPicker({
    input: pickerInput,
    allowedKinds: ['page'],
    emptyText: 'No matching pages.',
    search: async (query: string, signal: AbortSignal) => {
      const q = query.trim().toLowerCase();
      let hits = options.entries;
      if (q.length >= 2) {
        try {
          hits = await searchPages(query);
          if (signal.aborted) return { groups: { page: [] } };
        } catch {
          hits = options.entries.filter(
            entry =>
              entry.title.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q),
          );
        }
      } else {
        hits = options.entries.filter(
          entry =>
            entry.title.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q),
        );
      }
      const selected = new Set(chips.map(chip => chip.hubRef));
      return {
        groups: {
          page: hits
            .filter(entry => entry.id !== options.pageId && !selected.has(entry.id))
            .slice(0, 20)
            .map(entry => ({
              ref: `knowledge:page:${entry.id}`,
              kind: 'page',
              display_label: entry.title,
              supporting_label: entry.id,
              href: null,
            })),
        },
      };
    },
    onSelect: (item: { ref: string; display_label: string }) => {
      const hubRef = hubRefFromEntityRef(item.ref);
      if (!hubRef || hubRef === options.pageId) return;
      if (chips.some(chip => chip.hubRef === hubRef)) return;
      const next: RelatedChip = {
        id: `pending:${hubRef}`,
        hubRef,
        entityRef: item.ref,
        label: item.display_label,
        state: 'pending',
      };
      chips = [...chips, next];
      chipList.setChips(chips.map(toPickerChip));
      options.onChange(chips);
    },
  });
  pickerInput.insertAdjacentElement('afterend', picker.root);

  function toPickerChip(chip: RelatedChip) {
    return {
      id: chip.id,
      ref: chip.entityRef,
      label: chip.label,
      relationshipType: 'related_to',
      state: chip.state,
      supportingLabel: chip.state === 'pending' ? 'pending' : 'related_to',
    };
  }

  function setStatus(status: RelatedStatus, message = '') {
    statusEl.hidden = !message && status === 'ready';
    statusEl.textContent = message;
    statusEl.dataset.status = status;
    const showRetry =
      status === 'unavailable' || status === 'incomplete' || status === 'failure';
    retryBtn.hidden = !showRetry;
    retryBtn.textContent = status === 'unavailable' ? 'Retry load' : 'Retry';
    saveBtn.disabled = Boolean(options.disabled) || status === 'saving' || status === 'loading';
    pickerInput.disabled = Boolean(options.disabled) || status === 'saving';
    saveBtn.textContent = status === 'saving' ? 'Saving…' : 'Save relationships';
  }

  function setBusy(busy: boolean) {
    setStatus(busy ? 'saving' : 'ready', busy ? 'Saving relationships…' : statusEl.textContent);
  }

  saveBtn.addEventListener('click', () => options.onSave());
  retryBtn.addEventListener('click', () => {
    if (statusEl.dataset.status === 'unavailable') options.onRetryLoad();
    else options.onSave();
  });

  setStatus(options.status, options.message);

  return {
    root,
    getDesiredHubRefs: () => chips.map(chip => chip.hubRef),
    setStatus,
    setBusy,
    destroy: () => {
      picker.destroy?.();
      options.host.replaceChildren();
    },
  };
}

export function relationshipErrorMessage(error: unknown): {
  status: RelatedStatus;
  message: string;
  retryable: boolean;
} {
  if (error instanceof KnowledgeApiError) {
    if (error.code === 'knowledge_ul_unavailable' || error.code === 'universal_link_blobs_unbound') {
      return {
        status: 'unavailable',
        message: error.message || 'Universal Link store is unavailable.',
        retryable: true,
      };
    }
    if (error.code === 'knowledge_relationship_operation_incomplete') {
      return {
        status: 'incomplete',
        message: error.message || 'Relationship update incomplete. Retry to finish without duplicates.',
        retryable: true,
      };
    }
    if (error.code === 'knowledge_relationship_cutover_disabled') {
      return {
        status: 'failure',
        message: error.message || 'Relationship writes require Universal Link cutover.',
        retryable: false,
      };
    }
    return {
      status: error.retryable ? 'incomplete' : 'failure',
      message: error.message || 'Relationship update failed.',
      retryable: Boolean(error.retryable),
    };
  }
  return {
    status: 'failure',
    message: error instanceof Error ? error.message : 'Relationship update failed.',
    retryable: false,
  };
}
