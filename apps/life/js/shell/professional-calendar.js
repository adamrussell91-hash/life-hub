/**
 * Map Professional schedule projections into Life calendar event rows.
 * Source of truth remains Professional Meeting/Event records.
 */
export function professionalEventsFromProjections(projections) {
  const out = [];
  const seen = new Set();
  for (const projection of projections ?? []) {
    if (!projection?.projection_id || seen.has(projection.projection_id)) continue;
    seen.add(projection.projection_id);
    const event = lifeEventFromProjection(projection);
    if (event) out.push(event);
  }
  return out;
}

function lifeEventFromProjection(projection) {
  if (!projection?.start) return null;
  const type = projection.kind === 'meeting' ? 'professional_meeting' : 'professional_event';
  const start = new Date(projection.start);
  if (Number.isNaN(start.getTime())) return null;
  const tz = projection.time_zone || 'Australia/Sydney';
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(start);
  const get = (typeName) => dateParts.find((p) => p.type === typeName)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  let time;
  if (!projection.all_day) {
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(start);
    const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
    time = `${hour}:${minute}`;
  }
  const endMs = Date.parse(projection.end);
  const duration_min =
    Number.isFinite(endMs) && endMs > start.getTime()
      ? Math.max(1, Math.round((endMs - start.getTime()) / 60_000))
      : 60;
  return {
    path: `professional:${projection.projection_id}`,
    record: {
      type,
      id: projection.projection_id,
      date,
      ...(time ? { time } : {}),
      duration_min,
      title: projection.title,
      status: projection.status,
      source_ref: projection.source_ref,
      href: projection.href ?? null,
      all_day: Boolean(projection.all_day)
    },
    body: ''
  };
}
