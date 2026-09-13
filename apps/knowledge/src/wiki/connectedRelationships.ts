/**
 * Adapter-facing helpers for Knowledge connected / related_to display.
 * Prefer dual-read relationship rows when the server supplied an array
 * (including empty after cutover). Fall back to legacy connected only when
 * relationships were not loaded (null/undefined).
 *
 * Display refs always identify the *other* endpoint — never rewrite
 * incoming links as if the viewing page owned them.
 */

export type DualReadRelationshipRow = {
  source_ref?: string;
  target_ref?: string;
  other_ref?: string | null;
  legacy_hub_ref?: string | null;
  direction?: 'outgoing' | 'incoming';
  ownership?: 'outgoing_owned' | 'incoming_readonly' | 'legacy_pending';
  link_id?: string | null;
  sources?: string[];
};

function hubRefFromEntityRef(entityRef: string | null | undefined): string | null {
  if (typeof entityRef !== 'string' || !entityRef) return null;
  const parts = entityRef.split(':');
  if (parts.length !== 3) return null;
  const [namespace, kind, id] = parts;
  if (!namespace || !kind || !id) return null;
  if (namespace === 'knowledge' && kind === 'page') return id;
  return `${namespace}:${kind}:${id}`;
}

/** HubRef for the peer page shown on this page's relationship list. */
export function peerHubRefForRelationship(
  row: DualReadRelationshipRow,
  viewingPageId: string
): string | null {
  if (typeof row.legacy_hub_ref === 'string' && row.legacy_hub_ref) {
    return row.legacy_hub_ref;
  }
  if (typeof row.other_ref === 'string' && row.other_ref) {
    return hubRefFromEntityRef(row.other_ref);
  }
  const viewingRef = `knowledge:page:${viewingPageId}`;
  if (row.direction === 'incoming' || row.source_ref !== viewingRef) {
    return hubRefFromEntityRef(row.source_ref ?? null);
  }
  return hubRefFromEntityRef(row.target_ref ?? null);
}

export function connectedDisplayRefs({
  pageId,
  legacyConnected = [],
  relationships = null
}: {
  pageId?: string;
  legacyConnected?: string[];
  relationships?: DualReadRelationshipRow[] | null;
}): string[] {
  if (Array.isArray(relationships)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const row of relationships) {
      const ref = peerHubRefForRelationship(row, pageId ?? '');
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      out.push(ref);
    }
    return out;
  }
  const legacy = Array.isArray(legacyConnected) ? legacyConnected : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of legacy) {
    if (typeof value !== 'string' || !value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
