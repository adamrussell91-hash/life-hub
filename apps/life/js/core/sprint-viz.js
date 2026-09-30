/**
 * Challenge-sprint Home-card chart allowlist.
 * Subset of packages/design-kit/CHART-CATALOG.md — only types the Home
 * #home-sprints card can actually mount with sprint headline/lane evidence.
 */

/** @typedef {{ id: string, slot: 'headline'|'lanes', name: string, purpose: string, limits: string }} SprintVizOption */

/** @type {SprintVizOption[]} */
export const SPRINT_VIZ_ALLOWLIST = [
  {
    id: 'glide-slope',
    slot: 'headline',
    name: 'Glide slope',
    purpose: 'Numeric headline trending down toward a target (tape, weight).',
    limits: 'Needs ≥2 readings; projection is a gist, not a promise.'
  },
  {
    id: 'area-line',
    slot: 'headline',
    name: 'Area-line trend',
    purpose: 'Default time series for up or down headline metrics.',
    limits: 'Dense daily points blur past ~30 ticks on a card.'
  },
  {
    id: 'carved-away',
    slot: 'headline',
    name: 'Carved away',
    purpose: 'Shed-from-high story (body fat / mass carved below running high).',
    limits: 'Needs a clear peak; noisy series muddle the carved mass.'
  },
  {
    id: 'stairs-down',
    slot: 'headline',
    name: 'Stairs down',
    purpose: 'Step-by-step drop (or rise) per reading toward a band.',
    limits: 'Many periods → tiny steps on phone width.'
  },
  {
    id: 'ring',
    slot: 'headline',
    name: 'Progress ring',
    purpose: 'One headline value vs one target as a stroke fraction.',
    limits: 'One measure only; overshoot needs a separate read.'
  },
  {
    id: 'spark-area',
    slot: 'headline',
    name: 'Compact area spark',
    purpose: 'Tiny under-value trend gist when a full kit chart is too heavy.',
    limits: '~7–14 points; not for precise value reading.'
  },
  {
    id: 'progress-track',
    slot: 'lanes',
    name: 'Progress tracks',
    purpose: 'Thin horizontal fill for each lead measure (met / judged days).',
    limits: 'Single fraction per measure; no history.'
  },
  {
    id: 'ring',
    slot: 'lanes',
    name: 'Progress rings',
    purpose: 'Ring per lead measure for completion vs target.',
    limits: 'Tiny rings lose labels under ~48px — keep captions beside.'
  },
  {
    id: 'gate-rings',
    slot: 'lanes',
    name: 'Gate rings',
    purpose: 'Concentric rings vs thresholds when several lanes share a gate story.',
    limits: 'A few keys only; more rings → unreadable stroke gaps.'
  }
];

const HEADLINE_IDS = new Set(
  SPRINT_VIZ_ALLOWLIST.filter(o => o.slot === 'headline').map(o => o.id)
);
const LANE_IDS = new Set(
  SPRINT_VIZ_ALLOWLIST.filter(o => o.slot === 'lanes').map(o => o.id)
);

/** Accept legacy / plain-language aliases → catalog id. */
const ALIASES = {
  'progress-ring': 'ring',
  'progress_ring': 'ring',
  sparkline: 'spark-area',
  spark: 'spark-area',
  tracks: 'progress-track',
  'progress-tracks': 'progress-track',
  glide: 'glide-slope',
  'glide_slope': 'glide-slope',
  carved: 'carved-away',
  stairs: 'stairs-down',
  'area_line': 'area-line',
  gate: 'gate-rings'
};

export function canonicalVizId(raw) {
  if (raw == null || raw === '') return null;
  const id = String(raw).trim().toLowerCase();
  if (!id) return null;
  return ALIASES[id] || id;
}

export function vizPlainName(id, slot = 'headline') {
  const canon = canonicalVizId(id);
  const hit = SPRINT_VIZ_ALLOWLIST.find(o => o.id === canon && o.slot === slot)
    || SPRINT_VIZ_ALLOWLIST.find(o => o.id === canon);
  return hit?.name || canon || 'unknown';
}

/**
 * Validate optional viz payload. Prefer deny on open/revise (Hammond fixes it).
 * @returns {{ ok: true, viz: { headline: string, lanes: string } } | { ok: false, reason: string }}
 */
