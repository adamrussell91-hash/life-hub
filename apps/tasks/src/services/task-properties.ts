import { DEFAULT_TASK_PROPERTY_CONFIG } from '@/domain/task-properties-defaults';
import type { TaskPropertyConfig } from '@/schemas/task-properties';
import { propertyIds, propertyLabel } from '@/schemas/task-properties';
import { tasksApi } from '@/services/client-api';

let cache: TaskPropertyConfig = DEFAULT_TASK_PROPERTY_CONFIG;
let loadPromise: Promise<TaskPropertyConfig> | null = null;

export const TASK_PROPERTIES_CHANGED = 'task-properties-changed';

export function getTaskPropertiesSync(): TaskPropertyConfig {
  return cache;
}

export async function loadTaskProperties(force = false): Promise<TaskPropertyConfig> {
  if (!force && loadPromise) return loadPromise;
  loadPromise = tasksApi
    .getTaskProperties()
    .then((config) => {
      cache = config;
      return config;
    })
    .catch(() => {
      cache = DEFAULT_TASK_PROPERTY_CONFIG;
      return cache;
    });
  return loadPromise;
}

export async function saveTaskProperties(config: TaskPropertyConfig): Promise<TaskPropertyConfig> {
  cache = await tasksApi.updateTaskProperties(config);
  loadPromise = Promise.resolve(cache);
  window.dispatchEvent(new CustomEvent(TASK_PROPERTIES_CHANGED));
  return cache;
}

export function taskPropertyIds(
  key: keyof Pick<
    TaskPropertyConfig,
    'domains' | 'priorities' | 'statuses' | 'kinds' | 'buckets' | 'sources' | 'tags'
  >,
  config: TaskPropertyConfig = cache
): string[] {
  return propertyIds(config, key);
}

export function taskPropertyLabel(
  key: keyof Pick<
    TaskPropertyConfig,
    'domains' | 'priorities' | 'statuses' | 'kinds' | 'buckets' | 'sources' | 'tags'
  >,
  id: string,
  config: TaskPropertyConfig = cache
): string {
  return propertyLabel(config, key, id);
}

export function priorityRank(priorityId: string, config: TaskPropertyConfig = cache): number {
  const index = config.priorities.findIndex((entry) => entry.id === priorityId);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function domainColor(domainId: string, config: TaskPropertyConfig = cache): string | undefined {
  return config.domains.find((entry) => entry.id === domainId)?.color;
}
