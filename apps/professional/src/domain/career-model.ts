/**
 * Single Career page model (V4). Every readiness %, match %, fork label and
 * What-if delta on the page must come from one call to buildCareerModel.
 */

const FADING_MS = 183 * 24 * 60 * 60 * 1000;
const SIX_WEEKS_MS = 42 * 24 * 60 * 60 * 1000;

export function criterionCoverage(strength: string | null | undefined): number {
  if (strength === 'strong') return 1;
  if (strength === 'some') return 0.5;
  return 0;
}

export function readinessPercent(
  criteria: Array<{ id: string }> | null | undefined,
  supports: Array<{ criterion_ids?: string[]; strength?: string }> = []
): number | null {
  if (!criteria?.length) return null;
  const byCriterion = new Map<string, number>();
  for (const link of supports) {
    for (const id of link.criterion_ids ?? []) {
      const next = criterionCoverage(link.strength);
      const prev = byCriterion.get(id) ?? 0;
      if (next > prev) byCriterion.set(id, next);
    }
  }
  const mean =
    criteria.reduce((sum, criterion) => sum + (byCriterion.get(criterion.id) ?? 0), 0) /
    criteria.length;
  return Math.round(100 * mean);
}

export function applicationMatchPercent(
  selectionCriteria: Array<{ id: string }> | null | undefined,
  answers: Array<{ criterion_id?: string; strength?: string }> = []
): number | null {
  if (!selectionCriteria?.length) return null;
  const byCriterion = new Map<string, number>();
  for (const link of answers) {
    const id = link.criterion_id;
    if (!id) continue;
    const next = criterionCoverage(link.strength);
    const prev = byCriterion.get(id) ?? 0;
    if (next > prev) byCriterion.set(id, next);
  }
  const mean =
    selectionCriteria.reduce((sum, criterion) => sum + (byCriterion.get(criterion.id) ?? 0), 0) /
    selectionCriteria.length;
  return Math.round(100 * mean);
}

export function isSteppingStoneDone(
  stone: { status_override?: string | null },
  actionEndpoints: Array<{ kind?: string; lifecycle_status?: string | null }> = []
): boolean {
  if (stone?.status_override === 'done') return true;
  if (stone?.status_override === 'dropped') return false;
  for (const endpoint of actionEndpoints) {
    const status = endpoint?.lifecycle_status;
    const kind = endpoint?.kind;
    if (kind === 'task' && status === 'done') return true;
    if (kind === 'goal' && status === 'achieved') return true;
    if (kind === 'project' && (status === 'completed' || status === 'archived_dead')) return true;
  }
  return false;
}

function parseDay(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isFinite(t) ? t : null;
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Rough term label — school-time.js wiring lands in Phase 3. */
export function roughTermLabel(
  isoDate: string | null | undefined,
  { estimated = true }: { estimated?: boolean } = {}
): string | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  let term = 4;
  if (month <= 3) term = 1;
  else if (month <= 6) term = 2;
  else if (month <= 9) term = 3;
  const label = `T${term} ${year}`;
  return estimated ? `~${label}` : label;
}

function daysSince(iso: string | null | undefined, nowMs: number): number {
  const t = parseDay(iso);
  if (t == null) return Infinity;
  return nowMs - t;
}

export type CareerModelOverview = {
  achievements?: Array<{
    id: string;
    title: string;
    occurred_on: string;
    date_precision: string;
    lifecycle_status: string;
  }>;
  futures?: Array<{
    id: string;
    title: string;
    where?: string | null;
    status: string;
    suggested_reason?: string | null;
    lane_order: number;
    colour_slot: number;
    criteria: Array<{ id: string; text: string; order: number; source: string }>;
    target_date?: string | null;
    aliases?: string[];
    created_at?: string;
  }>;
  stones?: Array<{
    id: string;
    label: string;
    target_term_start?: string | null;
    origin: string;
    status_override?: string | null;
  }>;
  applications?: Array<{
    id: string;
    position_title: string;
    pipeline_status: string;
    closing_date?: string | null;
    selection_criteria?: Array<{ id: string }>;
  }>;
  supports_future?: Array<{
    source_id?: string;
    target_id?: string;
    future_id?: string;
    criterion_ids?: string[];
    strength?: string;
    updated_at?: string;
    created_at?: string;
  }>;
  answers_criterion?: Array<{
    target_id?: string;
    application_id?: string;
    criterion_id?: string;
    strength?: string;
  }>;
  stone_for?: Array<{
    source_id?: string;
    stone_id?: string;
    target_id?: string;
    future_id?: string;
  }>;
  stone_actions?: Array<{
    target_id?: string;
    stone_id?: string;
    endpoint?: { kind?: string; lifecycle_status?: string | null };
    kind?: string;
    lifecycle_status?: string | null;
  }>;
  employment?: Array<{
    valid_from?: string | null;
    valid_to?: string | null;
    role?: string | null;
    label?: string | null;
  }>;
  ghost_paths?: unknown[];
  scan?: { pending_count?: number; last_run_at?: string | null };
  moves?: Array<{
    status?: string;
    coverages?: Array<{ future_id: string; criterion_ids?: string[]; strength?: string }>;
  }>;
};

