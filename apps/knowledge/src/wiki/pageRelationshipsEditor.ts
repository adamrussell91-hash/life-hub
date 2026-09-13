/**
 * Explicit related_to editor for Knowledge compose.
 * Ordinary page Save never touches these chips — only Save relationships
 * calls replacePageRelationships.
 *
 * Ownership kinds on dual-read chips:
 * - outgoing_owned — this page is source_ref (editable; included in replace)
 * - incoming_readonly — this page is target_ref (read-only; never in replace)
 * - legacy_pending — legacy connected only (editable; owned by this page)
 */
import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../design-kit/js/entity-chips.js';
import { KnowledgeApiError, searchPages } from '../api/client';
import {
  connectedDisplayRefs,
  peerHubRefForRelationship,
  type DualReadRelationshipRow
} from './connectedRelationships';
import { labelForHubRef, parseHubRef } from '../domain/hub-ref';

export type RelationshipOwnership =
  | 'outgoing_owned'
  | 'incoming_readonly'
  | 'legacy_pending';

export type RelatedChip = {
  id: string;
  /** HubRef storage form accepted by replace-relationships (page id or hub:kind:id). */
  hubRef: string;
  entityRef: string;
  label: string;
  linkId?: string | null;
  state: 'saved' | 'pending';
  ownership: RelationshipOwnership;
  sourceRef?: string | null;
  targetRef?: string | null;
};

export type RelatedStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'saving'
  | 'incomplete'
  | 'failure';

export type PageRelationshipRow = DualReadRelationshipRow;

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

function ownershipForRow(
  row: PageRelationshipRow | undefined,
  viewingPageId: string
): RelationshipOwnership {
  if (!row) return 'legacy_pending';
  if (
    row.ownership === 'outgoing_owned' ||
    row.ownership === 'incoming_readonly' ||
    row.ownership === 'legacy_pending'
  ) {
    return row.ownership;
  }
  const viewingRef = `knowledge:page:${viewingPageId}`;
  if (row.direction === 'incoming' || (row.source_ref && row.source_ref !== viewingRef)) {
    return 'incoming_readonly';
  }
  const sources = Array.isArray(row.sources) ? row.sources : [];
  if (sources.includes('legacy') && !sources.includes('canonical') && !row.link_id) {
    return 'legacy_pending';
  }
  return 'outgoing_owned';
}

function ownerLabel(
  sourceRef: string | null | undefined,
  entries: { id: string; title: string }[]
): string {
  if (!sourceRef) return 'another page';
  const parts = sourceRef.split(':');
  if (parts.length === 3 && parts[0] === 'knowledge' && parts[1] === 'page') {
    return entries.find(entry => entry.id === parts[2])?.title || parts[2] || 'another page';
  }
  return sourceRef;
}

function supportingLabelFor(
  chip: RelatedChip,
  entries: { id: string; title: string }[]
): string {
  if (chip.state === 'pending') return 'pending';
  if (chip.ownership === 'incoming_readonly') {
    return `Incoming · owned by ${ownerLabel(chip.sourceRef, entries)}`;
  }
  if (chip.ownership === 'legacy_pending') return 'legacy · pending migration';
  return 'related_to';
}

