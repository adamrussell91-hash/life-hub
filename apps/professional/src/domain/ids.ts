/**
 * Identifier shapes mirrored from the server contract
 * (`netlify/functions/_shared/identity-schema.mjs`). A route identifier is
 * validated against these *before* it is used to build a request URL or a
 * canonical ref — an unsafe or malformed path segment must never reach
 * `fetch`, and a decoded path separator or `..` segment must never survive
 * to look like a valid id.
 */

const PERSON_ID_PATTERN = /^person_[0-9a-f-]{36}$/;
const ORGANISATION_ID_PATTERN = /^organisation_[0-9a-f-]{36}$/;
const COMMUNICATION_ID_PATTERN = /^communication_[0-9a-f-]{36}$/;

export function isValidPersonId(id: string): boolean {
  return PERSON_ID_PATTERN.test(id);
}

export function isValidOrganisationId(id: string): boolean {
  return ORGANISATION_ID_PATTERN.test(id);
}

export function isValidCommunicationId(id: string): boolean {
  return COMMUNICATION_ID_PATTERN.test(id);
}

export function personRef(id: string): string {
  return `shared:person:${id}`;
}

export function organisationRef(id: string): string {
  return `shared:organisation:${id}`;
}

export function communicationRef(id: string): string {
  return `professional:communication:${id}`;
}

export function parseSharedRef(ref: string): { kind: 'person' | 'organisation'; id: string } | null {
  const parts = ref.split(':');
  if (parts.length !== 3 || parts[0] !== 'shared') return null;
  const [, kind, id] = parts;
  if (kind === 'person' && isValidPersonId(id ?? '')) return { kind: 'person', id: id! };
  if (kind === 'organisation' && isValidOrganisationId(id ?? '')) return { kind: 'organisation', id: id! };
  return null;
}
