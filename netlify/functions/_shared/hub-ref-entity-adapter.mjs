/**
 * Legacy HubRef → canonical EntityRef adapter.
 * HubRef remains the Knowledge `connected` format until migration retires it.
 * Do not expand HubRef into the EntityRef registry.
 */
import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';
import { formatHubRef, parseHubRef } from './hub-ref.mjs';

const HUB_TO_NAMESPACE = Object.freeze({
  knowledge: 'knowledge',
  teaching: 'teaching',
  tasks: 'tasks',
  life: 'life'
});

/**
 * @param {string | { hub: string, kind: string, id: string } | null | undefined} hubRefInput
 * @returns {{ namespace: string, kind: string, id: string } | null}
 */
export function entityRefFromHubRef(hubRefInput) {
  const hubRef = typeof hubRefInput === 'string' ? parseHubRef(hubRefInput) : hubRefInput;
  if (!hubRef?.hub || !hubRef.kind || !hubRef.id) return null;
  const namespace = HUB_TO_NAMESPACE[hubRef.hub];
  if (!namespace) return null;
  const formatted = formatEntityRef({ namespace, kind: hubRef.kind, id: hubRef.id });
  return formatted ? parseEntityRef(formatted) : null;
}

/**
 * @param {string | { namespace: string, kind: string, id: string } | null | undefined} entityRefInput
 * @returns {{ hub: string, kind: string, id: string } | null}
 */
export function hubRefFromEntityRef(entityRefInput) {
  const entityRef = typeof entityRefInput === 'string' ? parseEntityRef(entityRefInput) : entityRefInput;
  if (!entityRef?.namespace || !entityRef.kind || !entityRef.id) return null;
  const hub = entityRef.namespace;
  if (!HUB_TO_NAMESPACE[hub]) return null;
  const hubRef = { hub, kind: entityRef.kind, id: entityRef.id };
  return parseHubRef(formatHubRef(hubRef)) ? hubRef : null;
}

/**
 * @param {string | { hub: string, kind: string, id: string }} hubRefInput
 * @returns {string | null} canonical EntityRef string
 */
export function formatEntityRefFromHubRef(hubRefInput) {
  const ref = entityRefFromHubRef(hubRefInput);
  return ref ? formatEntityRef(ref) : null;
}

/**
 * @param {string | { namespace: string, kind: string, id: string }} entityRefInput
 * @returns {string | null} legacy HubRef storage string
 */
export function formatHubRefFromEntityRef(entityRefInput) {
  const hubRef = hubRefFromEntityRef(entityRefInput);
  return hubRef ? formatHubRef(hubRef) : null;
}
