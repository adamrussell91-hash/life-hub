/**
 * Map Clare / Hammond productivity tool results → structured productivity_card SSE events.
 * Card type strings match packages/design-kit/js/agent-productivity-cards.js.
 */

const TOOL_CARD_TYPES = {
  clarify_dump: 'clarify-stack',
  weekly_review: 'review-progress',
  compose_schedule: 'schedule-diff',
  deadline_runway: 'runway',
  waiting_review: 'waiting',
  context_match: 'good-fits',
  focus_block: 'focus-block',
  shutdown_day: 'shutdown',
  project_plan: 'planning-stack',
  project_health: 'hierarchy-trace',
  portfolio_meter: 'active-projects-meter',
  horizons_chain: 'hierarchy-trace',
  capacity_day: 'metric-audit',
  threefold_audit: 'metric-audit',
  depth_budget: 'depth-budget',
  strategic_review: 'strategic-review',
  attention_audit: 'attention-audit',
  pace_audit: 'metric-audit',
  multiscale_plan: 'planning-stack'
};

export function cardTypeForProductivityTool(name) {
  return TOOL_CARD_TYPES[name] ?? null;
}

function shapePayload(toolName, cardType, result, pendingId) {
  const base = result && typeof result === 'object' ? { ...result } : { result };
  if (pendingId) base.pendingId = pendingId;

  if (toolName === 'weekly_review' && result?.state) {
    const pending = Array.isArray(result.state.pending_changes) ? result.state.pending_changes : [];
    return {
      ...base,
      stages: result.stages,
      completed: result.state.completed ?? [],
      current: result.state.current_stage,
      pendingChanges: pending.map((change) => ({
        id: change.id,
        kind: change.kind,
        summary: change.summary,
        confirmable: change.confirmable === true,
        selected: change.selected !== false && change.confirmable === true,
        project_id: change.project_id ?? null,
        task_id: change.task_id ?? null,
        title: change.title ?? null
      })),
      reviewId: result.workflow_id || result.state.id || null
    };
  }
  if (toolName === 'compose_schedule' || (toolName === 'plan_work' && result?.proposed)) {
    return {
      ...base,
      blocks: result.proposed ?? result.blocks ?? []
    };
  }
  if (toolName === 'focus_block' && result?.state) {
    return {
      ...base,
      status: result.state.status || 'ready',
      spec: result.state
    };
  }
  if (toolName === 'project_plan' && result?.state) {
    return {
      ...base,
      stages: result.state.stages,
      completed: result.state.completed ?? [],
      current: result.state.current_stage,
      project_title: result.state.project_title
    };
  }
  if (toolName === 'portfolio_meter' && result?.funnel) {
    return { ...base, funnel: result.funnel, meter: result.meter };
  }
  if (toolName === 'depth_budget') {
    return { ...base, budget: result.budget ?? result };
  }
  if (cardType === 'strategic-review') {
    return { ...base, review: result.review ?? result };
  }
  if (cardType === 'attention-audit') {
    return { ...base, patterns: result.patterns ?? result.audit?.patterns ?? [] };
  }
  if (cardType === 'hierarchy-trace' && result?.chain) {
    return { ...base, chain: result.chain };
  }
  if (cardType === 'active-projects-meter' && result?.meter) {
    return { ...base, meter: result.meter, projects: result.active_projects };
  }
  return base;
}

/**
 * @returns {{ type: 'productivity_card', card_type: string, payload: object } | null}
 */
export function buildProductivityCardEvent(toolName, result, { pendingId } = {}) {
  if (!result || typeof result !== 'object') return null;
  if (result.ok === false) return null;

  let cardType = cardTypeForProductivityTool(toolName);
  if (toolName === 'portfolio_meter' && result.funnel) {
    cardType = 'productivity-funnel';
  }
  if (!cardType) return null;

  if (result.kind === 'propose') {
    const surfaces = result.proposal?.surfaces;
    if (!Array.isArray(surfaces) || surfaces.length === 0) return null;
  }

  return {
    type: 'productivity_card',
    card_type: cardType,
    payload: shapePayload(toolName, cardType, result, pendingId)
  };
}
