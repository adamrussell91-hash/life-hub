import { mountEntityTagger } from '../../design-kit/js/entity-tagger.js';
import { searchEntities } from '@/api/entities';
import {
  createUniversalLink,
  listUniversalLinksForEntity,
  suppressUniversalLink
} from '@/api/universal-links';

const TAGGABLE_KINDS = 'person,organisation,task,application,program,page,unit,lesson,class,event,meeting';

/**
 * The one generic "@ tag anything" section for this hub — mount instead of
 * writing a new bespoke picker per page. Every entity kind registered on
 * `/api/entities/search` is searchable, and every tag is written as the
 * generic `tagged_with` relationship, so a pair nobody has declared a
 * specific relationship type for still works.
 */
export function mountTagAnythingSection(host: HTMLElement, sourceRef: string) {
  return mountEntityTagger({
    host,
    sourceRef,
    search: async (query: string, signal: AbortSignal) => {
      const result = await searchEntities(query, TAGGABLE_KINDS, { signal });
      return { groups: result.groups };
    },
    listLinks: async (ref: string) => {
      const { outgoing, incoming } = await listUniversalLinksForEntity(ref);
      const withEndpoint = (entries: Awaited<ReturnType<typeof listUniversalLinksForEntity>>['outgoing']) =>
        entries
          .map((entry) => (entry.endpoint ? { link: entry.link, endpoint: entry.endpoint } : null))
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      return {
        outgoing: withEndpoint(outgoing),
        incoming: withEndpoint(incoming)
      };
    },
    createLink: (input) => createUniversalLink(input),
    suppressLink: (linkId: string) => suppressUniversalLink(linkId)
  });
}
