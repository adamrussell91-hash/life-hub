/**
 * Skills scan: Sunday 17:00 Sydney gate, proposal store, keep/bin, run-now.
 */

import { createHash } from 'node:crypto';
import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { createCareerRepository } from './career-repository.mjs';
import { generateScanProposalId, isValidScanProposalId } from './career-schema.mjs';
import { sanitizeApstFocus } from './apst-focus.mjs';
import { sydneyHourParts } from './remember-service.mjs';
import {
  CAREER_SCAN_PROPOSAL_PREFIX,
  CAREER_SCAN_STATE_KEY,
  careerScanProposalByHashKey,
  careerScanProposalKey,
  defaultGetProfessionalStore,
  getJSON,
  setJSON
} from './professional-blobs.mjs';
import { listBlobKeys, isIndexKey } from './blobs-list.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { skillsScanPrompt } from './career-prompts.mjs';

const RATE_LIMIT_MS = 10 * 60 * 1000;
const WINDOW_CAP_DAYS = 21;
const MODEL = 'claude-sonnet-5';

export function sourceRefsHash(refs) {
  const sorted = [...new Set((refs ?? []).map(String).filter(Boolean))].sort();
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/** Sunday 17:00 Sydney, once per ISO week. */
export function shouldRunCareerScanNow(now = new Date(), state = {}) {
  const { hour, dayKey } = sydneyHourParts(now);
  const dow = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short'
  }).format(now);
  if (dow !== 'Sun' || hour !== 17) {
    return { run: false, dayKey, weekKey: isoWeekKey(now) };
  }
  const weekKey = isoWeekKey(now);
  if (state?.last_success_week === weekKey) {
    return { run: false, dayKey, weekKey };
  }
  return { run: true, dayKey, weekKey };
}

export function isoWeekKey(now = new Date()) {
  // ISO week using Sydney calendar date
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const d = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function nextSundayLabel(from = new Date()) {
  const parts = sydneyHourParts(from);
  // Walk forward until next Sunday in Sydney — approximate via UTC day math on Sydney dayKey
  let cursor = new Date(`${parts.dayKey}T12:00:00Z`);
  for (let i = 0; i < 8; i++) {
    const label = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).format(cursor);
    const dow = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' }).format(cursor);
    if (dow === 'Sun' && i > 0) return label;
    if (dow === 'Sun' && i === 0) {
      // today is Sunday — next is +7
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return 'next Sunday';
}

export async function listScanProposalKeys(store) {
  return (await listBlobKeys(store, CAREER_SCAN_PROPOSAL_PREFIX)).filter((key) => !isIndexKey(key));
}

export async function listScanProposals(store, { status } = {}) {
  const keys = await listScanProposalKeys(store);
  const out = [];
  for (const key of keys) {
    const id = key.slice(CAREER_SCAN_PROPOSAL_PREFIX.length);
    if (!isValidScanProposalId(id)) continue;
    const record = await getJSON(store, careerScanProposalKey(id));
    if (!record) continue;
    if (status && record.status !== status) continue;
    out.push(record);
  }
  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return out;
}

function validateProposalShape(raw, allowedRefs, futures) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 200) : '';
  if (!title) return null;
  const source_refs = Array.isArray(raw.source_refs)
    ? raw.source_refs.map(String).filter((r) => allowedRefs.has(r))
    : [];
  if (!source_refs.length) return null;
  const witness_refs = Array.isArray(raw.witness_refs)
    ? raw.witness_refs.map(String).filter((r) => allowedRefs.has(r) || r.startsWith('shared:person:'))
    : [];
  const futureIds = new Set((futures ?? []).map((f) => f.id));
  const criterionIds = new Set(
    (futures ?? []).flatMap((f) => (f.criteria ?? []).map((c) => c.id))
  );
  const future_matches = Array.isArray(raw.future_matches)
    ? raw.future_matches
        .filter(
          (m) =>
            m &&
            futureIds.has(m.future_id) &&
            Array.isArray(m.criterion_ids) &&
            m.criterion_ids.every((id) => criterionIds.has(id))
        )
        .map((m) => ({
          future_id: m.future_id,
          criterion_ids: m.criterion_ids,
          strength: m.strength === 'strong' ? 'strong' : 'some'
        }))
    : [];
  return {
    title,
    occurred_on:
      typeof raw.occurred_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.occurred_on)
        ? raw.occurred_on
        : new Date().toISOString().slice(0, 10),
    date_precision: ['day', 'month', 'year'].includes(raw.date_precision)
      ? raw.date_precision
      : 'day',
    star: {
      situation: raw.star?.situation ?? null,
      task: raw.star?.task ?? null,
      action: raw.star?.action ?? null,
      result: raw.star?.result ?? null
    },
    skills: Array.isArray(raw.skills)
      ? raw.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 12)
      : [],
    apst: sanitizeApstFocus(Array.isArray(raw.apst) ? raw.apst : []),
    source_refs,
    witness_refs,
    future_matches,
    why: typeof raw.why === 'string' ? raw.why.trim().slice(0, 300) : '',
    origin: raw.origin === 'you' ? 'you' : 'scan'
  };
}