/** HubRefs this page may write through replace — never incoming. */
export function desiredHubRefsFromChips(chips: RelatedChip[]): string[] {
  return chips
    .filter(chip => chip.ownership !== 'incoming_readonly')
    .map(chip => chip.hubRef);
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

  const entries = input.entries ?? [];
  const rows = Array.isArray(input.relationships) ? input.relationships : null;

  if (rows) {
    const chips: RelatedChip[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const hubRef = peerHubRefForRelationship(row, input.pageId);
      if (!hubRef || hubRef === input.pageId || seen.has(hubRef)) continue;
      const entityRef = entityRefFromHubRef(hubRef);
      if (!entityRef) continue;
      seen.add(hubRef);
      const ownership = ownershipForRow(row, input.pageId);
      const parsed = parseHubRef(hubRef);
      const pageTitle =
        parsed?.hub === 'knowledge'
          ? entries.find(entry => entry.id === parsed.id)?.title
          : null;
      chips.push({
        id: `saved:${ownership}:${hubRef}`,
        hubRef,
        entityRef,
        label: pageTitle || (parsed ? labelForHubRef(parsed) : hubRef),
        linkId: row.link_id ?? null,
        state: 'saved',
        ownership,
        sourceRef: row.source_ref ?? null,
        targetRef: row.target_ref ?? null,
      });
    }
    return { chips, status: 'ready', message: '' };
  }

  const refs = connectedDisplayRefs({
    pageId: input.pageId,
    legacyConnected: input.legacyConnected ?? [],
    relationships: null,
  });
  const chips: RelatedChip[] = [];
  for (const hubRef of refs) {
    if (hubRef === input.pageId) continue;
    const entityRef = entityRefFromHubRef(hubRef);
    if (!entityRef) continue;
    const parsed = parseHubRef(hubRef);
    const pageTitle =
      parsed?.hub === 'knowledge'
        ? entries.find(entry => entry.id === parsed.id)?.title
        : null;
    chips.push({
      id: `saved:legacy_pending:${hubRef}`,
      hubRef,
      entityRef,
      label: pageTitle || (parsed ? labelForHubRef(parsed) : hubRef),
      linkId: null,
      state: 'saved',
      ownership: 'legacy_pending',
      sourceRef: `knowledge:page:${input.pageId}`,
      targetRef: entityRef,
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
    'Link other archive pages with the shared picker. Incoming links owned by another page are read-only. Title, body, tags, and attachments keep their own Save — relationships only change when you use Save relationships.';

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

  let chips = options.chips.map(chip => ({
    ...chip,
    ownership: chip.ownership ?? ('outgoing_owned' as RelationshipOwnership),
  }));

  const chipList = createEntityChipList({
    container: chipsHost,
    chips: chips.map(chip => toPickerChip(chip)),
    endLabel: 'Remove',
    onRemovePending: (chip: { id: string }) => {
      chips = chips.filter(item => item.id !== chip.id);
      options.onChange(chips);
    },
    onEndSaved: (chip: { id: string }) => {
      const current = chips.find(item => item.id === chip.id);
      if (!current || current.ownership === 'incoming_readonly') return;
      chips = chips.filter(item => item.id !== chip.id);
      chipList.setChips(chips.map(item => toPickerChip(item)));
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
        ownership: 'outgoing_owned',
        sourceRef: `knowledge:page:${options.pageId}`,
        targetRef: item.ref,
      };
      chips = [...chips, next];
      chipList.setChips(chips.map(chip => toPickerChip(chip)));
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
      supportingLabel: supportingLabelFor(chip, options.entries),
      readonly: chip.ownership === 'incoming_readonly',
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
    setStatus(busy ? 'saving' : 'ready', busy ? 'Saving relationships…' : statusEl.textContent || '');
  }

  saveBtn.addEventListener('click', () => options.onSave());
  retryBtn.addEventListener('click', () => {
    if (statusEl.dataset.status === 'unavailable') options.onRetryLoad();
    else options.onSave();
  });

  setStatus(options.status, options.message);

  return {
    root,
    getDesiredHubRefs: () => desiredHubRefsFromChips(chips),
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
    if (
      error.code === 'knowledge_ul_unavailable' ||
      error.code === 'universal_link_blobs_unbound'
    ) {
      return {
        status: 'unavailable',
        message: error.message || 'Universal Link store is unavailable.',
        retryable: true,
      };
    }
    if (error.code === 'knowledge_relationship_operation_incomplete') {
      return {
        status: 'incomplete',
        message:
          error.message ||
          'Relationship update incomplete. Retry to finish without duplicates.',
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
