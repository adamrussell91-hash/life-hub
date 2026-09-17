import { createEntityPicker } from '../../../design-kit/js/entity-picker.js';
import { createEntityChipList } from '../../../design-kit/js/entity-chips.js';
import {
  createUniversalLink,
  listUniversalLinksForEntity,
  suppressUniversalLink,
  unitEntityRef,
  ApiClientError,
  type UniversalLinkEntry
} from '@/api/universal-links';

export interface UnitRelationshipsHandle {
  section: HTMLElement;
  refresh: () => Promise<void>;
}

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

/**
 * Related Knowledge notes for a Unit — the only way, until now, to connect a
 * Knowledge page (a session write-up, PD notes, etc.) to the Unit plan it
 * belongs to. Written as `related_to` on the canonical Universal Link, the
 * same relationship the Knowledge page's own "Related pages" editor writes,
 * so a link made from either side shows up on both.
 */
export function renderUnitRelationshipsSection(unitId: string): UnitRelationshipsHandle {
  const section = el('section', 'unit-page__relationships glass-panel');
  section.append(el('h2', 'class-page__heading', 'Related notes'));
  section.append(
    el(
      'p',
      'compose__hint',
      'Link Knowledge pages — session write-ups, PD notes — relevant to this unit.'
    )
  );

  const pickerInput = document.createElement('input');
  pickerInput.type = 'text';
  pickerInput.placeholder = 'Type @ to link a Knowledge page';
  pickerInput.setAttribute('aria-label', 'Link a Knowledge page to this unit');

  const chipsHost = el('div', 'unit-page__relationship-chips');
  const status = el('p', 'compose__relationship-status');
  status.hidden = true;

  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => undefined,
    onEndSaved: async (chip: { id: string; label: string }) => {
      try {
        await suppressUniversalLink(chip.id, 'operator_requested');
        await refresh();
      } catch (err) {
        status.hidden = false;
        status.textContent =
          err instanceof ApiClientError ? err.message : 'Could not remove relationship.';
      }
    },
    endLabel: 'Remove'
  });

  const picker = createEntityPicker({
    input: pickerInput,
    allowedKinds: ['page'],
    emptyText: 'No matching Knowledge pages.',
    search: async (query: string, signal: AbortSignal) => {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/knowledge/search?${params.toString()}`, {
        credentials: 'include',
        signal
      });
      if (!response.ok) return { groups: { page: [] } };
      const payload = await response.json();
      const hits = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.hits)
          ? payload.hits
          : Array.isArray(payload)
            ? payload
            : [];
      return {
        groups: {
          page: hits.slice(0, 20).map((hit: { id?: string; title?: string }) => ({
            ref: `knowledge:page:${hit.id}`,
            kind: 'page',
            display_label: hit.title || hit.id || 'Page',
            supporting_label: hit.id ?? null,
            href: hit.id ? `/knowledge/#page/${encodeURIComponent(hit.id)}` : null
          }))
        }
      };
    },
    onSelect: (item: { ref: string; display_label: string; href?: string | null }) => {
      pickerInput.value = '';
      void (async () => {
        try {
          await createUniversalLink({
            source_ref: unitEntityRef(unitId),
            target_ref: item.ref,
            relationship_type: 'related_to'
          });
          await refresh();
        } catch (err) {
          status.hidden = false;
          status.textContent =
            err instanceof ApiClientError ? err.message : 'Could not save relationship.';
        }
      })();
    }
  });

  section.append(pickerInput, picker.root, chipsHost, status);

  async function refresh(): Promise<void> {
    try {
      const { outgoing, incoming } = await listUniversalLinksForEntity(unitEntityRef(unitId));
      const saved = [...outgoing, ...incoming]
        .filter(
          (entry) => entry.link.status === 'current' && entry.link.relationship_type === 'related_to'
        )
        .map((entry: UniversalLinkEntry) => ({
          id: entry.link.id,
          ref: entry.endpoint.ref,
          label: entry.endpoint.display_label,
          relationshipType: entry.link.relationship_type,
          state: 'saved' as const,
          supportingLabel: entry.link.relationship_type,
          href: entry.endpoint.href ?? null
        }));
      chipList.setChips(saved);
      status.hidden = true;
    } catch (err) {
      status.hidden = false;
      status.textContent =
        err instanceof ApiClientError ? err.message : 'Could not load relationships.';
    }
  }

  void refresh();

  return { section, refresh };
}