async function persistProposal(store, proposal, nowIso) {
  const hash = sourceRefsHash(proposal.source_refs);
  const existingHash = await getJSON(store, careerScanProposalByHashKey(hash));
  if (existingHash?.status === 'binned' || existingHash?.status === 'kept') {
    return { skipped: true, reason: 'hash_closed', hash };
  }
  if (existingHash?.status === 'pending' && existingHash.id) {
    return { skipped: true, reason: 'already_pending', id: existingHash.id, hash };
  }
  const id = generateScanProposalId();
  const record = {
    id,
    equivalence_hash: hash,
    status: 'pending',
    created_at: nowIso,
    updated_at: nowIso,
    ...proposal
  };
  await setJSON(store, careerScanProposalKey(id), record);
  await setJSON(store, careerScanProposalByHashKey(hash), {
    id,
    status: 'pending',
    updated_at: nowIso
  });
  return { skipped: false, record };
}

export async function binScanProposal(store, id, nowIso = new Date().toISOString()) {
  if (!isValidScanProposalId(id)) {
    throw Object.assign(new Error('Invalid proposal id.'), { status: 400, code: 'invalid_id' });
  }
  const record = await getJSON(store, careerScanProposalKey(id));
  if (!record) {
    throw Object.assign(new Error('Proposal not found.'), { status: 404, code: 'not_found' });
  }
  const next = { ...record, status: 'binned', updated_at: nowIso };
  await setJSON(store, careerScanProposalKey(id), next);
  await setJSON(store, careerScanProposalByHashKey(record.equivalence_hash), {
    id,
    status: 'binned',
    updated_at: nowIso
  });
  return next;
}

export async function keepScanProposal(deps, id) {
  const store = deps.store;
  const nowIso = deps.nowIso ?? new Date().toISOString();
  if (!isValidScanProposalId(id)) {
    throw Object.assign(new Error('Invalid proposal id.'), { status: 400, code: 'invalid_id' });
  }
  const record = await getJSON(store, careerScanProposalKey(id));
  if (!record || record.status !== 'pending') {
    throw Object.assign(new Error('Proposal not pending.'), { status: 409, code: 'not_pending' });
  }

  const careerRepo =
    deps.careerRepo ?? createCareerRepository({ store, now: () => nowIso });
  const achievement = await careerRepo.createAchievement({
    title: record.title,
    occurred_on: record.occurred_on,
    date_precision: record.date_precision,
    star: record.star,
    skills: record.skills,
    apst: record.apst,
    origin: 'scan',
    lifecycle_status: 'active'
  });

  const universalStore =
    deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(deps.env));
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const linkRepo = createUniversalLinkRepository({
    store: universalStore,
    resolveEntity,
    now: () => nowIso
  });
  const accessContext = createAccessContext({ workflow: 'life' });
  const achievementRef = formatEntityRef({
    namespace: 'professional',
    kind: 'achievement',
    id: achievement.id
  });

  for (const ref of record.source_refs ?? []) {
    try {
      await linkRepo.createLink(
        {
          source_ref: achievementRef,
          target_ref: ref,
          relationship_type: 'evidenced_by'
        },
        accessContext
      );
    } catch {
      // Source may be unreachable; keep still succeeds for the card.
    }
  }
  for (const ref of record.witness_refs ?? []) {
    try {
      await linkRepo.createLink(
        {
          source_ref: achievementRef,
          target_ref: ref,
          relationship_type: 'witnessed_by'
        },
        accessContext
      );
    } catch {
      /* ignore */
    }
  }
  for (const match of record.future_matches ?? []) {
    try {
      await linkRepo.createLink(
        {
          source_ref: achievementRef,
          target_ref: formatEntityRef({
            namespace: 'professional',
            kind: 'future',
            id: match.future_id
          }),
          relationship_type: 'supports_future',
          metadata: {
            criterion_ids: match.criterion_ids,
            strength: match.strength
          }
        },
        accessContext
      );
    } catch {
      /* ignore */
    }
  }

  const next = {
    ...record,
    status: 'kept',
    achievement_id: achievement.id,
    updated_at: nowIso
  };
  await setJSON(store, careerScanProposalKey(id), next);
  await setJSON(store, careerScanProposalByHashKey(record.equivalence_hash), {
    id,
    status: 'kept',
    achievement_id: achievement.id,
    updated_at: nowIso
  });
  return { proposal: next, achievement };
}

/**
 * Collect a thin source window from Professional store only.
 * Tasks/Teaching/Knowledge/Life sources need those stores — empty when unbound.
 */
