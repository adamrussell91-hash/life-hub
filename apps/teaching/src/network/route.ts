/* ── Octilinear connection ─────────────────────────────────────────── */

/** A waypoint in along/across space. `near` points want the 45° bend next to them. */
export type Way = { a: number; c: number; near?: boolean };

/**
 * Joins two waypoints with straight runs and one 45° diagonal. The diagonal
 * sits next to a `near` point (a station edge or a detour), otherwise in the
 * middle of the run. Returns the points after `p`, ending with `q`.
 */
export function connect(p: Way, q: Way): Way[] {
  const da = q.a - p.a;
  const dc = q.c - p.c;
  if (dc === 0 || da <= 0) return [q];
  const d = Math.abs(dc);
  const sign = Math.sign(dc);
  if (da >= d) {
    if (q.near && !p.near) return [{ a: q.a - d, c: p.c }, q];
    if (p.near && !q.near) return [{ a: p.a + d, c: q.c }, q];
    const m = (da - d) / 2;
    return m > 0 ? [{ a: p.a + m, c: p.c }, { a: p.a + m + d, c: q.c }, q] : [q];
  }
  // Not enough room along: the diagonal takes what there is, the rest runs across.
  if (q.near) return [{ a: p.a, c: q.c - sign * da }, q];
  return [{ a: q.a, c: p.c + sign * da }, q];
}

export function route(ways: Way[]): Way[] {
  if (!ways.length) return [];
  const out: Way[] = [ways[0]!];
  for (let i = 1; i < ways.length; i++) out.push(...connect(out[out.length - 1]!, ways[i]!));
  return out;
}