/**
 * @param overview — career payload (achievements, futures, stones, links, applications)
 */
export function buildCareerModel(
  overview: CareerModelOverview | null | undefined,
  options: { moves?: CareerModelOverview['moves']; now?: string | Date } = {}
) {
  const nowMs = options.now ? Date.parse(String(options.now)) : Date.now();
  const nowIso = new Date(nowMs).toISOString().slice(0, 10);
  const moves = Array.isArray(options.moves) ? options.moves : overview?.moves ?? [];

  const achievements = Array.isArray(overview?.achievements) ? overview.achievements : [];
  const futures = Array.isArray(overview?.futures) ? overview.futures : [];
  const stones = Array.isArray(overview?.stones) ? overview.stones : [];
  const applications = Array.isArray(overview?.applications) ? overview.applications : [];
  const supportsFuture = Array.isArray(overview?.supports_future) ? overview.supports_future : [];
  const answersCriterion = Array.isArray(overview?.answers_criterion)
    ? overview.answers_criterion
    : [];
  const stoneFor = Array.isArray(overview?.stone_for) ? overview.stone_for : [];
  const stoneActions = Array.isArray(overview?.stone_actions) ? overview.stone_actions : [];
  const employment = Array.isArray(overview?.employment) ? overview.employment : [];

  const actionsByStone = new Map<string, Array<{ kind?: string; lifecycle_status?: string | null }>>();
  for (const link of stoneActions) {
    const stoneId = link.target_id || link.stone_id;
    if (!stoneId) continue;
    const list = actionsByStone.get(stoneId) ?? [];
    list.push(link.endpoint ?? link);
    actionsByStone.set(stoneId, list);
  }

  const futuresByStone = new Map<string, string[]>();
  for (const link of stoneFor) {
    const stoneId = link.source_id || link.stone_id;
    const futureId = link.target_id || link.future_id;
    if (!stoneId || !futureId) continue;
    const list = futuresByStone.get(stoneId) ?? [];
    list.push(futureId);
    futuresByStone.set(stoneId, list);
  }

  const supportsByFuture = new Map<
    string,
    Array<{ criterion_ids?: string[]; strength?: string; updated_at?: string; created_at?: string }>
  >();
  for (const link of supportsFuture) {
    const futureId = link.target_id || link.future_id;
    if (!futureId) continue;
    const list = supportsByFuture.get(futureId) ?? [];
    list.push(link);
    supportsByFuture.set(futureId, list);
  }

  const answersByApplication = new Map<
    string,
    Array<{ criterion_id?: string; strength?: string }>
  >();
  for (const link of answersCriterion) {
    const appId = link.target_id || link.application_id;
    if (!appId) continue;
    const list = answersByApplication.get(appId) ?? [];
    list.push(link);
    answersByApplication.set(appId, list);
  }

  function supportsWithMoves(
    baseMap: Map<
      string,
      Array<{ criterion_ids?: string[]; strength?: string; updated_at?: string; created_at?: string }>
    >
  ) {
    const cloned = new Map([...baseMap.entries()].map(([k, v]) => [k, [...v]]));
    for (const move of moves ?? []) {
      if (!move || move.status === 'dismissed') continue;
      for (const coverage of move.coverages ?? []) {
        const futureId = coverage.future_id;
        if (!futureId) continue;
        const list = cloned.get(futureId) ?? [];
        list.push({
          criterion_ids: coverage.criterion_ids ?? [],
          strength: coverage.strength ?? 'some'
        });
        cloned.set(futureId, list);
      }
    }
    return cloned;
  }

  const effectiveSupports = supportsWithMoves(supportsByFuture);

  const stoneModels = stones.map((stone) => {
    const futureIds = futuresByStone.get(stone.id) ?? [];
    const actions = actionsByStone.get(stone.id) ?? [];
    const done = isSteppingStoneDone(stone, actions);
    return {
      id: stone.id,
      label: stone.label,
      target_term_start: stone.target_term_start ?? null,
      origin: stone.origin,
      done,
      future_ids: futureIds,
      shared: futureIds.length >= 2,
      helps_count: futureIds.length,
      actions
    };
  });

  const visibleFutures = futures.filter((f) => f.status === 'active' || f.status === 'suggested');

  const futureModels = visibleFutures.map((future) => {
    const supports = effectiveSupports.get(future.id) ?? [];
    const readiness = readinessPercent(future.criteria, supports);
    const byCriterion = new Map<string, number>();
    const supportersByCriterion = new Map<string, Array<{ id: string; title: string; strength: string }>>();
    for (const link of supports) {
      for (const id of link.criterion_ids ?? []) {
        const next = criterionCoverage(link.strength);
        const prev = byCriterion.get(id) ?? 0;
        if (next > prev) byCriterion.set(id, next);
        const sourceId = (link as { source_id?: string }).source_id;
        if (sourceId) {
          const card = achievements.find((a) => a.id === sourceId);
          const list = supportersByCriterion.get(id) ?? [];
          list.push({
            id: sourceId,
            title: card?.title ?? sourceId,
            strength: link.strength ?? 'some'
          });
          supportersByCriterion.set(id, list);
        }
      }
    }
    const criteriaModels = (future.criteria ?? []).map((c) => {
      const coverage = byCriterion.get(c.id) ?? 0;
      const supporting = (supportersByCriterion.get(c.id) ?? [])
        .sort((a, b) => criterionCoverage(b.strength) - criterionCoverage(a.strength))
        .slice(0, 2);
      return {
        id: c.id,
        text: c.text,
        order: c.order,
        source: c.source,
        coverage,
        supporting
      };
    });
    const ownStones = stoneModels.filter(
      (s) => s.future_ids.includes(future.id) && !s.shared && !s.done
    );
    const sharedOpen = stoneModels.filter(
      (s) => s.future_ids.includes(future.id) && s.shared && !s.done
    );
    const openDated = [...ownStones, ...sharedOpen]
      .map((s) => s.target_term_start)
      .filter((d): d is string => Boolean(d))
      .sort();
    let arrivalDate: string | null = null;
    if (openDated.length) {
      arrivalDate = addMonths(openDated[openDated.length - 1], 3);
    } else if (future.target_date) {
      arrivalDate = future.target_date;
    }
    const arrival_label = arrivalDate ? roughTermLabel(arrivalDate, { estimated: true }) : null;

    let splitDate: string;
    const sharedDates = sharedOpen
      .map((s) => s.target_term_start)
      .filter((d): d is string => Boolean(d))
      .sort();
    if (sharedDates.length) {
      splitDate = sharedDates[sharedDates.length - 1];
    } else {
      splitDate = new Date(nowMs + SIX_WEEKS_MS).toISOString().slice(0, 10);
    }

    const newestSupport = supports
      .map((s) => s.updated_at || s.created_at || null)
      .filter(Boolean)
      .sort()
      .pop();
    const fading =
      future.status === 'active' &&
      (newestSupport
        ? daysSince(newestSupport, nowMs) > FADING_MS
        : daysSince(future.created_at, nowMs) > FADING_MS);
    const fading_since = newestSupport || future.created_at || null;

    return {
      id: future.id,
      title: future.title,
      where: future.where ?? null,
      status: future.status,
      suggested_reason: future.suggested_reason ?? null,
      lane_order: future.lane_order,
      colour_slot: future.colour_slot,
      criteria: criteriaModels,
      readiness,
      readiness_label: readiness == null ? 'Add criteria' : `${readiness}%`,
      arrival_date: arrivalDate,
      arrival_label,
      split_date: splitDate,
      split_label: roughTermLabel(splitDate, { estimated: false }),
      fading,
      fading_since,
      aliases: future.aliases ?? [],
      target_date: future.target_date ?? null,
      stones: stoneModels
        .filter((s) => s.future_ids.includes(future.id))
        .sort((a, b) => {
          if (!a.target_term_start && !b.target_term_start) return 0;
          if (!a.target_term_start) return 1;
          if (!b.target_term_start) return -1;
          return a.target_term_start.localeCompare(b.target_term_start);
        })
    };
  });

  const forkDate = futureModels
    .map((f) => f.split_date)
    .filter(Boolean)
    .sort()
    .pop();
  const forkCount = forkDate
    ? futureModels.filter((f) => f.split_date && f.split_date >= forkDate).length
    : 0;

  const applicationModels = applications.map((app) => {
    const criteria = app.selection_criteria ?? [];
    const answers = answersByApplication.get(app.id) ?? [];
    const match = applicationMatchPercent(criteria, answers);
    return {
      id: app.id,
      position_title: app.position_title,
      pipeline_status: app.pipeline_status,
      closing_date: app.closing_date ?? null,
      match_percent: match,
      match_label: match == null ? null : `${match}%`
    };
  });

  const futuresByAchievement = new Map<string, string[]>();
  for (const link of supportsFuture) {
    const sourceId = link.source_id;
    const futureId = link.target_id || link.future_id;
    if (!sourceId || !futureId) continue;
    const list = futuresByAchievement.get(sourceId) ?? [];
    list.push(futureId);
    futuresByAchievement.set(sourceId, list);
  }

  const trunkItems = achievements
    .filter((a) => a.lifecycle_status === 'active')
    .map((a) => ({
      id: a.id,
      title: a.title,
      occurred_on: a.occurred_on,
      date_precision: a.date_precision,
      future_ids: futuresByAchievement.get(a.id) ?? []
    }));

  const yearsBehind = (() => {
    const starts = employment.map((e) => e.valid_from).filter(Boolean).sort() as string[];
    if (!starts.length) return null;
    const first = parseDay(starts[0]);
    if (first == null) return null;
    return Math.max(0, Math.floor((nowMs - first) / (365.25 * 24 * 60 * 60 * 1000)));
  })();

  const baseWithoutMoves =
    moves && moves.length
      ? buildCareerModel({ ...overview, moves: undefined }, { now: options.now, moves: [] })
      : null;

  const whatIfDeltas = baseWithoutMoves
    ? futureModels.map((f) => {
        const before = baseWithoutMoves.futures.find((x) => x.id === f.id);
        const readinessDelta = (f.readiness ?? 0) - (before?.readiness ?? 0);
        return {
          future_id: f.id,
          title: f.title,
          readiness_delta: readinessDelta,
          arrival_before: before?.arrival_label ?? null,
          arrival_after: f.arrival_label
        };
      })
    : [];

  const activeCount = futureModels.filter((f) => f.status === 'active').length;

  return {
    now: nowIso,
    stats: {
      years_behind: yearsBehind,
      futures_ahead: activeCount,
      skill_cards: trunkItems.length
    },
    stats_line: (() => {
      const parts: string[] = [];
      if (yearsBehind != null) parts.push(`${yearsBehind} years behind you`);
      parts.push(`${activeCount} futures ahead`);
      parts.push(`${trunkItems.length} skill cards`);
      return parts.join(' · ');
    })(),
    trunk_items: trunkItems,
    futures: futureModels,
    stones: stoneModels,
    shared_stones: stoneModels.filter((s) => s.shared),
    fork: forkDate
      ? {
          date: forkDate,
          label: roughTermLabel(forkDate, { estimated: false }),
          futures_count: forkCount,
          caption: `${forkCount} futures share the road until here`
        }
      : null,
    ghost_paths: overview?.ghost_paths ?? [],
    scan: overview?.scan ?? { pending_count: 0, last_run_at: null },
    ledger: trunkItems,
    applications: applicationModels,
    employment,
    what_if_deltas: whatIfDeltas,
    parked_futures: futures.filter((f) => f.status === 'parked')
  };
}
