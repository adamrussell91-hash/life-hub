// "Scan my history": a long, resumable pass over older records, 40 sources a batch.
// The page starts it and polls; a background function (career-scan-history-run.mjs)
// does the work, saving each batch's proposals as it finishes. No clock on the page.

import { createCareerRepository } from './career-repository.mjs';
import { collectScanSources } from './career-scan-sources.mjs';
import { draftScanProposals, saveScanDrafts, resolveScanListers } from './career-scan-service.mjs';
import { getJSON, setJSON } from './professional-blobs.mjs';

export const CAREER_SCAN_HISTORY_STATE_KEY = 'career/scan-history-state';
export const HISTORY_BATCH_SIZE = 40;
export const HISTORY_COST_PER_BATCH_AUD = 0.08;
export const HISTORY_MONTHS = [6, 12, 24, 36];
// Past the background function's 15 minute cap the worker can only have died.
export const HISTORY_STALE_MS = 16 * 60_000;
const JOB_BUDGET_MS = 12 * 60_000;
const STRONG = { consistency: 'strong' };

function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function parseHistoryMonths(body) {
  const months = Number(body?.months);
  if (!HISTORY_MONTHS.includes(months)) {
    throw httpError(400, 'invalid_months', 'Choose 6, 12, 24 or 36 months.');
  }
  return months;
}

function monthsBefore(nowIso, months) {
  const d = new Date(nowIso);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

function nowIsoOf(deps) {
  const v = deps.now ? deps.now() : new Date();
  return v instanceof Date ? v.toISOString() : String(v);
}

/** Oldest first, so records that arrive later never shift a finished batch. */
async function collectHistory(deps, { since, until, nowIso, months }) {
  const store = deps.professionalStore;
  const env = deps.env ?? process.env;
  const result = await collectScanSources({
    ...resolveScanListers(deps, env, store),
    nowIso,
    since,
    until,
    windowDays: months * 31 + 1,
    limit: Infinity
  });
  const sources = [...result.sources].sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || a.ref.localeCompare(b.ref)
  );
  return { ...result, sources };
}

export async function historyEstimate(deps, body) {
  const months = parseHistoryMonths(body);
  const nowIso = nowIsoOf(deps);
  const { sources, read_kinds } = await collectHistory(deps, {
    since: monthsBefore(nowIso, months),
    until: nowIso,
    nowIso,
    months
  });
  const by_kind = {};
  for (const s of sources) by_kind[s.kind] = (by_kind[s.kind] ?? 0) + 1;
  const batches = Math.ceil(sources.length / HISTORY_BATCH_SIZE);
  return {
    sources: sources.length,
    batches,
    cost_aud: Math.round(batches * HISTORY_COST_PER_BATCH_AUD * 100) / 100,
    by_kind,
    read_kinds
  };
}

function publicStatus(state) {
  if (!state) return { status: 'idle', batch: 0, batches: 0, proposals_added: 0 };
  let status = state.status;
  let message = state.message;
  if (status === 'running' && Date.now() - Date.parse(state.updated_at) > HISTORY_STALE_MS) {
    status = 'failed';
    message = 'The history scan stopped partway. Start it again to carry on.';
  }
  return {
    status,
    batch: state.batch ?? 0,
    batches: state.batches ?? 0,
    proposals_added: state.proposals_added ?? 0,
    ...(message ? { message } : {})
  };
}

export async function historyStatus(store) {
  return publicStatus(await getJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, STRONG));
}

/**
 * Start (or resume) a history scan. `invoke()` kicks the background function and
 * resolves true when it was accepted.
 */
