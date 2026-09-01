import { randomBytes } from 'node:crypto';
import { isCalendarDate, addCalendarDays } from '../../../../js/core/time.js';

export const REMEMBER_DIR = 'data/remember';
export const CHALLENGES_DIR = 'data/challenges';
export const RESEARCH_DIR = 'data/research';
export const WIDGETS_DIR = 'data/widgets';
export const OS_DIR = 'data/os';

export const CN_LOANS_PATH = `${OS_DIR}/cn-loans.json`;
export const REMEMBER_WEEK_FLAGS_PATH = `${REMEMBER_DIR}/week-flags.json`;
export const REMEMBER_CONTEXT_NOTES_PATH = `${REMEMBER_DIR}/context-notes.json`;

export const RESEARCH_TTL_DAYS = Object.freeze({
  clinical: 90,
  nutrition: 45,
  fitness: 45,
  skincare: 60,
  mind: 60,
  general: 30,
  retail: 14
});

export function slugify(text) {
  return String(text || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item';
}

export function newId(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

export function challengePath(dateKey, title) {
  return `${CHALLENGES_DIR}/${dateKey}-${slugify(title)}.json`;
}

export function researchPath(dateKey, title) {
  return `${RESEARCH_DIR}/${dateKey}-${slugify(title)}.json`;
}

export function widgetPath(dateKey, title) {
  return `${WIDGETS_DIR}/${dateKey}-${slugify(title)}.json`;
}

export function resolveResearchTtl(domain, ttlDays) {
  if (Number.isFinite(ttlDays) && ttlDays > 0) return Math.min(Math.floor(ttlDays), 365);
  return RESEARCH_TTL_DAYS[domain] ?? RESEARCH_TTL_DAYS.general;
}

export function researchExpiresAt(domain, createdAtIso, ttlDays) {
  const ttl = resolveResearchTtl(domain, ttlDays);
  const createdMs = Date.parse(createdAtIso);
  if (!Number.isFinite(createdMs)) return null;
  return new Date(createdMs + ttl * 86400000).toISOString();
}

export function parseJsonBlob(text, fallback = null) {
  if (typeof text !== 'string' || text.trim() === '') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function findChallengePath(tree, challengeId) {
  if (!Array.isArray(tree) || typeof challengeId !== 'string' || !challengeId.trim()) return null;
  const id = challengeId.trim();
  const direct = `${CHALLENGES_DIR}/${id}.json`;
  if (tree.some(item => item.path === direct && item.type === 'blob')) return direct;
  const match = tree.find(item =>
    item.type === 'blob'
    && typeof item.path === 'string'
    && item.path.startsWith(`${CHALLENGES_DIR}/`)
    && item.path.endsWith('.json')
    && (item.path.includes(id) || item.path.endsWith(`/${id}.json`))
  );
  return match?.path ?? null;
}

export { isCalendarDate, addCalendarDays };
