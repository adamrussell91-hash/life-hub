export function taskKey(id: string): string {
  return `tasks/${id}`;
}

export function tasksIndexKey(): string {
  return 'tasks/_index';
}

export function projectKey(id: string): string {
  return `projects/${id}`;
}

export function projectsIndexKey(): string {
  return 'projects/_index';
}

export function frameworkKey(id: string): string {
  return `frameworks/${id}`;
}

export function frameworksIndexKey(): string {
  return 'frameworks/_index';
}

export function excursionTemplateKey(id: string): string {
  return `excursion_templates/${id}`;
}

export function excursionTemplatesIndexKey(): string {
  return 'excursion_templates/_index';
}

export function taskTemplateKey(id: string): string {
  return `task_templates/${id}`;
}

export function taskTemplatesIndexKey(): string {
  return 'task_templates/_index';
}

export function projectTemplateKey(id: string): string {
  return `project_templates/${id}`;
}

export function projectTemplatesIndexKey(): string {
  return 'project_templates/_index';
}

export function reviewLogKey(id: string): string {
  return `review_logs/${id}`;
}

export function reviewLogsIndexKey(): string {
  return 'review_logs/_index';
}

export function capacityShareKey(): string {
  return 'meta/capacity_share';
}

/** Last Clare judgment pass (flags only — not a task rewrite). */
export function intuitiveScanMetaKey(): string {
  return 'meta/intuitive_scan';
}

export function stressFlagKey(id: string): string {
  return `stress_flags/${id}`;
}

export function stressFlagsIndexKey(): string {
  return 'stress_flags/_index';
}

/** Per-agent inbox of StressFlag ids (write-on-create; consumers poll). */
export function agentInboxKey(agentSlug: string): string {
  return `agent_inbox/${agentSlug}`;
}

export function agentActionLogKey(id: string): string {
  return `agent_actions/${id}`;
}

export function clareCalibrationKey(domain: string): string {
  return `clare_calibration/${domain}`;
}

export function clareCalibrationsIndexKey(): string {
  return 'clare_calibration/_index';
}

export function clareNegotiationLogKey(id: string): string {
  return `clare_negotiations/${id}`;
}

export function metaSeededKey(): string {
  return 'meta/seeded';
}

export function taskPropertiesKey(): string {
  return 'meta/task_properties';
}

/** Hub-wide prefs Clare can update from chat (timezone, etc.). */
export function hubPrefsKey(): string {
  return 'meta/hub_prefs';
}

/** Per-agent operating manual — agents may rewrite from chat. */
export function agentProtocolKey(slug: string): string {
  return `agent_protocols/${slug}`;
}

export function mapKey(id: string): string {
  return `maps/${id}`;
}

export function mapsIndexKey(): string {
  return 'maps/_index';
}

export function programKey(id: string): string {
  return `programs/${id}`;
}

export function programsIndexKey(): string {
  return 'programs/_index';
}

export function areaKey(id: string): string {
  return `areas/${id}`;
}

export function areasIndexKey(): string {
  return 'areas/_index';
}

export function goalKey(id: string): string {
  return `goals/${id}`;
}

export function goalsIndexKey(): string {
  return 'goals/_index';
}