export async function historyStart(deps, body, { invoke }) {
  const store = deps.professionalStore;
  const env = deps.env ?? process.env;
  const months = parseHistoryMonths(body);
  if (!deps.skipModel && !(typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY)) {
    throw httpError(503, 'ann_unavailable', 'Ann is not connected.');
  }
  const nowIso = nowIsoOf(deps);
  const existing = await getJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, STRONG);
  if (existing && publicStatus(existing).status === 'running') {
    throw httpError(409, 'history_running', 'A history scan is already running.');
  }
  let state;
  const resumable = existing && ['stopped', 'failed', 'running'].includes(existing.status)
    && existing.months === months && existing.batch < existing.batches;
  if (resumable) {
    state = { ...existing, status: 'running', stop_requested: false, message: undefined, updated_at: new Date().toISOString() };
  } else {
    const since = monthsBefore(nowIso, months);
    const { sources } = await collectHistory(deps, { since, until: nowIso, nowIso, months });
    state = {
      status: 'running',
      months,
      since,
      until: nowIso,
      batch: 0,
      batches: Math.ceil(sources.length / HISTORY_BATCH_SIZE),
      proposals_added: 0,
      stop_requested: false,
      started_at: nowIso,
      updated_at: new Date().toISOString()
    };
    if (state.batches === 0) state.status = 'done';
  }
  await setJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, state);
  if (state.status === 'running') {
    let kicked = false;
    try {
      kicked = await invoke();
    } catch {
      kicked = false;
    }
    if (!kicked) {
      await setJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, {
        ...state,
        status: 'failed',
        message: 'Ann could not start. Try again.'
      });
      throw httpError(503, 'ann_unavailable', 'Ann could not start. Try again.');
    }
  }
  return { status: state.status, batch: state.batch, batches: state.batches };
}

/** Stop ends the scan after the batch in flight. */
export async function historyStop(deps) {
  const store = deps.professionalStore;
  const state = await getJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, STRONG);
  if (state && publicStatus(state).status === 'running') {
    await setJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, {
      ...state,
      stop_requested: true,
      updated_at: state.updated_at
    });
    return publicStatus(state);
  }
  return publicStatus(state);
}

/**
 * Background worker. Works from the last finished batch; each batch's proposals are
 * saved before the batch counter moves. Hands on to a fresh run (`chain`) when its
 * time budget is spent, so a long scan outlives one function's cap.
 */
export async function runHistoryJob(deps = {}, { chain, budgetMs = JOB_BUDGET_MS, clock = Date.now } = {}) {
  const store = deps.professionalStore;
  const env = deps.env ?? process.env;
  const startedAt = clock();
  let state = await getJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, STRONG);
  if (!state || state.status !== 'running') return publicStatus(state);

  const save = async (patch) => {
    // Carry a Stop pressed while the batch was in flight; never overwrite it.
    const stored = await getJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, STRONG);
    const stop = 'stop_requested' in patch ? patch.stop_requested : Boolean(stored?.stop_requested);
    state = { ...state, ...patch, stop_requested: stop, updated_at: new Date().toISOString() };
    return setJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, state);
  };

  try {
    const { sources, witness_refs } = await collectHistory(deps, {
      since: state.since,
      until: state.until,
      nowIso: state.until,
      months: state.months
    });
    const careerRepo = createCareerRepository({ store, now: () => new Date().toISOString() });
    const futures = await careerRepo.listFutures();
    while (state.batch < state.batches) {
      const fresh = await getJSON(store, CAREER_SCAN_HISTORY_STATE_KEY, STRONG);
      if (fresh?.stop_requested) {
        await save({ status: 'stopped', stop_requested: false });
        return publicStatus(state);
      }
      if (clock() - startedAt > budgetMs && chain) {
        await save({});
        if (await chain()) return publicStatus(state);
        await save({ status: 'failed', message: 'The history scan could not carry on. Start it again to resume.' });
        return publicStatus(state);
      }
      const slice = sources.slice(state.batch * HISTORY_BATCH_SIZE, (state.batch + 1) * HISTORY_BATCH_SIZE);
      let added = 0;
      if (slice.length) {
        const result = await draftScanProposals({ sources: slice, witness_refs, futures, env, fetchImpl: deps.fetchImpl });
        if (result.failed) {
          await save({ status: 'failed', message: result.message || 'Ann could not read this batch.' });
          return publicStatus(state);
        }
        const saved = await saveScanDrafts({
          store, careerRepo, drafted: result.drafted, sources: slice, witness_refs, futures,
          nowIso: new Date().toISOString()
        });
        added = saved.length;
      }
      await save({ batch: state.batch + 1, proposals_added: (state.proposals_added ?? 0) + added });
    }
    await save({ status: 'done' });
  } catch (error) {
    await save({ status: 'failed', message: error?.message || 'The history scan stopped.' });
  }
  return publicStatus(state);
}

export async function defaultInvokeCareerScanHistoryRun(request, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/career-scan-history-run', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: '{}'
  });
  return response.status === 202 || response.ok;
}
