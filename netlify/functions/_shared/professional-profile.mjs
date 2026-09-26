// Imported Professional People profiles deliberately sit beside the shared
// identity schema. They are source material from the private data repository,
// not editable identity fields, so this parser makes their response shape
// explicit before a profile can reach an authenticated client.

export const PROFESSIONAL_PROFILE_SCHEMA_VERSION = 1;

const MAX_PROFILE_BODY_CHARS = 1_000_000;
const MAX_PROPERTY_VALUE_CHARS = 100_000;
const MAX_REFERENCE_COUNT = 2_000;

function boundedString(value, maxLength = MAX_PROPERTY_VALUE_CHARS) {
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function safeHttpsUrl(value) {
  const text = boundedString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function safeHubHref(value) {
  const text = boundedString(value);
  if (!text) return null;
  return text.startsWith('#/') || /^\/(?!\/)/.test(text) ? text : null;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => boundedString(item))
    .filter((item) => item !== null);
}

function sourceProperties(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const properties = {};
  for (const [key, item] of Object.entries(value)) {
    const name = boundedString(key);
    const content = boundedString(item);
    if (!name || content === null) return null;
    properties[name] = content;
  }
  return properties;
}

function references(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = {};
  for (const [kind, rawEntries] of Object.entries(value)) {
    if (!Array.isArray(rawEntries) || rawEntries.length > MAX_REFERENCE_COUNT) return null;
    const entries = [];
    for (const raw of rawEntries) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const label = boundedString(raw.label);
      if (!label) return null;
      entries.push({
        label,
        source_url: safeHttpsUrl(raw.source_url),
        hub_href: safeHubHref(raw.hub_href)
      });
    }
    result[kind] = entries;
  }
  return result;
}

/**
 * Parses the versioned extension written by the Professional People importer.
 * An invalid extension is isolated to that profile: callers can still return
 * its stable shared Person identity rather than blanking the directory.
 */
export function parseProfessionalProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== PROFESSIONAL_PROFILE_SCHEMA_VERSION) return null;
  if (!raw.source || typeof raw.source !== 'object' || Array.isArray(raw.source)) return null;
  if (raw.source.system !== 'notion') return null;

  const properties = sourceProperties(raw.source.properties);
  const summary = raw.summary === null || raw.summary === undefined ? null : boundedString(raw.summary);
  const lastContacted = raw.last_contacted === null || raw.last_contacted === undefined
    ? null
    : boundedString(raw.last_contacted);
  const body = raw.body_markdown === null || raw.body_markdown === undefined
    ? null
    : boundedString(raw.body_markdown, MAX_PROFILE_BODY_CHARS);
  if (!properties || summary === null && raw.summary != null || lastContacted === null && raw.last_contacted != null || body === null && raw.body_markdown != null) {
    return null;
  }

  const contactInput = raw.contact;
  if (!contactInput || typeof contactInput !== 'object' || Array.isArray(contactInput)) return null;
  const email = contactInput.email === null || contactInput.email === undefined ? null : boundedString(contactInput.email);
  const phone = contactInput.phone === null || contactInput.phone === undefined ? null : boundedString(contactInput.phone);
  if (email === null && contactInput.email != null || phone === null && contactInput.phone != null) return null;

  const parsedReferences = references(raw.references);
  if (!parsedReferences) return null;

  return {
    schema_version: PROFESSIONAL_PROFILE_SCHEMA_VERSION,
    source: {
      system: 'notion',
      page_url: safeHttpsUrl(raw.source.page_url),
      properties
    },
    summary,
    contact: {
      email,
      phone,
      linkedin_url: safeHttpsUrl(contactInput.linkedin_url)
    },
    last_contacted: lastContacted,
    current_workplace: stringArray(raw.current_workplace),
    references: parsedReferences,
    body_markdown: body
  };
}
