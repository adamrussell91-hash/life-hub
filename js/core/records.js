import { isCalendarDate } from './time.js';
import { validateRecord } from './validate.js';

const PATH = /^data\/(nutrition|fitness|mind|sleep|heart|skincare|fragrance|body)\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;

export const TYPE_DOMAINS = {
  meal: 'nutrition',
  workout: 'fitness',
  diary: 'mind',
  weight: 'body',
  composition: 'body',
  measurements: 'body',
  sleep: 'sleep',
  heart: 'heart',
  skincare: 'skincare',
  fragrance: 'fragrance'
};

function rawScalar(yaml, key) {
  const match = new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, 'm').exec(yaml);
  if (!match) return undefined;
  const value = match[1].replace(/[ \t]+#.*$/, '').trim();
  if ((value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function preserveTemporalScalars(record, yaml) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return record;
  const preserved = { ...record };
  for (const key of ['date', 'created_at', 'updated_at']) {
    if (record[key] instanceof Date) preserved[key] = rawScalar(yaml, key);
  }
  return preserved;
}

export function parseCanonicalPath(path) {
  const match = PATH.exec(path);
  if (!match) throw new TypeError(`Non-canonical event path: ${path}`);
  const [, domain, year, month, date] = match;
  if (!isCalendarDate(date)) throw new TypeError(`Invalid calendar date in event path: ${path}`);
  if (!date.startsWith(`${year}-${month}-`)) {
    throw new TypeError(`Event path date does not match year/month directories: ${path}`);
  }
  return { domain, year, month, date };
}

export function parseEventDocument(text, path, loadYaml) {
  if (typeof text !== 'string') throw new TypeError(`Event document must be text: ${path}`);
  if (typeof loadYaml !== 'function') throw new TypeError('loadYaml must be a function');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/.exec(text.trim());
  if (!match) throw new TypeError(`Missing YAML frontmatter: ${path}`);

  const record = preserveTemporalScalars(loadYaml(match[1]), match[1]);
  const location = parseCanonicalPath(path);
  const legacy = record !== null && typeof record === 'object' && !Array.isArray(record)
    && !Object.hasOwn(record, 'schema_version');
  const errors = validateRecord(record, { allowLegacy: legacy });

  if (record !== null && typeof record === 'object' && !Array.isArray(record)) {
    if (record.date !== location.date) errors.push('record date does not match path date');
    const expectedDomain = TYPE_DOMAINS[record.type];
    if (expectedDomain && expectedDomain !== location.domain) {
      errors.push(`record type ${record.type} does not match path domain ${location.domain}`);
    }
  }
  if (errors.length) throw new TypeError(`${path}: ${errors.join('; ')}`);
  return { record, body: match[2].trim(), path, legacy };
}
