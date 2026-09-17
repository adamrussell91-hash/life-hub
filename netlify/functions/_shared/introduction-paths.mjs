// Introduction Paths (Phase 4, Feature 4.5 — PLAIN-TEXT CHAIN VERSION
// ONLY). BUILD-PLAN.md Phase 4 explicitly phases Sankey rendering
// (`buildSankeyFlow`, `apps/life/js/app/chart-kit/sankey-flow.js`) as a
// later *upgrade* once this path-finding query is proven correct — "ship
// the plain-text chain list first... add the Sankey rendering once [this]
// is proven correct." Not built here; see PHASE-1-PROGRESS.md for the
// explicit scope-cut note.
//
// Multi-hop shortest-path search over `network-graph.mjs`'s shared
// current-link graph (CURRENT `professional_relationship` +
// `employee_at`/`member_of` links only — never an ended/archived/
// suppressed link). `maxHops` bounds total graph hops (edges) walked,
// which MAY include an organisation node as an intermediate hop when the
// only connecting evidence between two people is a shared current
// employer/membership rather than a direct `professional_relationship`
// link — see network-graph.mjs's doc comment for why that is the more
// evidenced choice over synthesizing an implicit "colleague" edge.
//
// Per brief section 23 ("Prioritise current, evidenced and contextually
// relevant connections... Do not show meaningless degrees of separation"):
// only the shortest path length is ever returned, and even then capped to
// a small number of best (shortest) paths — never every possible path,
// never a bare list of names with no explanation. Each hop cites the real
// relationship/link that connects it.

import { buildRelationshipGraph } from './network-graph.mjs';

// Default cap on the number of shortest paths returned, even when many
// equally-short paths exist. 3 was chosen as a small, deliberately human-
// scannable number — enough to show a genuine choice of introducers
// without turning into "meaningless degrees of separation" noise (brief
// section 23's own phrase). Exported so the route/tests can reference the
// exact number rather than a magic literal.
export const MAX_INTRODUCTION_PATHS = 3;

// Hard ceiling on raw path enumeration during backtracking, independent of
// `maxPaths` — a dense graph can have combinatorially many equal-length
// shortest paths; this keeps enumeration bounded before the deterministic
// sort+slice below picks the returned subset. Not a tunable product
// threshold (unlike the HABITAT_*/MAX_INTRODUCTION_PATHS constants above),
// just a computational safety valve.
const MAX_PATH_ENUMERATION = 200;

function reconstructPaths(parents, fromRef, toRef) {
  const allPaths = [];

  function backtrack(ref, chainFromTo) {
    if (allPaths.length >= MAX_PATH_ENUMERATION) return;
    if (ref === fromRef) {
      allPaths.push([...chainFromTo].reverse());
      return;
    }
    for (const { parentRef, via, edge } of parents.get(ref) ?? []) {
      if (allPaths.length >= MAX_PATH_ENUMERATION) return;
      backtrack(parentRef, [
        ...chainFromTo,
        { ref, via, relationship_type: edge.relationship_type, role: edge.role ?? null }
      ]);
    }
  }

  backtrack(toRef, []);
  return allPaths;
}

/**
 * Pure BFS shortest-path search over an already-built `network-graph.mjs`
 * graph. Returns an array of path chains, each chain an array of hops
 * `{ ref, via, relationship_type, role }` starting from the first node
 * AFTER `fromRef` and ending at `toRef` (the caller already knows
 * `fromRef`, so it is never repeated as a hop). Returns `[]` — never an
 * error — when `fromRef`/`toRef` are unknown to the graph, identical, or
 * no path exists within `maxHops`.
 */
export function findShortestPaths(graph, fromRef, toRef, { maxHops = 3, maxPaths = MAX_INTRODUCTION_PATHS } = {}) {
  if (!graph.nodes.has(fromRef) || !graph.nodes.has(toRef)) return [];
  if (fromRef === toRef) return [];

  const visitedAtDistance = new Map([[fromRef, 0]]);
  const parents = new Map();
  let frontier = [fromRef];
  let targetDistance = null;

  for (let distance = 1; distance <= maxHops + 1 && targetDistance === null && frontier.length > 0; distance++) {
    const nextFrontier = [];
    for (const ref of frontier) {
      for (const { ref: neighborRef, via, edge } of graph.adjacency.get(ref) ?? []) {
        if (visitedAtDistance.has(neighborRef) && visitedAtDistance.get(neighborRef) < distance) continue;
        if (!visitedAtDistance.has(neighborRef)) {
          visitedAtDistance.set(neighborRef, distance);
          nextFrontier.push(neighborRef);
        }
        if (visitedAtDistance.get(neighborRef) === distance) {
          if (!parents.has(neighborRef)) parents.set(neighborRef, []);
          parents.get(neighborRef).push({ parentRef: ref, via, edge });
        }
      }
    }
    if (visitedAtDistance.get(toRef) === distance) targetDistance = distance;
    frontier = nextFrontier;
  }

  if (targetDistance === null) return [];
  const intermediatePeopleCount = targetDistance - 1;
  if (intermediatePeopleCount > maxHops) return [];

  const allPaths = reconstructPaths(parents, fromRef, toRef);
  allPaths.sort((a, b) => a.map((hop) => hop.ref).join('>').localeCompare(b.map((hop) => hop.ref).join('>')));
  return allPaths.slice(0, maxPaths);
}

/**
 * Async-free orchestrator: builds the shared current-link graph from
 * `peopleWithRelationships` (`loadAllPeopleWithRelationships`'s output,
 * already filtered to visible people by the caller — see
 * network-ecology-world.mjs) and runs `findShortestPaths` over it. Pure —
 * no I/O of its own.
 */
export function findIntroductionPaths(peopleWithRelationships, fromPersonRef, toPersonRef, { maxHops = 3, maxPaths = MAX_INTRODUCTION_PATHS } = {}) {
  const graph = buildRelationshipGraph(peopleWithRelationships);
  return findShortestPaths(graph, fromPersonRef, toPersonRef, { maxHops, maxPaths });
}
