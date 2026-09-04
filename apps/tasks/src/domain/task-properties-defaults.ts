import type { TaskPropertyConfig } from '@/schemas/task-properties';

/** Token hex from packages/design-kit/tokens.css — universe canvas needs resolved colours. */
export const DEFAULT_DOMAIN_COLORS: Record<string, { fill: string; ink: string }> = {
  teaching: { fill: '#376fb7', ink: '#17375e' },
  life: { fill: '#2f7a4f', ink: '#3c5949' },
  wedding: { fill: '#a85a0c', ink: '#7a5038' },
  health: { fill: '#f68620', ink: '#6c581f' },
  other: { fill: '#244f7c', ink: '#13233a' }
};

export const DEFAULT_TASK_PROPERTY_CONFIG: TaskPropertyConfig = {
  schema_version: 1,
  domains: [
    { id: 'teaching', label: 'teaching', color: DEFAULT_DOMAIN_COLORS.teaching!.fill },
    { id: 'life', label: 'life', color: DEFAULT_DOMAIN_COLORS.life!.fill },
    { id: 'wedding', label: 'wedding', color: DEFAULT_DOMAIN_COLORS.wedding!.fill },
    { id: 'health', label: 'health', color: DEFAULT_DOMAIN_COLORS.health!.fill },
    { id: 'other', label: 'other', color: DEFAULT_DOMAIN_COLORS.other!.fill }
  ],
  priorities: [
    { id: 'urgent', label: 'urgent' },
    { id: 'high', label: 'high' },
    { id: 'medium', label: 'medium' },
    { id: 'low', label: 'low' }
  ],
  statuses: [
    { id: 'open', label: 'open' },
    { id: 'in_progress', label: 'in progress' },
    { id: 'done', label: 'done' },
    { id: 'deferred', label: 'deferred' },
    { id: 'dead', label: 'dead' }
  ],
  kinds: [
    { id: 'task', label: 'task' },
    { id: 'step', label: 'step' }
  ],
  buckets: [
    { id: 'active', label: 'active' },
    { id: 'someday', label: 'someday' }
  ],
  sources: [
    { id: 'manual', label: 'manual' },
    { id: 'auto_generated_from_excursion', label: 'auto generated from excursion' },
    { id: 'suggested_by_agent', label: 'suggested by agent' }
  ],
  tags: []
};
