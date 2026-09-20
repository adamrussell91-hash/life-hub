/**
 * The one "@ tag anything" section — mount this instead of writing a new
 * bespoke picker+chip-list per hub page. Interaction only, like
 * entity-picker.js/entity-chips.js: no API URLs, auth, or domain
 * relationship keys live here. The host supplies `search`/`listLinks`/
 * `createLink`/`suppressLink` — thin wrappers around its own
 * `/api/entities/search` and `/api/universal-links` clients — and this
 * module wires the picker, the chip list, and the create/remove flow the
 * same way everywhere it's mounted.
 */
import { createEntityPicker } from './entity-picker.js';
import { createEntityChipList } from './entity-chips.js';

/**
 * @typedef {{
 *   ref: string,
 *   kind: string,
 *   display_label: string,
 *   supporting_label?: string | null,
 *   href?: string | null
 * }} TaggerSuggestion
 * @typedef {{
 *   id: string,
 *   source_ref: string,
 *   target_ref: string,
 *   relationship_type: string,
 *   status: string
 * }} TaggerLink
 * @typedef {{ link: TaggerLink, endpoint: { ref: string, kind: string, display_label: string, href?: string | null } }} TaggerLinkEntry
 */

function kindLabel(kind) {
  if (typeof kind !== 'string' || !kind) return null;
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function createdLinkFrom(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const link = result.link;
  return link && typeof link === 'object' && typeof link.id === 'string' ? link : null;
}

/**
 * @param {{
 *   host: HTMLElement,
 *   sourceRef: string,
 *   relationshipType?: string,
 *   allowedKinds?: string[] | null,
 *   heading?: string,
 *   hint?: string,
 *   emptyText?: string,
 *   search: (query: string, signal: AbortSignal) => Promise<{ groups: Record<string, TaggerSuggestion[] | undefined> }>,
 *   listLinks: (sourceRef: string) => Promise<{ outgoing: TaggerLinkEntry[], incoming: TaggerLinkEntry[] }>,
 *   createLink: (input: { source_ref: string, target_ref: string, relationship_type: string }) => Promise<unknown>,
 *   suppressLink: (linkId: string) => Promise<unknown>,
 *   onError?: (message: string) => void
 * }} options
 */
export function mountEntityTagger(options) {
  const relationshipType = options.relationshipType ?? 'tagged_with';
  const root = document.createElement('section');
  root.className = 'entity-tagger';

  const heading = document.createElement('h3');
  heading.className = 'entity-tagger__heading';
  heading.textContent = options.heading ?? 'Connections';
  root.append(heading);

  const field = document.createElement('div');
  field.className = 'entity-tagger__field';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'entity-tagger__picker';
  input.placeholder = 'Type @ to add a connection';
  input.setAttribute('aria-label', options.heading ?? 'Add a connection');

  const chipsHost = document.createElement('div');
  chipsHost.className = 'entity-tagger__chips';

  const status = document.createElement('p');
  status.className = 'entity-tagger__status';
  status.hidden = true;

  let mutationVersion = 0;

  function reportError(message) {
    status.hidden = false;
    status.textContent = message;
    options.onError?.(message);
  }

  const chipList = createEntityChipList({
    container: chipsHost,
    chips: [],
    onRemovePending: () => undefined,
    onEndSaved: async (chip) => {
      mutationVersion += 1;
      try {
        await options.suppressLink(chip.id);
        chipList.removeById(chip.id);
        status.hidden = true;
      } catch (err) {
        reportError(err instanceof Error ? err.message : 'Could not remove tag.');
      }
    },
    endLabel: 'Remove'
  });

  const picker = createEntityPicker({
    input,
    allowedKinds: options.allowedKinds ?? null,
    emptyText: options.emptyText ?? 'No matches.',
    search: options.search,
    onSelect: (item) => {
      input.value = '';
      const pendingId = `pending:${item.ref}:${relationshipType}`;
      const added = chipList.addPending({
        id: pendingId,
        ref: item.ref,
        label: item.display_label,
        relationshipType,
        state: 'pending',
        supportingLabel: kindLabel(item.kind),
        href: item.href ?? null
      });
      if (!added) return;

      mutationVersion += 1;
      void (async () => {
        try {
          const result = await options.createLink({
            source_ref: options.sourceRef,
            target_ref: item.ref,
            relationship_type: relationshipType
          });
          const link = createdLinkFrom(result);
          if (!link) {
            chipList.removeById(pendingId);
            await refresh();
            return;
          }
          const saved = {
            id: link.id,
            ref: item.ref,
            label: item.display_label,
            relationshipType,
            state: 'saved',
            supportingLabel: kindLabel(item.kind),
            href: item.href ?? null
          };
          const current = chipList.getChips();
          let replaced = false;
          const next = current.map((chip) => {
            if (chip.id !== pendingId) return chip;
            replaced = true;
            return saved;
          });
          chipList.setChips(replaced ? next : [...next, saved]);
          status.hidden = true;
        } catch (err) {
          chipList.removeById(pendingId);
          reportError(err instanceof Error ? err.message : 'Could not save tag.');
        }
      })();
    }
  });

  field.append(chipsHost, input);
  root.append(field, picker.root, status);
  options.host.replaceChildren(root);

  async function refresh() {
    const startedAtVersion = mutationVersion;
    try {
      const { outgoing, incoming } = await options.listLinks(options.sourceRef);
      if (startedAtVersion !== mutationVersion) return;
      const saved = [...outgoing, ...incoming]
        .filter((entry) => entry.link.status === 'current' && entry.link.relationship_type === relationshipType)
        .map((entry) => ({
          id: entry.link.id,
          ref: entry.endpoint.ref,
          label: entry.endpoint.display_label,
          relationshipType: entry.link.relationship_type,
          state: 'saved',
          supportingLabel: kindLabel(entry.endpoint.kind),
          href: entry.endpoint.href ?? null
        }));
      chipList.setChips(saved);
      status.hidden = true;
    } catch (err) {
      if (startedAtVersion !== mutationVersion) return;
      reportError(err instanceof Error ? err.message : 'Could not load tags.');
    }
  }

  void refresh();

  return {
    root,
    refresh,
    destroy() {
      picker.destroy?.();
      options.host.replaceChildren();
    }
  };
}
