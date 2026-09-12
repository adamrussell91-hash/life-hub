/**
 * Adapter-facing helpers for Knowledge connected / related_to display.
 * Prefer dual-read relationship rows when the server supplied an array
 * (including empty after cutover). Fall back to legacy connected only when
 * relationships were not loaded (null/undefined).
 */

export function connectedDisplayRefs({
  legacyConnected = [],
  relationships = null
}: {
  legacyConnected?: string[];
  relationships?: Array<{ legacy_hub_ref?: string | null; target_ref?: string }> | null;
}): string[] {
  if (Array.isArray(relationships)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const row of relationships) {
      const ref = row.legacy_hub_ref;
      if (typeof ref !== 'string' || !ref || seen.has(ref)) continue;
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
