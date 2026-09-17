import {
  fetchNetworkEcologyEgo,
  fetchNetworkEcologyHistory,
  fetchNetworkEcologyWorld,
  fetchSelfPerson
} from '@/api/network-ecology';
import {
  HABITAT_META,
  HABITAT_ORDER,
  bridgeMarkerColor,
  habitatFillColor,
  mountNetworkGraph,
  type GraphEdge,
  type GraphHandle,
  type GraphNode,
  type HabitatType
} from '@/components/network-graph-canvas';
import { organisationRoute, personRoute } from '@/app/router';
import { parseSharedRef } from '@/domain/ids';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { NetworkEcologyCluster, NetworkEcologyEdge, NetworkEcologyNode } from '@/domain/types';

/**
 * Network Ecology (Phase 4, Features 4.1 World View / 4.3 EGO recentre /
 * 4.4 Your Network / 4.7 Opportunity-Dormancy overlay).
 *
 * DATA-AVAILABILITY DECISIONS this view depends on (verified against
 * `netlify/functions/_shared/network-ecology-world.mjs` and
 * `network-graph.mjs` directly, not assumed):
 *
 * 1. `GET /api/network-ecology/world` returns `clusters` (habitat per
 *    CLUSTER, with a `member_refs` list) and `bridge_people`, but
 *    `GET /api/network-ecology/ego` returns ONLY `{ nodes, edges }` —
 *    `assembleEgoGraph` never computes clusters/bridge people for a
 *    neighbourhood subgraph. So habitat tinting and the bridge-person
 *    marker are only ever drawn in World View here; EGO mode (recentre)
 *    and Your Network mode render the same canvas component with
 *    `habitat`/`isBridge` simply left unset on every node — an honest
 *    reflection of what the server actually returns, not a bug. The
 *    legend (which only makes sense where habitats are actually drawn)
 *    is shown for World View only for the same reason.
 *
 * 2. Opportunity/Dormancy overlay (Feature 4.7): `NetworkEcologyEdge` is
 *    `{ source_ref, target_ref, relationship_type }` — no date field of
 *    any kind. `classifyRelationshipState`
 *    (`apps/professional/src/domain/relationship-state.ts`, ported to
 *    `netlify/functions/_shared/relationship-state.mjs`) is this
 *    codebase's ONE existing dormancy/opportunity classifier, and it
 *    needs `lastMeaningfulInteraction`, `previousMeaningfulInteraction`,
 *    `upcomingInteraction`, `activeSharedContexts` and `personCreatedAt`
 *    per relationship — none of which a graph edge or node carries, and
 *    which `people-home-signals.mjs`'s own `classifyCurrentProfessionalRelationships`
 *    only manages to compute by cross-referencing the WHOLE population's
 *    professional_relationship links (grouped by pair, sorted by
 *    effective date) plus Meetings/Events for `upcomingInteraction`. This
 *    is not a "smallest correct fix" away — porting that whole pipeline
 *    into `network-ecology-world.mjs` for every edge of every `/world`
 *    and `/ego` response, and extending it to cover `employee_at`/
 *    `member_of` links `classifyRelationshipState` was never designed
 *    for, is real, out-of-proportion work. Adding just a bare
 *    `valid_from` to each edge (which the underlying Universal Link does
 *    have — see `universal-link-repository.mjs`) was considered and
 *    rejected: a link's `valid_from` is when the relationship was
 *    RECORDED, not when the two people last actually interacted, so
 *    treating an old `valid_from` as "dormant" would misinform rather
 *    than inform. Documented scope cut per PHASE-1-PROGRESS.md: the
 *    toggle below renders a clearly-labeled "not enough data yet" note
 *    instead of fabricating a dormancy/opportunity signal.
 */

export interface NetworkEcologyOptions {
  isCurrent?: () => boolean;
}

type ViewMode = 'world' | 'ego' | 'your-network' | 'history';
type EdgeLayer = 'organisation' | 'relationship';

