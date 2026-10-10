import { mountEntityTagger } from '../../design-kit/js/entity-tagger.js';
import {
  createUniversalLink,
  listUniversalLinksForEntity,
  searchEntities,
  suppressUniversalLink
} from '@/api/universal-links';


/**
 * The one generic "@ tag anything" section for this hub — mount instead of
 * writing a new bespoke picker per page. Every entity kind registered on
 * `/api/entities/search` is searchable (the shared list in
 * `design-kit/js/entity-kinds.js`), and every tag is written as the
 * generic `tagged_with` relationship, so a pair nobody has declared a
 * specific relationship type for still works.
 */
export function mountTagAnythingSection(
  host: HTMLElement,
  sourceRef: string,
  options: {
    /** Called with the number of current tags each time the list loads. */
    onLinksLoaded?: (count: number) => void;
  } = {}
) {
  return mountEntityTagger({
    host,
    sourceRef,
    search: async (query: string, signal: AbortSignal, kinds: string[]) => {
      const result = await searchEntities(query, kinds.join(','), { signal });
      return { groups: result.groups };
    },
    listLinks: async (ref: string) => {
      const links = await listUniversalLinksForEntity(ref);
      const count = [...links.outgoing, ...links.incoming].filter(
        (entry) => entry.link.status === 'current' && entry.link.relationship_type === 'tagged_with'
      ).length;
      options.onLinksLoaded?.(count);
      return links;
    },
    createLink: (input) => createUniversalLink(input),
    suppressLink: (linkId: string) => suppressUniversalLink(linkId)
  });
}