export function normalizeSprintViz(raw) {
  if (raw == null) return { ok: true, viz: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'viz must be an object with headline and/or lanes chart ids' };
  }
  const headlineRaw = raw.headline != null ? canonicalVizId(raw.headline) : null;
  const lanesRaw = raw.lanes != null ? canonicalVizId(raw.lanes) : null;
  if (raw.headline != null && !HEADLINE_IDS.has(headlineRaw)) {
    return {
      ok: false,
      reason: `Unknown viz.headline "${raw.headline}" — pick from the Sprint viz picker (Home card allowlist), e.g. glide-slope, area-line, carved-away`
    };
  }
  if (raw.lanes != null && !LANE_IDS.has(lanesRaw)) {
    return {
      ok: false,
      reason: `Unknown viz.lanes "${raw.lanes}" — pick progress-track, ring, or gate-rings`
    };
  }
  if (headlineRaw == null && lanesRaw == null) {
    return { ok: false, reason: 'viz needs headline and/or lanes' };
  }
  return {
    ok: true,
    viz: {
      ...(headlineRaw ? { headline: headlineRaw } : {}),
      ...(lanesRaw ? { lanes: lanesRaw } : {})
    }
  };
}

/**
 * Resolve effective viz for render: explicit sprint.viz, else sensible defaults.
 * Older / Phase-0 sprints without viz get defaults (documented in PR).
 */
export function resolveSprintViz(sprintOrState) {
  const stored = sprintOrState?.viz && typeof sprintOrState.viz === 'object'
    ? sprintOrState.viz
    : null;
  const headlineStored = stored?.headline ? canonicalVizId(stored.headline) : null;
  const lanesStored = stored?.lanes ? canonicalVizId(stored.lanes) : null;

  const direction = sprintOrState?.headline?.direction
    || sprintOrState?.headline?.metric?.direction
    || 'down';
  const readingCount = Array.isArray(sprintOrState?.headline?.readings)
    ? sprintOrState.headline.readings.length
    : 0;

  let headline = headlineStored && HEADLINE_IDS.has(headlineStored) ? headlineStored : null;
  if (!headline) {
    if (direction === 'down' && readingCount >= 2) headline = 'glide-slope';
    else if (readingCount >= 2) headline = 'area-line';
    else headline = 'spark-area';
  }

  let lanes = lanesStored && LANE_IDS.has(lanesStored) ? lanesStored : null;
  if (!lanes) lanes = 'progress-track';

  return {
    headline,
    lanes,
    explicit: Boolean(headlineStored || lanesStored),
    defaulted: !headlineStored || !lanesStored
  };
}

export function formatVizForConfirm(viz) {
  if (!viz || typeof viz !== 'object') return '';
  const parts = [];
  if (viz.headline) parts.push(`headline chart: ${vizPlainName(viz.headline, 'headline')} (${viz.headline})`);
  if (viz.lanes) parts.push(`lane chart: ${vizPlainName(viz.lanes, 'lanes')} (${viz.lanes})`);
  return parts.join('; ');
}

/** Compact picker for Hammond / lead agents designing a sprint — not the full catalog. */
export function formatSprintVizPickerBlock(active = true) {
  if (!active) return '';
  const headline = SPRINT_VIZ_ALLOWLIST.filter(o => o.slot === 'headline')
    .map(o => `- ${o.id} — ${o.name}: ${o.purpose} Limits: ${o.limits}`)
    .join('\n');
  const lanes = SPRINT_VIZ_ALLOWLIST.filter(o => o.slot === 'lanes')
    .map(o => `- ${o.id} — ${o.name}: ${o.purpose} Limits: ${o.limits}`)
    .join('\n');
  return [
    'SPRINT VIZ PICKER (Home #home-sprints card — choose before Confirm; only these ids render):',
    'Pass viz: { headline, lanes } on track_open_sprint / track_revise_sprint.',
    'Pick headline for the scoreboard shape: down-to-target → glide-slope or carved-away; general trend → area-line; completion vs target → ring; tiny gist → spark-area; step drops → stairs-down.',
    'Pick lanes: progress-track (default), ring, or gate-rings for multi-threshold lanes.',
    'Unknown ids are denied — fix the pick, do not invent chart types.',
    'Headline options:',
    headline,
    'Lane options:',
    lanes
  ].join('\n');
}