/**
 * Feature 4.6 — History mode. SCOPING DECISION (delegated by Adam for this
 * build, documented per the task's own instruction): the mockup/brief's
 * radial time-scrubber UI (dragging through a year-circle) is replaced
 * with a plain `<input type="date">` + "Recompute" button — same
 * underlying point-in-time recomputation
 * (`GET /api/network-ecology/history?date=`), a plainer interaction, given
 * this build's remaining budget. Recompute is a full server-side
 * recompute-on-read per request (see `_shared/network-ecology-history.mjs`'s
 * own doc comment: "no new persisted store"), so it is deliberately never
 * triggered by typing/changing the date input alone — only by the
 * explicit "Recompute" click, exactly the plan's own note about the
 * "full-recompute approach" the History scrubber needs.
 */
function todayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats the server's echoed `date` (an ISO instant) as a plain reading
 * date, e.g. "15 March 2025" — UTC, matching how the server's own
 * `parseHistoryDate` interprets a bare `YYYY-MM-DD` input (UTC midnight),
 * so the displayed date never shifts by a day relative to what was typed. */
function formatHistoryDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    parsed
  );
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

function checkboxLabel(text: string, checked: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = el('label', 'network-ecology__toggle');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  label.append(input, document.createTextNode(` ${text}`));
  return { label, input };
}

/** `employee_at`/`member_of` are the organisation layer; `professional_relationship`
 * is the relationship layer — exactly the split Feature 4.4's two checkboxes name. */
function edgeLayer(relationshipType: string): EdgeLayer {
  return relationshipType === 'professional_relationship' ? 'relationship' : 'organisation';
}

/**
 * World View's clusters carry habitat per CLUSTER with a `member_refs`
 * list; the canvas component tags habitat per NODE. A node that belongs to
 * more than one cluster (a person in two organisations, say) keeps the
 * FIRST habitat assigned as `clusters` is walked in the server's own
 * returned order (organisation clusters before event clusters) — an
 * arbitrary but deterministic tie-break, since the source data has no
 * notion of a "primary" habitat for a node in two clusters simultaneously.
 */
function buildHabitatByRef(clusters: NetworkEcologyCluster[]): Map<string, HabitatType> {
  const map = new Map<string, HabitatType>();
  for (const cluster of clusters) {
    if (!cluster.habitat) continue;
    for (const ref of cluster.member_refs) {
      if (!map.has(ref)) map.set(ref, cluster.habitat);
    }
  }
  return map;
}

function toGraphNodes(
  nodes: NetworkEcologyNode[],
  habitatByRef: Map<string, HabitatType>,
  bridgeRefs: Set<string>
): GraphNode[] {
  return nodes.map((n) => ({
    id: n.ref,
    kind: n.kind,
    label: n.display_name,
    habitat: habitatByRef.get(n.ref) ?? null,
    isBridge: bridgeRefs.has(n.ref)
  }));
}

function toGraphEdges(edges: NetworkEcologyEdge[]): GraphEdge[] {
  return edges.map((e) => ({
    source: e.source_ref,
    target: e.target_ref,
    relationshipType: e.relationship_type,
    layer: edgeLayer(e.relationship_type)
  }));
}

