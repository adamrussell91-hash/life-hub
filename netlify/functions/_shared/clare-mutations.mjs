const MAX_MUTATIONS = 12;
const TASK_ALLOW = new Set([
  'title', 'description', 'status', 'priority', 'domain', 'due_date', 'due_time',
  'estimated_duration', 'parent_project_id', 'tags', 'page_blocks', 'bucket', 'kind'
]);
const PROJECT_ALLOW = new Set([
  'title', 'description', 'status', 'type', 'current_end_date', 'page_blocks', 'tags', 'arc_summary'
]);
const MAP_ALLOW = new Set(['title', 'status', 'nodes', 'edges', 'notes']);

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanSummary(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (text || 'Apply change').slice(0, 200);
}

function pickAllowed(patch, allow) {
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (allow.has(key)) out[key] = value;
  }
  return out;
}

export function parseAgentMutations(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (out.length >= MAX_MUTATIONS) break;
    const body = asRecord(row);
    if (!body) continue;
    const kind = String(body.kind ?? '').trim();
    const summary = cleanSummary(body.summary);
    if (kind === 'task_update') {
      const task_id = String(body.task_id ?? '').trim();
      const patch = asRecord(body.patch);
      if (task_id && patch) out.push({ kind, summary, task_id, patch: pickAllowed(patch, TASK_ALLOW) });
      continue;
    }
    if (kind === 'project_update') {
      const project_id = String(body.project_id ?? '').trim();
      const patch = asRecord(body.patch);
      if (project_id && patch) out.push({ kind, summary, project_id, patch: pickAllowed(patch, PROJECT_ALLOW) });
      continue;
    }
    if (kind === 'page_blocks') {
      const entity_type = String(body.entity_type ?? '').trim();
      const entity_id = String(body.entity_id ?? '').trim();
      if ((entity_type !== 'task' && entity_type !== 'project') || !entity_id) continue;
      if (!Array.isArray(body.page_blocks)) continue;
      out.push({
        kind,
        summary,
        entity_type,
        entity_id,
        page_blocks: body.page_blocks.slice(0, 80)
      });
      continue;
    }
    if (kind === 'map_update') {
      const map_id = String(body.map_id ?? '').trim();
      const patch = asRecord(body.patch);
      if (map_id && patch) out.push({ kind, summary, map_id, patch: pickAllowed(patch, MAP_ALLOW) });
    }
  }
  return out;
}

export function mutationLabel(mutation) {
  switch (mutation.kind) {
    case 'task_update':
      return `Update task ${mutation.task_id}`;
    case 'project_update':
      return `Update project ${mutation.project_id}`;
    case 'page_blocks':
      return `Edit ${mutation.entity_type} page ${mutation.entity_id}`;
    case 'map_update':
      return `Update map ${mutation.map_id}`;
    default:
      return mutation.summary;
  }
}

export function applyRecordPatch(existing, patch, nowIso) {
  const next = { ...existing, ...patch, updated_at: nowIso };
  next.id = existing.id;
  next.schema_version = existing.schema_version ?? 1;
  next.created_at = existing.created_at;
  return next;
}
