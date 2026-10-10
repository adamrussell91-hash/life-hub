import { mountEntityTagger } from "../../design-kit/js/entity-tagger.js";
import { API_BASE } from "../api/config";
import { unwrapApiPayload } from "../api/envelope";

/**
 * "@ tag anything" on a Knowledge note — the same shared widget the
 * Professional, Tasks and Teaching hubs mount. Tagging a person here writes
 * the generic `tagged_with` Universal Link, so the note shows up under
 * "Linked everywhere" on that person's profile.
 *
 * The note's own "Connected" editor stays page-to-page (`related_to`);
 * people, organisations, tasks, meetings and events come through here.
 */

// Knowledge's API base is `<origin>/api/knowledge`; the shared entity and
// Universal Link routes live one level up at `<origin>/api`.
const SHARED_API_BASE = API_BASE.replace(/\/knowledge$/, "");

async function sharedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SHARED_API_BASE}${path}`, {
    credentials: "include",
    ...init,
    // Only declare JSON when there is a body — a bare GET stays a simple
    // CORS request, like every other hub client.
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const err = (payload as { error?: { message?: string } } | null)?.error;
    throw new Error(err?.message || `Request failed (${response.status}).`);
  }
  return unwrapApiPayload<T>(payload);
}

type Suggestion = {
  ref: string;
  kind: string;
  display_label: string;
  supporting_label?: string | null;
  href?: string | null;
};

type LinkEntry = {
  link: { id: string; source_ref: string; target_ref: string; relationship_type: string; status: string };
  endpoint?: { ref: string; kind: string; display_label: string; href?: string | null } | null;
};

function withEndpoint(entries: LinkEntry[] | undefined) {
  return (entries ?? [])
    .filter((entry): entry is Required<LinkEntry> & { endpoint: NonNullable<LinkEntry["endpoint"]> } =>
      Boolean(entry.endpoint),
    )
    .map(entry => ({ link: entry.link, endpoint: entry.endpoint }));
}

export function pageEntityRef(pageId: string): string {
  return `knowledge:page:${pageId}`;
}

export function mountNoteTagger(host: HTMLElement, pageId: string) {
  return mountEntityTagger({
    host,
    sourceRef: pageEntityRef(pageId),
    heading: "People & tags",
    // Note-to-note links belong to the "Connected" editor (`related_to`).
    excludeKinds: ["page"],
    search: async (query: string, signal: AbortSignal, kinds: string[]) => {
      const params = new URLSearchParams({ q: query, kinds: kinds.join(",") });
      const result = await sharedFetch<{ groups: Record<string, Suggestion[] | undefined> }>(
        `/entities/search?${params.toString()}`,
        { signal },
      );
      return { groups: result.groups ?? {} };
    },
    listLinks: async (ref: string) => {
      const params = new URLSearchParams({ entity_ref: ref });
      const result = await sharedFetch<{ outgoing?: LinkEntry[]; incoming?: LinkEntry[] }>(
        `/universal-links?${params.toString()}`,
      );
      return { outgoing: withEndpoint(result.outgoing), incoming: withEndpoint(result.incoming) };
    },
    createLink: (input: { source_ref: string; target_ref: string; relationship_type: string }) =>
      sharedFetch("/universal-links", { method: "POST", body: JSON.stringify(input) }),
    suppressLink: (linkId: string) => {
      const params = new URLSearchParams({ id: linkId, action: "suppress" });
      return sharedFetch(`/universal-links?${params.toString()}`, {
        method: "PATCH",
        body: JSON.stringify({ reason: "operator_requested" }),
      });
    },
  });
}