export async function collectScanSources(deps = {}) {
  const store = deps.professionalStore;
  const nowMs = Date.parse(deps.nowIso ?? new Date().toISOString());
  const sinceMs = deps.since
    ? Date.parse(deps.since)
    : nowMs - WINDOW_CAP_DAYS * 86400000;
  const sources = [];
  const witnesses = new Set();
  // Meetings / events with notes are the only Local Professional sources without extra stores.
  // Full multi-hub gather lands when Tasks/Teaching/Knowledge blobs are bound in this pass.
  if (deps.listMeetings) {
    for (const meeting of await deps.listMeetings()) {
      const at = meeting.occurred_on || meeting.starts_at || meeting.updated_at;
      const t = at ? Date.parse(at) : NaN;
      if (!Number.isFinite(t) || t < sinceMs) continue;
      if (!meeting.notes && !meeting.summary) continue;
      const ref = formatEntityRef({
        namespace: 'professional',
        kind: 'meeting',
        id: meeting.id
      });
      sources.push({
        ref,
        kind: 'meeting',
        title: meeting.title || 'Meeting',
        date: typeof at === 'string' ? at.slice(0, 10) : null
      });
    }
  }
  return { sources, witness_refs: [...witnesses] };
}

export async function runCareerScanPass(deps = {}) {
  const env = deps.env ?? process.env;
  const nowValue = deps.now ? deps.now() : new Date();
  const nowIso = nowValue instanceof Date ? nowValue.toISOString() : String(nowValue);
  const store =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));

  const state = (await getJSON(store, CAREER_SCAN_STATE_KEY)) ?? {};
  if (!deps.force && !deps.scheduled) {
    const last = state.last_run_at ? Date.parse(state.last_run_at) : 0;
    if (last && Date.parse(nowIso) - last < RATE_LIMIT_MS) {
      return {
        skipped: true,
        reason: 'rate_limited',
        retry_after_seconds: Math.ceil((RATE_LIMIT_MS - (Date.parse(nowIso) - last)) / 1000)
      };
    }
  }
  if (deps.scheduled) {
    const gate = shouldRunCareerScanNow(nowValue instanceof Date ? nowValue : new Date(nowIso), state);
    if (!gate.run && !deps.force) {
      return { skipped: true, reason: 'outside_sunday_slot_or_already_ran', ...gate };
    }
  }

  const careerRepo = createCareerRepository({ store, now: () => nowIso });
  const futures = await careerRepo.listFutures();
  const { sources, witness_refs } = await collectScanSources({
    ...deps,
    professionalStore: store,
    nowIso,
    since: state.last_success_at ?? null
  });

  const allowedRefs = new Set([
    ...sources.map((s) => s.ref),
    ...witness_refs
  ]);

  let drafted = [];
  const apiKey = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
  if (sources.length && apiKey && !deps.skipModel) {
    try {
      const body = {
        model: MODEL,
        max_tokens: 2500,
        messages: [
          {
            role: 'user',
            content: skillsScanPrompt({
              sources: sources.map((s) => ({ ...s, witness_candidates: witness_refs })),
              futures: futures.map((f) => ({
                id: f.id,
                title: f.title,
                criteria: f.criteria
              }))
            })
          }
        ]
      };
      const response = await (deps.fetchImpl ?? fetch)('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        const json = await response.json();
        const text = Array.isArray(json?.content)
          ? json.content.map((p) => p?.text ?? '').join('')
          : '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(text.slice(start, end + 1));
          drafted = Array.isArray(parsed.proposals) ? parsed.proposals : [];
        }
      }
    } catch {
      drafted = [];
    }
  } else if (sources.length && deps.heuristicProposals) {
    drafted = deps.heuristicProposals(sources, futures);
  }

  const saved = [];
  for (const raw of drafted) {
    const shaped = validateProposalShape(raw, allowedRefs, futures);
    if (!shaped) continue;
    const result = await persistProposal(store, shaped, nowIso);
    if (!result.skipped) saved.push(result.record);
  }

  const weekKey = isoWeekKey(nowValue instanceof Date ? nowValue : new Date(nowIso));
  const nextState = {
    ...state,
    last_run_at: nowIso,
    last_success_at: nowIso,
    last_success_week: deps.scheduled ? weekKey : state.last_success_week ?? null,
    last_source_count: sources.length,
    last_saved_count: saved.length
  };
  await setJSON(store, CAREER_SCAN_STATE_KEY, nextState);

  const pending = await listScanProposals(store, { status: 'pending' });
  return {
    skipped: false,
    sources: sources.length,
    saved: saved.length,
    pending_count: pending.length,
    scan_state: nextState,
    next_scan_label: nextSundayLabel(nowValue instanceof Date ? nowValue : new Date(nowIso))
  };
}

export async function getScanPanelPayload(store) {
  const state = (await getJSON(store, CAREER_SCAN_STATE_KEY)) ?? {
    last_run_at: null,
    last_success_week: null
  };
  const proposals = await listScanProposals(store, { status: 'pending' });
  return {
    proposals,
    scan_state: state,
    pending_count: proposals.length,
    next_scan_label: nextSundayLabel()
  };
}
