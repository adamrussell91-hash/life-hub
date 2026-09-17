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
  heading.textContent = options.heading ?? 'Tags';
  root.append(heading);

  const hint = document.createElement('p');
  hint.className = 'entity-tagger__hint';
  hint.textContent =
    options.hint ?? 'Type @ to tag anything — a person, note, task, event, unit, or anything else in the hub.';
  root.append(hint);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'entity-tagger__picker';
  input.placeholder = 'Type @ to tag something';
  input.setAttribute('aria-label', options.heading ?? 'Tag something');

  const chipsHost = document.createElement('div');
  chipsHost.className = 'entity-tagger__chips';

  const status = document.createElement('p');
  status.className = 'entity-tagger__status';
  status.hidden = true;

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
      try {
        await options.suppressLink(chip.id);
        await refresh();
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
      void (async () => {
        try {
          await options.createLink({
            source_ref: options.sourceRef,
            target_ref: item.ref,
            relationship_type: relationshipType
          });
          await refresh();
        } catch (err) {
          reportError(err instanceof Error ? err.message : 'Could not save tag.');
        }
      })();
    }
  });

  root.append(input, picker.root, chipsHost, status);
  options.host.replaceChildren(root);

  async function refresh() {
    try {
      const { outgoing, incoming } = await options.listLinks(options.sourceRef);
      const saved = [...outgoing, ...incoming]
        .filter((entry) => entry.link.status === 'current' && entry.link.relationship_type === relationshipType)
        .map((entry) => ({
          id: entry.link.id,
          ref: entry.endpoint.ref,
          label: entry.endpoint.display_label,
          relationshipType: entry.link.relationship_type,
          state: 'saved',
          supportingLabel: entry.endpoint.kind,
          href: entry.endpoint.href ?? null
        }));
      chipList.setChips(saved);
      status.hidden = true;
    } catch (err) {
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
