const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a life_wall payload. Absent values are left for the caller. */
export function readLifeWall(value) {
  if (value == null) return { value: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'life_wall must be an object or null' };
  }
  const starts_on = value.starts_on;
  const ends_on = value.ends_on;
  if (typeof starts_on !== 'string' || !DATE_KEY.test(starts_on) || typeof ends_on !== 'string' || !DATE_KEY.test(ends_on)) {
    return { error: 'life_wall needs starts_on and ends_on as YYYY-MM-DD' };
  }
  if (ends_on < starts_on) return { error: 'ends_on must be on or after starts_on' };
  if (value.label != null && typeof value.label !== 'string') {
    return { error: 'life_wall label must be a string or null' };
  }
  return { value: { starts_on, ends_on, label: value.label ?? null } };
}

export function applyLifeWall(body) {
  if (!body || typeof body !== 'object' || !Object.prototype.hasOwnProperty.call(body, 'life_wall')) {
    return { ok: true };
  }
  const wall = readLifeWall(body.life_wall);
  if (wall.error) return { ok: false, error: wall.error };
  body.life_wall = wall.value;
  return { ok: true };
}
