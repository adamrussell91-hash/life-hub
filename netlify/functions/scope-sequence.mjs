import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { getJSON, readPublishedId, scopeSequenceKey, setJSON, unitKey } from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/scope-sequences/:id' };

function parseTimelineItems(items, weekCount) {
  if (!Array.isArray(items)) {
    return { error: 'timeline_items must be an array' };
  }
  const seen = new Set();
  const timeline_items = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') return { error: 'timeline_items contains an invalid item' };
    const start_week = raw.start_week;
    const end_week = raw.end_week;
    if (!Number.isInteger(start_week) || !Number.isInteger(end_week)) {
      return { error: 'timeline_items contains an invalid item' };
    }
    if (start_week < 1 || end_week > weekCount) {
      return { error: `timeline item weeks must be between 1 and ${weekCount}` };
    }
    if (raw.kind === 'unit') {
      if (typeof raw.unit_id !== 'string' || !raw.unit_id) {
        return { error: 'timeline_items contains an invalid item' };
      }
      if (seen.has(raw.unit_id)) return { error: 'unit_id must be unique among unit timeline items' };
      seen.add(raw.unit_id);
    }
    timeline_items.push(raw);
  }
  return { timeline_items };
}

export function createScopeSequenceHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Scope sequence not found', false), request, env);
    }
    const existing = await getJSON(store, scopeSequenceKey(id));
    if (!existing) {
      return withCors(errorResponse(404, 'not_found', 'Scope sequence not found', false), request, env);
    }
    if (request.method === 'GET') {
      return withCors(okResponse(200, existing), request, env);
    }
    if (request.method !== 'PATCH') {
      return withCors(methodNotAllowed('GET, PATCH, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const hasTimeline = parsed.value.timeline_items !== undefined;
    const hasOutcomes = parsed.value.outcome_ids !== undefined;
    if (!hasTimeline && !hasOutcomes) {
      return withCors(
        errorResponse(400, 'validation_error', 'Provide timeline_items and/or outcome_ids', false),
        request,
        env
      );
    }
    let timeline_items = existing.timeline_items;
    if (hasTimeline) {
      const parsedItems = parseTimelineItems(parsed.value.timeline_items, existing.week_count ?? 40);
      if (parsedItems.error) {
        return withCors(errorResponse(400, 'validation_error', parsedItems.error, false), request, env);
      }
      for (const item of parsedItems.timeline_items) {
        if (item.kind !== 'unit') continue;
        const unit = await getJSON(store, unitKey(item.unit_id));
        if (!unit) {
          return withCors(
            errorResponse(400, 'validation_error', `Unknown unit_id: ${item.unit_id}`, false),
            request,
            env
          );
        }
        if (unit.subject_id !== existing.subject_id) {
          return withCors(
            errorResponse(400, 'validation_error', 'unit_id must belong to the scope subject', false),
            request,
            env
          );
        }
      }
      timeline_items = parsedItems.timeline_items;
    }
    let outcome_ids = existing.outcome_ids;
    if (hasOutcomes) {
      if (!Array.isArray(parsed.value.outcome_ids) || parsed.value.outcome_ids.some(id => typeof id !== 'string')) {
        return withCors(errorResponse(400, 'validation_error', 'outcome_ids are invalid', false), request, env);
      }
      outcome_ids = parsed.value.outcome_ids;
    }
    const next = {
      ...existing,
      timeline_items,
      ...(outcome_ids !== undefined ? { outcome_ids } : {}),
      updated_at: new Date().toISOString()
    };
    await setJSON(store, scopeSequenceKey(id), next);
    return withCors(okResponse(200, next), request, env);
  }, deps);
}

export default createScopeSequenceHandler();
