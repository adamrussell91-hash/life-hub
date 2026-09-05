/** Task property vocabulary stored at meta/task_properties on the Tasks Blobs store. */

export const TASK_PROPERTIES_KEY = 'meta/task_properties';

export const TASK_PROPERTY_LIST_KEYS = [
  'domains',
  'priorities',
  'statuses',
  'kinds',
  'buckets',
  'sources',
  'tags'
];

const ID_RE = /^[a-z][a-z0-9_]*$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_TASK_PROPERTY_CONFIG = {
  schema_version: 1,
  domains: [
    { id: 'teaching', label: 'teaching', color: '#376fb7' },
    { id: 'life', label: 'life', color: '#2f7a4f' },
    { id: 'wedding', label: 'wedding', color: '#a85a0c' },
    { id: 'health', label: 'health', color: '#f68620' },
    { id: 'other', label: 'other', color: '#244f7c' }
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

function validateOption(entry, listName, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${listName}[${index}] must be an object`);
  }
  if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) {
    throw new Error(`${listName}[${index}].id must be a lowercase id`);
  }
  if (typeof entry.label !== 'string' || !entry.label.trim()) {
    throw new Error(`${listName}[${index}].label is required`);
  }
  if (entry.color != null && (typeof entry.color !== 'string' || !COLOR_RE.test(entry.color))) {
    throw new Error(`${listName}[${index}].color must be #RRGGBB`);
  }
  return {
    id: entry.id,
    label: entry.label.trim(),
    ...(entry.color != null ? { color: entry.color } : {})
  };
}

function validateList(list, listName, { min = 1 } = {}) {
  if (!Array.isArray(list)) {
    throw new Error(`${listName} must be an array`);
  }
  if (list.length < min) {
    throw new Error(`${listName} needs at least ${min} entr${min === 1 ? 'y' : 'ies'}`);
  }
  const seen = new Set();
  const next = list.map((entry, index) => {
    const option = validateOption(entry, listName, index);
    if (seen.has(option.id)) {
      throw new Error(`Duplicate ${listName} id: ${option.id}`);
    }
    seen.add(option.id);
    return option;
  });
  return next;
}

export function validateTaskPropertyConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Task property config must be an object');
  }
  if (raw.schema_version !== 1) {
    throw new Error('schema_version must be 1');
  }
  return {
    schema_version: 1,
    domains: validateList(raw.domains, 'domains'),
    priorities: validateList(raw.priorities, 'priorities'),
    statuses: validateList(raw.statuses, 'statuses'),
    kinds: validateList(raw.kinds, 'kinds'),
    buckets: validateList(raw.buckets, 'buckets'),
    sources: validateList(raw.sources, 'sources'),
    tags: validateList(raw.tags, 'tags', { min: 0 })
  };
}

export async function readTaskProperties(store, { getJSON, setJSON }) {
  const raw = await getJSON(store, TASK_PROPERTIES_KEY);
  if (raw) return validateTaskPropertyConfig(raw);
  const defaults = structuredClone(DEFAULT_TASK_PROPERTY_CONFIG);
  await setJSON(store, TASK_PROPERTIES_KEY, defaults);
  return defaults;
}
