/**
 * Published personal lines: snapshots of a student's line saved from Tasks and served on a public
 * MindWorks link. Only public catalogue fields survive `sanitizeLineSnapshot`, so whatever a client
 * sends, the public page can only ever show catalogue text, a first name, a year level and subjects.
 */
import { randomBytes } from 'node:crypto';

export const LINE_PREFIX = 'personal_lines/';
export const LINE_INDEX_KEY = `${LINE_PREFIX}_index`;

const LINES = new Set(['J', 'I', 'E', 'R']);
const PRECISIONS = new Set(['day', 'part', 'month']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]{8,24}$/;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function lineKey(slug) {
  return `${LINE_PREFIX}${slug}`;
}

export function isLineSlug(value) {
  return typeof value === 'string' && SLUG.test(value);
}

/** Twelve characters a person can't guess. */
export function newLineSlug(bytes = randomBytes(12)) {
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const nullableStr = (value, max) => str(value, max) || null;
const date = value => (typeof value === 'string' && ISO.test(value) ? value : null);
const precision = value => (typeof value === 'string' && PRECISIONS.has(value) ? value : null);
const lines = value => (Array.isArray(value) ? ['J', 'I', 'E', 'R'].filter(line => value.includes(line)) : []);
const strings = (value, maxItems, maxLength) =>
  Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, maxItems).map(item => item.trim().slice(0, maxLength)).filter(Boolean) : [];

function mark(value) {
  if (!value || typeof value !== 'object') return null;
  const on = date(value.on);
  const p = precision(value.precision);
  return on && p ? { on, precision: p } : null;
}

function run(value) {
  if (!value || typeof value !== 'object') return null;
  const start = date(value.start);
  const end = date(value.end);
  const p = precision(value.precision);
  return start && end && p && end >= start ? { start, end, precision: p } : null;
}

function link(value) {
  const text = str(value, 500);
  return /^https?:\/\//i.test(text) ? text : null;
}

function item(value) {
  if (!value || typeof value !== 'object') return null;
  const name = str(value.name, 200);
  const on = lines(value.on);
  if (!name || !on.length) return null;
  return {
    id: str(value.id, 160),
    name,
    type: str(value.type, 40) || 'Competition',
    on,
    matched: strings(value.matched, 12, 40),
    years: Array.isArray(value.years) ? value.years.filter(y => Number.isInteger(y) && y >= 1 && y <= 12) : [],
    run: run(value.run),
    due: mark(value.due),
    close: mark(value.close),
    length: nullableStr(value.length, 40),
    level: nullableStr(value.level, 40),
    cost: str(value.cost, 200),
    basis: nullableStr(value.basis, 40),
    window: str(value.window, 300),
    organiser: str(value.organiser, 200),
    location: str(value.location, 200),
    description: str(value.description, 2000),
    link: link(value.link),
    format: nullableStr(value.format, 40),
    subjects: strings(value.subjects, 12, 40),
    provider: nullableStr(value.provider, 40),
    settings: strings(value.settings, 3, 20),
    entry: nullableStr(value.entry, 40),
    entry_route: nullableStr(value.entry_route, 40)
  };
}

/** A clean snapshot, or `{ error }` when there's nothing publishable. */
export function sanitizeLineSnapshot(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send the line as a JSON object.' };
  const year = Number(body.year);
  const studentYear = Number(body.student_year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: 'The line needs a calendar year.' };
  if (!Number.isInteger(studentYear) || studentYear < 1 || studentYear > 12) return { error: 'The line needs a year level.' };
  const items = Array.isArray(body.items) ? body.items.slice(0, 400).map(item).filter(Boolean) : [];
  const undated = Array.isArray(body.undated) ? body.undated.slice(0, 400).map(item).filter(Boolean) : [];
  if (!items.length && !undated.length) return { error: 'Nothing on this line to publish yet.' };
  const firstName = str(body.student_name, 60).split(/\s+/)[0] ?? '';
  return {
    snapshot: {
      version: 1,
      year,
      student_year: studentYear,
      student_name: firstName ? firstName.slice(0, 24) : null,
      subjects: strings(body.subjects, 40, 40),
      lines: lines(body.lines),
      items: items.filter(entry => entry.run || entry.due),
      branches: body.branches !== false,
      undated,
      terms: Array.isArray(body.terms)
        ? body.terms
            .slice(0, 8)
            .map(term => ({ id: str(term?.id, 4), start: date(term?.start), end: date(term?.end) }))
            .filter(term => term.id && term.start && term.end && term.end >= term.start)
        : [],
      created_at: new Date().toISOString()
    }
  };
}

export function lineSummary(record) {
  return {
    slug: record.slug,
    student_name: record.student_name ?? null,
    student_year: record.student_year,
    subjects: record.subjects ?? [],
    year: record.year,
    created_at: record.created_at
  };
}
