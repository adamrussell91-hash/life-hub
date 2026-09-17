// Shared relationship-graph primitives (Phase 4, Network Ecology data
// layer). Builds ONE current-link graph that `/api/network-ecology/world`'s
// base nodes/edges, `/api/network-ecology/ego`'s neighbourhood BFS, and
// `introduction-paths.mjs`'s shortest-path BFS all reuse — so hop-traversal
// logic exists in exactly one place, per BUILD-PLAN.md Phase 4's explicit
// instruction ("Reuse a shared hop-traversal helper... rather than writing
// hop-BFS logic twice").
//
// Graph edges are drawn from CURRENT (`status === 'current'`) links only,
// of exactly the three types brief section 23 and Feature 4.5 name:
// `professional_relationship` (person<->person) and `employee_at`/
// `member_of` (person<->organisation). Never an ended/archived/suppressed
// link. Organisation nodes are kept as first-class graph nodes rather than
// collapsed into a synthesized "colleague at X" person-to-person edge —
// deliberately: inventing an edge not backed by an actual Universal Link
// would be LESS evidenced than showing the real employee_at/member_of hop
// through the organisation node itself (brief section 23: "Prioritise
// current, evidenced... connections"). `introduction-paths.mjs` documents
// this same decision again where it affects `maxHops` semantics.
//
// Pure — no I/O. `peopleWithRelationships` MUST already be filtered to
// VISIBLE people by the caller (`network-ecology-world.mjs`'s
// `filterVisiblePeople`) before it reaches this module: this module does
// not itself re-check `lifecycle_status`. Every Organisation endpoint this
// module encounters is already trusted visible because
// `universal-link-read-repository.mjs`'s `toAccessibleEntry` drops an
// archived "other endpoint" before `loadAllPeopleWithRelationships` ever
// returns it — the one gap that check does NOT cover (an archived
// Person's own top-level entry, when that person themself is the one
// being iterated) is exactly what the caller's pre-filter closes. See
// network-ecology-world.mjs's doc comment for the full explanation.

const TRAVERSABLE_LINK_TYPES = new Set(['employee_at', 'member_of', 'professional_relationship']);

// Default inclusion predicate: current links only, exactly the historical
// (pre-Feature-4.6) behaviour below. `buildRelationshipGraph`'s optional
// `isLinkIncluded` override (Phase 4, Feature 4.6 — History mode) lets
// `network-ecology-history.mjs` reuse this EXACT node/edge/dedup/adjacency
// assembly for a point-in-time graph ("was this link active as of date X")
// instead of duplicating it — only WHICH links pass changes, never how a
// passing link becomes a node/edge.
function isCurrentLink(link) {
  return link.status === 'current';
}

// The connecting context an edge represents — cited identically regardless
// of which direction it is traversed in, so a hop landing ON an
// organisation node and a hop landing on the PERSON on its other side both
// describe the same shared context the same way (e.g. both hops of an
// A -> UNSW -> B path cite "employee at UNSW", not one citing the org and
// the other citing the person it happens to land on).
function describeVia(edge, nodes) {
  if (edge.relationship_type === 'professional_relationship') {
    return edge.role ? edge.role : 'professional relationship';
  }
  const sourceNode = nodes.get(edge.source_ref);
  const targetNode = nodes.get(edge.target_ref);
  const orgNode = sourceNode?.kind === 'organisation' ? sourceNode : targetNode;
  const verb = edge.relationship_type === 'employee_at' ? 'employee at' : 'member of';
  const label = orgNode?.display_name ?? orgNode?.ref ?? '';
  return label ? `${verb} ${label}` : verb;
}

/**
 * Pure graph builder. Returns:
 *   nodes: Map<ref, { ref, kind: 'person'|'organisation', display_name }>
 *   edges: Array<{ link_id, source_ref, target_ref, relationship_type, role }>
 *          (deduped by `link_id` — the same Universal Link appears twice in
 *          `peopleWithRelationships`, once per side, per
 *          `people-collection.mjs`'s own documented dedup contract)
 *   adjacency: Map<ref, Array<{ ref, via, edge }>> — both directions of
 *          every edge, for BFS.
 */
export function buildRelationshipGraph(peopleWithRelationships, { isLinkIncluded = isCurrentLink } = {}) {
  const nodes = new Map();
  const edgesById = new Map();

  for (const { person, relationships } of peopleWithRelationships ?? []) {
    nodes.set(person.ref, { ref: person.ref, kind: 'person', display_name: person.display_name });

    for (const entry of relationships ?? []) {
      const { link, endpoint, direction } = entry;
      if (!link || !isLinkIncluded(link)) continue;
      if (!TRAVERSABLE_LINK_TYPES.has(link.relationship_type)) continue;
      if (!endpoint || (endpoint.kind !== 'person' && endpoint.kind !== 'organisation')) continue;

      if (!nodes.has(endpoint.ref)) {
        nodes.set(endpoint.ref, { ref: endpoint.ref, kind: endpoint.kind, display_name: endpoint.display_label });
      }

      if (!edgesById.has(link.id)) {
        const sourceRef = direction === 'outgoing' ? person.ref : endpoint.ref;
        const targetRef = direction === 'outgoing' ? endpoint.ref : person.ref;
        edgesById.set(link.id, {
          link_id: link.id,
          source_ref: sourceRef,
          target_ref: targetRef,
          relationship_type: link.relationship_type,
          role: link.role ?? null
        });
      }
    }
  }

  const adjacency = new Map();
  for (const ref of nodes.keys()) adjacency.set(ref, []);
  for (const edge of edgesById.values()) {
    if (!nodes.has(edge.source_ref) || !nodes.has(edge.target_ref)) continue;
    const via = describeVia(edge, nodes);
    adjacency.get(edge.source_ref).push({ ref: edge.target_ref, via, edge });
    adjacency.get(edge.target_ref).push({ ref: edge.source_ref, via, edge });
  }

  return { nodes, edges: [...edgesById.values()], adjacency };
}

/**
 * BFS neighbourhood around `ref`, within `hops` edges (Feature 4.1 data /
 * `/api/network-ecology/ego`). Returns the INDUCED subgraph: every node
 * reached within `hops` traversals, and every graph edge whose both
 * endpoints landed in that reached set — not merely the edges the BFS
 * happened to walk — matching an ordinary induced-subgraph definition.
 * `ref` not present in the graph (e.g. hidden, or genuinely unknown)
 * yields an empty `{ nodes: [], edges: [] }`, never an error — the same
 * non-disclosure shape every other endpoint-visibility check in this
 * codebase uses.
 */
export function computeEgoNeighborhood(graph, ref, hops) {
  if (!graph.nodes.has(ref)) return { nodes: [], edges: [] };

  const reached = new Set([ref]);
  let frontier = [ref];
  for (let i = 0; i < hops && frontier.length > 0; i++) {
    const next = [];
    for (const current of frontier) {
      for (const { ref: neighborRef } of graph.adjacency.get(current) ?? []) {
        if (!reached.has(neighborRef)) {
          reached.add(neighborRef);
          next.push(neighborRef);
        }
      }
    }
    frontier = next;
  }

  const nodes = [...reached].map((r) => graph.nodes.get(r)).filter(Boolean);
  const edges = graph.edges.filter((e) => reached.has(e.source_ref) && reached.has(e.target_ref));
  return { nodes, edges };
}
