/**
 * Sunset time for a place and date, from the NOAA sunrise equation.
 * Good to a couple of minutes, which is all a day header needs.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RAD = Math.PI / 180;
/** Sun's centre 0.833° below the horizon: refraction plus the sun's radius. */
const ZENITH = 90.833;

function dayOfYear(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86_400_000);
}

/** Minutes after 00:00 UTC on the given date when the sun sets, or null in polar day or night. */
function sunsetUtcMinutes(lat: number, lon: number, year: number, month: number, day: number): number | null {
  const n = dayOfYear(year, month, day);
  // Fractional year, taken at the local evening.
  const gamma = ((2 * Math.PI) / 365) * (n - 1 + (18 - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const cosHour =
    Math.cos(ZENITH * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  if (cosHour < -1 || cosHour > 1) return null;
  const hourAngle = Math.acos(cosHour) / RAD;
  return 720 - 4 * (lon - hourAngle) - eqTime;
}

/** Local wall-clock sunset as "HH:mm" in the given IANA zone, or null. */
export function sunsetLocal(lat: number, lon: number, localDate: string, timeZone: string): string | null {
  const m = DATE_RE.exec(localDate);
  if (!m || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const minutes = sunsetUtcMinutes(lat, lon, year, month, day);
  if (minutes === null) return null;
  const instant = new Date(Date.UTC(year, month - 1, day) + Math.round(minutes) * 60_000);
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    return hour && minute ? `${hour}:${minute}` : null;
  } catch {
    return null;
  }
}