export async function renderNetworkEcologyView(
  canvas: HTMLElement,
  options: NetworkEcologyOptions = {}
): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  canvas.replaceChildren();

  const root = el('div', 'network-ecology');

  const modePills = el('div', 'hub-pills network-ecology__modes');
  modePills.setAttribute('role', 'tablist');
  modePills.setAttribute('aria-label', 'Network Ecology view');
  const worldModeBtn = el('button', 'hub-pills__btn', 'World View');
  worldModeBtn.type = 'button';
  worldModeBtn.setAttribute('role', 'tab');
  const yourNetworkModeBtn = el('button', 'hub-pills__btn', 'Your Network');
  yourNetworkModeBtn.type = 'button';
  yourNetworkModeBtn.setAttribute('role', 'tab');
  const historyModeBtn = el('button', 'hub-pills__btn', 'History');
  historyModeBtn.type = 'button';
  historyModeBtn.setAttribute('role', 'tab');
  modePills.append(worldModeBtn, yourNetworkModeBtn, historyModeBtn);

  const toolbar = el('div', 'network-ecology__toolbar');

  const backButton = el('button', 'btn btn--secondary network-ecology__back', 'Back to World View');
  backButton.type = 'button';
  backButton.hidden = true;

  const { label: orgLayerLabel, input: orgLayerCheckbox } = checkboxLabel('Show organisation links', true);
  const { label: relLayerLabel, input: relLayerCheckbox } = checkboxLabel('Show relationship links', true);
  orgLayerLabel.hidden = true;
  relLayerLabel.hidden = true;

  const { label: overlayLabel, input: overlayCheckbox } = checkboxLabel('Show opportunity & dormancy', false);

  toolbar.append(backButton, orgLayerLabel, relLayerLabel, overlayLabel);

  const historyBar = el('div', 'network-ecology__history-bar');
  historyBar.hidden = true;
  const historyDateLabel = el('label', 'network-ecology__history-date-label', 'Date');
  const historyDateInput = document.createElement('input');
  historyDateInput.type = 'date';
  historyDateInput.className = 'network-ecology__history-date';
  historyDateInput.value = todayDateInputValue();
  historyDateLabel.append(historyDateInput);
  const historyRecomputeBtn = el('button', 'btn btn--primary network-ecology__recompute', 'Recompute');
  historyRecomputeBtn.type = 'button';
  const historyAsOf = el(
    'p',
    'network-ecology__history-as-of',
    'Choose a date and click Recompute to see the network as of that date.'
  );
  historyBar.append(historyDateLabel, historyRecomputeBtn, historyAsOf);

  const overlayNote = el(
    'p',
    'network-ecology__overlay-note empty-state',
    'Not enough data yet: relationship links do not currently carry last-interaction dates, so Opportunity & Dormancy cannot be computed here. Showing the network without this overlay — see PHASE-1-PROGRESS.md for the full reasoning.'
  );
  overlayNote.hidden = true;

  const statusHost = el('div', 'network-ecology__status');
  statusHost.hidden = true;

  const stage = el('div', 'network-ecology__stage');
  const graphHost = el('div', 'network-ecology__graph-host');
  graphHost.setAttribute('role', 'img');
  graphHost.setAttribute('aria-label', 'Network graph');
  const panel = el('aside', 'network-ecology__panel');
  panel.setAttribute('aria-label', 'Selected node');
  panel.hidden = true;
  stage.append(graphHost, panel);

  const legend = el('div', 'network-ecology__legend');
  legend.setAttribute('aria-label', 'Habitat legend');

  root.append(modePills, toolbar, historyBar, overlayNote, statusHost, stage, legend);
  canvas.append(root);

  let mode: ViewMode = 'world';
  let graphHandle: GraphHandle | null = null;
  let fetchToken = 0;
  let egoNodesRaw: GraphNode[] = [];
  let egoEdgesRaw: GraphEdge[] = [];

  function destroyGraph(): void {
    graphHandle?.destroy();
    graphHandle = null;
    graphHost.replaceChildren();
  }

  function updateChrome(): void {
    const isWorldish = mode === 'world' || mode === 'ego';
    worldModeBtn.classList.toggle('is-active', isWorldish);
    worldModeBtn.setAttribute('aria-selected', String(isWorldish));
    yourNetworkModeBtn.classList.toggle('is-active', mode === 'your-network');
    yourNetworkModeBtn.setAttribute('aria-selected', String(mode === 'your-network'));
    historyModeBtn.classList.toggle('is-active', mode === 'history');
    historyModeBtn.setAttribute('aria-selected', String(mode === 'history'));
    backButton.hidden = mode !== 'ego';
    orgLayerLabel.hidden = mode !== 'your-network';
    relLayerLabel.hidden = mode !== 'your-network';
    historyBar.hidden = mode !== 'history';
    // History mode's clusters DO carry a classified habitat (organisation
    // clusters only — see `_shared/network-ecology-history.mjs`'s own
    // scoping note), so the legend is just as meaningful there as in World
    // View.
    legend.hidden = mode !== 'world' && mode !== 'history';
  }

  function showPanel(node: GraphNode | null): void {
    panel.replaceChildren();
    if (!node) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    panel.append(el('h2', 'network-ecology__panel-name', node.label));
    panel.append(el('p', 'network-ecology__panel-kind', node.kind === 'organisation' ? 'Organisation' : 'Person'));
    if (node.isBridge) {
      panel.append(
        el('p', 'network-ecology__panel-bridge', 'Bridge person — connects two or more habitats (see legend).')
      );
    }

    const parsed = parseSharedRef(node.id);
    if (parsed) {
      const link = el(
        'a',
        'network-ecology__panel-link',
        parsed.kind === 'person' ? 'View full profile' : 'View organisation'
      );
      link.href = parsed.kind === 'person' ? personRoute(parsed.id) : organisationRoute(parsed.id);
      panel.append(link);
    }

    const canRecentre = node.kind === 'person' && (mode === 'world' || mode === 'ego');
    if (canRecentre) {
      const recentre = el('button', 'btn btn--primary network-ecology__recentre', 'Recentre here');
      recentre.type = 'button';
      recentre.addEventListener('click', () => {
        void loadEgo(node.id, node.label);
      });
      panel.append(recentre);
    }
  }

  function currentYourNetworkEdges(): GraphEdge[] {
    return egoEdgesRaw.filter((e) => {
      if (e.layer === 'organisation') return orgLayerCheckbox.checked;
      if (e.layer === 'relationship') return relLayerCheckbox.checked;
      return true;
    });
  }

  function mountOrUpdateGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
    if (graphHandle) {
      graphHandle.setData(nodes, edges);
      return;
    }
    graphHost.replaceChildren();
    graphHandle = mountNetworkGraph(graphHost, nodes, edges, {
      reducedMotion,
      onNodeSelect: (node) => showPanel(node)
    });
  }

  function renderLegend(): void {
    legend.replaceChildren();
    for (const habitat of HABITAT_ORDER) {
      const meta = HABITAT_META[habitat];
      const item = el('div', 'network-ecology__legend-item');
      const swatch = el('span', 'network-ecology__legend-swatch');
      swatch.style.background = habitatFillColor(habitat);
      item.append(swatch, el('span', 'network-ecology__legend-label', meta.label));
      legend.append(item);
    }
    // Mangrove is not a classified cluster habitat (see
    // `habitat-classification.mjs` — only forest/reef/savannah/wetland/
    // island are ever returned) — it names the bridge-person MARKER style
    // instead, so its legend entry is deliberately described differently
    // from the five fill swatches above it, not merely another swatch.
    const mangrove = el('div', 'network-ecology__legend-item');
    const marker = el('span', 'network-ecology__legend-marker');
    marker.style.borderColor = bridgeMarkerColor();
    mangrove.append(
      marker,
      el(
        'span',
        'network-ecology__legend-label',
        'Mangrove — bridge people, marked with a ring on the person node itself, not a cluster fill.'
      )
    );
    legend.append(mangrove);
  }

  async function loadWorld(): Promise<void> {
    mode = 'world';
    updateChrome();
    showPanel(null);
    destroyGraph();
    showViewLoading(statusHost, 'Loading world view…');
    statusHost.hidden = false;
    const token = ++fetchToken;
    try {
      const world = await fetchNetworkEcologyWorld();
      if (!isCurrent() || token !== fetchToken) return;
      statusHost.hidden = true;
      statusHost.replaceChildren();
      const habitatByRef = buildHabitatByRef(world.clusters);
      const bridgeRefs = new Set(world.bridge_people.map((b) => b.ref));
      const nodes = toGraphNodes(world.nodes, habitatByRef, bridgeRefs);
      const edges = toGraphEdges(world.edges);
      renderLegend();
      mountOrUpdateGraph(nodes, edges);
    } catch (err) {
      if (!isCurrent() || token !== fetchToken) return;
      statusHost.hidden = false;
      renderLoadError(statusHost, err, () => void loadWorld());
    }
  }

  async function loadEgo(ref: string, label: string): Promise<void> {
    mode = 'ego';
    updateChrome();
    showPanel(null);
    showViewLoading(statusHost, `Loading the network around ${label}…`);
    statusHost.hidden = false;
    const token = ++fetchToken;
    try {
      const ego = await fetchNetworkEcologyEgo(ref, 2);
      if (!isCurrent() || token !== fetchToken) return;
      statusHost.hidden = true;
      statusHost.replaceChildren();
      const nodes = toGraphNodes(ego.nodes, new Map(), new Set());
      const edges = toGraphEdges(ego.edges);
      mountOrUpdateGraph(nodes, edges);
    } catch (err) {
      if (!isCurrent() || token !== fetchToken) return;
      statusHost.hidden = false;
      renderLoadError(statusHost, err, () => void loadEgo(ref, label));
    }
  }

  async function loadYourNetwork(): Promise<void> {
    mode = 'your-network';
    updateChrome();
    showPanel(null);
    destroyGraph();
    showViewLoading(statusHost, 'Finding your network…');
    statusHost.hidden = false;
    const token = ++fetchToken;
    try {
      const selfResponse = await fetchSelfPerson();
      if (!isCurrent() || token !== fetchToken) return;
      if (!selfResponse.self) {
        statusHost.replaceChildren();
        statusHost.append(
          el(
            'p',
            'empty-state',
            'No self person is set up yet. Mark yourself in People before Your Network can show your own neighbourhood.'
          )
        );
        const link = el('a', 'btn btn--secondary', 'Go to People');
        link.href = '#/people';
        statusHost.append(link);
        statusHost.hidden = false;
        return;
      }

      const ego = await fetchNetworkEcologyEgo(selfResponse.self.ref, 2);
      if (!isCurrent() || token !== fetchToken) return;
      statusHost.hidden = true;
      statusHost.replaceChildren();
      egoNodesRaw = toGraphNodes(ego.nodes, new Map(), new Set());
      egoEdgesRaw = toGraphEdges(ego.edges);
      mountOrUpdateGraph(egoNodesRaw, currentYourNetworkEdges());
    } catch (err) {
      if (!isCurrent() || token !== fetchToken) return;
      statusHost.hidden = false;
      renderLoadError(statusHost, err, () => void loadYourNetwork());
    }
  }

  async function loadHistory(dateValue: string): Promise<void> {
    mode = 'history';
    updateChrome();
    showPanel(null);
    destroyGraph();
    showViewLoading(statusHost, `Loading the network as of ${dateValue}…`);
    statusHost.hidden = false;
    const token = ++fetchToken;
    try {
      const history = await fetchNetworkEcologyHistory(dateValue);
      if (!isCurrent() || token !== fetchToken) return;
      statusHost.hidden = true;
      statusHost.replaceChildren();
      const habitatByRef = buildHabitatByRef(history.clusters);
      const bridgeRefs = new Set(history.bridge_people.map((b) => b.ref));
      const nodes = toGraphNodes(history.nodes, habitatByRef, bridgeRefs);
      const edges = toGraphEdges(history.edges);
      renderLegend();
      mountOrUpdateGraph(nodes, edges);
      // Show the queried date clearly, unambiguously, from the SERVER's
      // own echoed `date` — never just the raw input value — so what is
      // displayed always matches exactly what the server actually
      // computed against.
      historyAsOf.textContent = `Showing network as of ${formatHistoryDate(history.date)}.`;
    } catch (err) {
      if (!isCurrent() || token !== fetchToken) return;
      statusHost.hidden = false;
      renderLoadError(statusHost, err, () => void loadHistory(dateValue));
    }
  }

  worldModeBtn.addEventListener('click', () => {
    if (mode === 'world') return;
    void loadWorld();
  });
  yourNetworkModeBtn.addEventListener('click', () => {
    if (mode === 'your-network') return;
    void loadYourNetwork();
  });
  historyModeBtn.addEventListener('click', () => {
    if (mode === 'history') return;
    // Switching INTO History mode never fetches by itself — only the
    // explicit "Recompute" click does (see the module-level doc comment
    // above `todayDateInputValue`). Reset to a clean prompt state instead.
    mode = 'history';
    updateChrome();
    showPanel(null);
    destroyGraph();
    statusHost.hidden = true;
    statusHost.replaceChildren();
    historyAsOf.textContent = 'Choose a date and click Recompute to see the network as of that date.';
  });
  historyRecomputeBtn.addEventListener('click', () => {
    void loadHistory(historyDateInput.value);
  });
  backButton.addEventListener('click', () => void loadWorld());

  // Layer checkboxes filter the ALREADY-FETCHED edge set client-side —
  // never a new fetch (Feature 4.4's explicit requirement).
  orgLayerCheckbox.addEventListener('change', () => {
    if (mode !== 'your-network' || !graphHandle) return;
    graphHandle.setData(egoNodesRaw, currentYourNetworkEdges());
  });
  relLayerCheckbox.addEventListener('change', () => {
    if (mode !== 'your-network' || !graphHandle) return;
    graphHandle.setData(egoNodesRaw, currentYourNetworkEdges());
  });

  overlayCheckbox.addEventListener('change', () => {
    overlayNote.hidden = !overlayCheckbox.checked;
  });

  updateChrome();
  await loadWorld();
}
