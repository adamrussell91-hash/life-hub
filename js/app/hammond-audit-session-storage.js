import { normalizeAuditSession } from './hammond-audit.js';

export const AUDIT_SESSION_KEY = 'life-hub:hammond-audit-session';

export function saveStoredAuditSession(storage, session) {
  if (!storage?.setItem) return;
  const normalized = normalizeAuditSession(session);
  if (!normalized) return;
  try {
    storage.setItem(AUDIT_SESSION_KEY, JSON.stringify(normalized));
  } catch {
    // Storage full / private mode — non-fatal.
  }
}

export function loadStoredAuditSession(storage) {
  if (!storage?.getItem) return null;
  try {
    const raw = storage.getItem(AUDIT_SESSION_KEY);
    if (!raw) return null;
    return normalizeAuditSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function removeStoredAuditSession(storage) {
  try {
    storage?.removeItem?.(AUDIT_SESSION_KEY);
  } catch {
    // ignore
  }
}
