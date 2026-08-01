import { daysBetween, isCalendarDate } from '../../../js/core/time.js';

const EXPIRING_DAYS = 14;

export function tokenExpiryState(expiry, today) {
  if (!isCalendarDate(expiry) || !isCalendarDate(today)) return 'unknown';
  if (expiry <= today) return 'expired';
  return daysBetween(today, expiry) <= EXPIRING_DAYS ? 'expiring' : 'healthy';
}
