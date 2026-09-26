import { createAccessContext } from './entity-access.mjs';
import { resolvePerson } from './entity-resolvers.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';

/** `{ [person_ref]: display_name }`. A person that can't be resolved is left out. */
export async function fetchPeopleNames(env, refs) {
  const accessContext = createAccessContext({ workflow: 'professional' });
  const store = await defaultGetUniversalLinkStore(env);
  const out = {};
  for (const ref of refs) {
    try {
      const id = ref.split(':').pop();
      const person = await resolvePerson(id, accessContext, { getStore: async () => store, env });
      out[ref] = person.display_label;
    } catch {
      // Unknown person: left out, not thrown — a missing name never blocks the other nudges.
    }
  }
  return out;
}
