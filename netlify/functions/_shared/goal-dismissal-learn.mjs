// netlify/functions/_shared/goal-dismissal-learn.mjs
/**
 * G-33 Dismissal learning: stop proposing a kind after ≥3 dismissals in 30 days with no accepts.
 */
const DECISIONS_KEY = 'goal_reads/_decisions';
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const THRESHOLD = 3;

export function decisionsKey() {
  return DECISIONS_KEY;
}

export function cooledKindsFromDecisions(decisions, nowMs = Date.now()) {
  const since = nowMs - WINDOW_MS;
  const byKind = new Map();
  for (const row of Array.isArray(decisions) ? decisions : []) {
    if (!row || typeof row.kind !== 'string') continue;
    const at = Date.parse(row.at ?? '');
    if (!Number.isFinite(at) || at < since) continue;
    const bucket = byKind.get(row.kind) ?? { dismiss: 0, accept: 0, lastDismiss: 0 };
    if (row.outcome === 'dismiss') {
      bucket.dismiss += 1;
      bucket.lastDismiss = Math.max(bucket.lastDismiss, at);
    } else if (row.outcome === 'accept') {
      bucket.accept += 1;
    }
    byKind.set(row.kind, bucket);
  }
  const cooled = new Set();
  for (const [kind, bucket] of byKind) {
    if (bucket.dismiss >= THRESHOLD && bucket.accept === 0) cooled.add(kind);
  }
  return cooled;
}

export function quietLinesForCooled(cooled) {
  const labels = {
    goal_rest_weeks: "I've stopped suggesting rest weeks. You kept declining them.",
    protect_block: "I've stopped suggesting calendar blocks. You kept declining them.",
    split_task: "I've stopped suggesting splits. You kept declining them.",
    create_task: "I've stopped suggesting new starts. You kept declining them.",
    move_task: "I've stopped suggesting due-date moves. You kept declining them."
  };
  return [...cooled].map(kind => ({
    kind,
    line: `${labels[kind] ?? `I've stopped suggesting ${kind}.`} Undo`
  }));
}

export async function appendDecision(store, { kind, outcome, at }, { getJSON, setJSON }) {
  const existing = (await getJSON(store, DECISIONS_KEY)) ?? { decisions: [] };
  const decisions = Array.isArray(existing.decisions) ? existing.decisions : [];
  decisions.push({ kind, outcome, at });
  await setJSON(store, DECISIONS_KEY, { decisions: decisions.slice(-500) });
  return decisions;
}

export async function clearKindCooldown(store, kind, { getJSON, setJSON }) {
  const existing = (await getJSON(store, DECISIONS_KEY)) ?? { decisions: [] };
  const decisions = (Array.isArray(existing.decisions) ? existing.decisions : [])
    .filter(row => row?.kind !== kind);
  await setJSON(store, DECISIONS_KEY, { decisions });
  return decisions;
}
