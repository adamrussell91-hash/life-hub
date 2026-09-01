const PROMOTED_PREFIX = 'data/os/promoted-shortcuts/';

export function promotedShortcutPathsFromTree(tree) {
  return (Array.isArray(tree) ? tree : [])
    .filter(
      entry =>
        entry?.type === 'blob'
        && typeof entry.path === 'string'
        && entry.path.startsWith(PROMOTED_PREFIX)
        && entry.path.endsWith('.json')
    )
    .map(entry => ({ path: entry.path, sha: entry.sha }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function loadPromotedShortcutDrafts(tree, readBlob, { limit = 12 } = {}) {
  if (typeof readBlob !== 'function') return [];
  const entries = promotedShortcutPathsFromTree(tree).slice(0, limit);
  const drafts = [];
  const seenTools = new Set();

  for (const entry of entries) {
    let parsed;
    try {
      const text = await readBlob(entry.sha);
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || parsed.status === 'retired') continue;
    const proposedId = typeof parsed.proposed_id === 'string' ? parsed.proposed_id.trim() : '';
    if (!proposedId) continue;
    const toolName = String(
      parsed.tool_name || proposedId.replace(/\./g, '_').replace(/-/g, '_')
    ).trim();
    if (!toolName || seenTools.has(toolName)) continue;
    seenTools.add(toolName);
    drafts.push({
      path: entry.path,
      proposed_id: proposedId,
      tool_name: toolName,
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : (typeof parsed.example_intent === 'string' ? parsed.example_intent.trim() : proposedId),
      risk: parsed.risk === 'auto' ? 'auto' : 'confirm'
    });
  }

  return drafts;
}

export function buildPromotedShortcutToolSchemas(drafts) {
  return (Array.isArray(drafts) ? drafts : []).map(draft => ({
    name: draft.tool_name,
    description:
      `Promoted shortcut (${draft.proposed_id}): ${draft.summary}. Replays catalogued example_writes via Confirm — does not mutate capabilities/registry.`,
    input_schema: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'Optional intent override' },
        writes: {
          type: 'array',
          items: { type: 'object' },
          description: 'Optional write override; defaults to the draft example_writes'
        }
      },
      additionalProperties: false
    }
  }));
}

export function findPromotedDraftByToolName(name, drafts) {
  if (typeof name !== 'string' || !name) return null;
  return (Array.isArray(drafts) ? drafts : []).find(draft => draft.tool_name === name) ?? null;
}

export function isPromotedShortcutToolName(name, drafts) {
  return Boolean(findPromotedDraftByToolName(name, drafts));
}
