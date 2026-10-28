// packages/question-book/answers.mjs
// One answer to one Question Book question: what a saved value looks like for each response
// type, how a submitted value is cleaned (or refused with a 400), whether it counts as answered,
// and how it reads as plain text for the optional Notice a pattern call. Shared by the server
// (netlify/functions/question-book.mjs) and the Tasks view, so both agree on the shapes.
//
// A question (from the private questions file) is { id, chapter, n, prompt, parts, response }.
// `parts` are the printed sub-prompts beside the main response: a `{ label }` part takes a line
// of text, an `{ options }` part takes one of its options.
//
// A value is null (no answer) or { main?, parts? }:
//   parts                  { [partIndex]: string }  label part → text; options part → one of its options
//   main, by response.type:
//   text                   string
//   choices_with_followups string (an optional note; the choices and "why" lines are parts)
//   drawing, body_markers, map_markers, relationship_map
//                          string (a plain text box for now; a drawn version may come later)
//   list                   string[count] (blank lines are '')
//   time                   'HH:MM', 24-hour
//   image_choice, choices  one of response.options
//   chart (quadrant)       { items: [{ label, cell }] }, cell one of the chart's cell ids, up to its max (16)
//   chart (plot)           { points: [{ label, x, y }] }, x and y whole numbers 1–10 or null (not placed yet), up to its max
//   continuum              numeric: a whole number min–max (0 is kept); otherwise a position 0–100 along the line
//   ranking                string[], items from response.items, each once, best first (a partial ranking is fine)
//   choice_table           (one of response.columns | null)[rows.length]
//   comparison             one of response.questionRefs (a question id)
//   paired_times           string[columns.length] (free short text, such as a year or an age)
//   three_circle_diagram   string[slots]
//   sibling_table          string[columns.length]
//   profile                (whole number min–max | null)[scales.length]
//   topic_fields           string[topics.length]
//   paired_choices         (pairs[i][0] | pairs[i][1] | null)[pairs.length]
//   scenario_fields        string[fields.length]
//   gauge                  a whole number min–max
//   shares                 (whole number 0–100 | null)[labels.length]; never over 100 in all, exactly 100 once every share is filled
//   ladder_markers         { [markerKey]: whole number min–max | null }, keys from response.markers
// Empty strings, nulls and empty lists are dropped, and a value with nothing left is null.

import { chart as catalogueChart } from './catalogue.mjs';

export const RESPONSE_TYPES = Object.freeze([
  'text', 'choices_with_followups', 'list', 'time', 'image_choice', 'chart', 'continuum', 'ranking',
  'body_markers', 'drawing', 'choice_table', 'comparison', 'relationship_map', 'paired_times',
  'map_markers', 'three_circle_diagram', 'sibling_table', 'profile', 'choices', 'topic_fields',
  'paired_choices', 'scenario_fields', 'gauge', 'shares', 'ladder_markers'
]);

/** Types answered in a plain text box for now (Adam's call): a drawn version may come later. */
export const TEXT_BOX_TYPES = Object.freeze(['drawing', 'body_markers', 'map_markers', 'relationship_map']);

export const LONG_TEXT = 6000;
export const SHORT_TEXT = 500;
export const SHARES_TOTAL = 100;

/** A refused answer: the server sends it as a 400 with this code and message. */
export class AnswerError extends Error {
  constructor(message, code = 'bad_answer') {
    super(message);
    this.name = 'AnswerError';
    this.status = 400;
    this.code = code;
  }
}

const refuse = (message, code) => {
  throw new AnswerError(message, code);
};

/** A question, or a bare response descriptor (then it has no parts). */
function asQuestion(arg) {
  if (arg && typeof arg === 'object' && arg.response && typeof arg.response === 'object') return { parts: [], ...arg };
  if (arg && typeof arg === 'object' && typeof arg.type === 'string') return { parts: [], response: arg };
  return refuse('That question can’t be answered.', 'bad_question');
}

function text(value, max, what = 'An answer') {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') refuse(`${what} must be text.`);
  const out = value.trim();
  if (out.length > max) refuse(`${what} is too long (${max} characters at most).`);
  return out || undefined;
}

function oneOf(value, options, what = 'That choice') {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !options.includes(value)) refuse(`${what} isn’t one of the options.`);
  return value;
}

function whole(value, min, max, what = 'A number') {
  if (value === null || value === undefined) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) refuse(`${what} must be a whole number from ${min} to ${max}.`);
  return value;
}

function arrayOf(value, length, what) {
  if (!Array.isArray(value)) refuse(`${what} must be a list.`);
  if (value.length > length) refuse(`${what} has room for ${length} at most.`);
  return Array.from({ length }, (_, i) => value[i]);
}

/** Fixed-length text fields: '' where blank, undefined when every one is blank. */
function fields(value, length, what) {
  if (value === null || value === undefined) return undefined;
  const out = arrayOf(value, length, what).map((v) => text(v, SHORT_TEXT, 'Each line') ?? '');
  return out.some(Boolean) ? out : undefined;
}

/** Fixed-length slots of choices or numbers: null where empty, undefined when all are empty. */
function slots(value, length, what, each) {
  if (value === null || value === undefined) return undefined;
  const out = arrayOf(value, length, what).map((v, i) => each(v, i) ?? null);
  return out.some((v) => v !== null) ? out : undefined;
}

function chartFor(response, chartDef) {
  const def = chartDef ?? catalogueChart(response.chart);
  if (!def) refuse('That chart isn’t in the book.', 'bad_question');
  return def;
}

function normalizeChart(response, main, chartDef) {
  if (main === null || main === undefined) return undefined;
  if (typeof main !== 'object' || Array.isArray(main)) refuse('A chart answer must be an object.');
  const def = chartFor(response, chartDef);
  const s = def.structure;
  if (def.family === 'quadrant') {
    const cells = s.cells.map((cell) => cell.id);
    const items = main.items ?? [];
    if (!Array.isArray(items)) refuse('Chart items must be a list.');
    if (items.length > (s.max ?? 16)) refuse(`This chart takes ${s.max ?? 16} items at most.`);
    const out = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') refuse('Each chart item needs a label and a cell.');
      const label = text(item.label, SHORT_TEXT, 'An item label');
      if (!label) continue;
      if (!cells.includes(item.cell)) refuse('Each chart item sits in one of the chart’s four cells.');
      out.push({ label, cell: item.cell });
    }
    return out.length ? { items: out } : undefined;
  }
  if (def.family === 'plot') {
    const points = main.points ?? [];
    if (!Array.isArray(points)) refuse('Chart points must be a list.');
    if (points.length > (s.max ?? 10)) refuse(`This chart takes ${s.max ?? 10} points at most.`);
    const out = [];
    for (const point of points) {
      if (!point || typeof point !== 'object') refuse('Each point needs a label.');
      const label = text(point.label, SHORT_TEXT, 'A point label');
      if (!label) continue;
      out.push({ label, x: whole(point.x, 1, 10, 'A position') ?? null, y: whole(point.y, 1, 10, 'A position') ?? null });
    }
    return out.length ? { points: out } : undefined;
  }
  return refuse('That chart can’t be answered here.', 'bad_question');
}

function normalizeShares(response, main) {
  const out = slots(main, response.labels.length, 'Shares', (v) => whole(v, 0, SHARES_TOTAL, 'Each share'));
  if (!out) return undefined;
  const sum = out.reduce((total, v) => total + (v ?? 0), 0);
  if (sum > SHARES_TOTAL) refuse(`The shares add up to ${sum}; they need to make ${SHARES_TOTAL}.`, 'shares_total');
  if (out.every((v) => v !== null) && sum !== SHARES_TOTAL) refuse(`The shares add up to ${sum}; they need to make ${SHARES_TOTAL}.`, 'shares_total');
  return out;
}

function normalizeMain(question, main, chartDef) {
  const r = question.response;
  switch (r.type) {
    case 'text':
    case 'choices_with_followups':
    case 'drawing':
    case 'body_markers':
    case 'map_markers':
    case 'relationship_map':
      return text(main, LONG_TEXT);
    case 'list':
      return fields(main, r.count, 'This list');
    case 'time': {
      if (main === null || main === undefined || main === '') return undefined;
      if (typeof main !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(main)) refuse('A time is HH:MM, from 00:00 to 23:59.');
      return main;
    }
    case 'image_choice':
    case 'choices':
      return oneOf(main, r.options);
    case 'chart':
      return normalizeChart(r, main, chartDef);
    case 'continuum':
      return r.numeric ? whole(main, r.min ?? 0, r.max ?? 10, 'A rating') : whole(main, 0, 100, 'A position on the line');
    case 'ranking': {
      if (main === null || main === undefined) return undefined;
      if (!Array.isArray(main)) refuse('A ranking must be a list.');
      if (main.some((item) => !r.items.includes(item))) refuse('A ranking only holds the listed items.');
      if (new Set(main).size !== main.length) refuse('Each item appears in the ranking once.');
      return main.length ? [...main] : undefined;
    }
    case 'choice_table':
      return slots(main, r.rows.length, 'This table', (v) => oneOf(v, r.columns));
    case 'comparison':
      return oneOf(main, r.questionRefs);
    case 'paired_times':
      return fields(main, r.columns.length, 'These times');
    case 'three_circle_diagram':
      return fields(main, r.slots, 'These circles');
    case 'sibling_table':
      return fields(main, r.columns.length, 'This row');
    case 'profile':
      return slots(main, r.scales.length, 'This profile', (v) => whole(v, r.min, r.max, 'Each rating'));
    case 'topic_fields':
      return fields(main, r.topics.length, 'These topics');
    case 'paired_choices':
      return slots(main, r.pairs.length, 'These pairs', (v, i) => oneOf(v, r.pairs[i]));
    case 'scenario_fields':
      return fields(main, r.fields.length, 'These scenarios');
    case 'gauge':
      return whole(main, r.min, r.max, 'A reading');
    case 'shares':
      return normalizeShares(r, main);
    case 'ladder_markers': {
      if (main === null || main === undefined) return undefined;
      if (typeof main !== 'object' || Array.isArray(main)) refuse('Ladder markers must be an object.');
      const keys = Object.keys(r.markers);
      const out = {};
      for (const [key, rung] of Object.entries(main)) {
        if (!keys.includes(key)) refuse('That marker isn’t on this ladder.');
        const v = whole(rung, r.min, r.max, 'A rung');
        if (v !== undefined) out[key] = v;
      }
      return Object.keys(out).length ? out : undefined;
    }
    default:
      return refuse('That question can’t be answered here.', 'bad_question');
  }
}

function normalizeParts(question, parts) {
  if (parts === null || parts === undefined) return undefined;
  const list = question.parts ?? [];
  const entries = Array.isArray(parts) ? parts.map((v, i) => [String(i), v]) : typeof parts === 'object' ? Object.entries(parts) : refuse('Parts must be an object.');
  const out = {};
  for (const [key, v] of entries) {
    if (!/^\d+$/.test(key) || Number(key) >= list.length) refuse('That part isn’t on this question.');
    const part = list[Number(key)];
    const clean = part.options ? oneOf(v, part.options) : text(v, LONG_TEXT);
    if (clean !== undefined) out[key] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A submitted value, cleaned: { main?, parts? }, or null when nothing is left. Throws an
 * AnswerError (status 400) when it doesn't fit the question. `question` may be a bare response
 * descriptor; `chartDef` overrides the catalogue chart for a `chart` response.
 */
export function normalizeAnswer(questionOrResponse, value, chartDef = null) {
  const question = asQuestion(questionOrResponse);
  if (!RESPONSE_TYPES.includes(question.response.type)) refuse('That question can’t be answered here.', 'bad_question');
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) refuse('An answer is an object with main and parts.');
  const extra = Object.keys(value).filter((key) => key !== 'main' && key !== 'parts');
  if (extra.length) refuse('An answer holds only main and parts.');
  const main = normalizeMain(question, value.main, chartDef);
  const parts = normalizeParts(question, value.parts);
  if (main === undefined && parts === undefined) return null;
  return { ...(main !== undefined ? { main } : {}), ...(parts !== undefined ? { parts } : {}) };
}

/** Whether a value says anything. Malformed values count as unanswered. */
export function isAnswered(questionOrResponse, value) {
  try {
    return normalizeAnswer(questionOrResponse, value) !== null;
  } catch {
    return false;
  }
}

const join = (values) => values.filter((v) => v !== null && v !== undefined && v !== '').join('; ');

function describeMain(question, main, chartDef) {
  const r = question.response;
  if (main === undefined || main === null) return '';
  switch (r.type) {
    case 'list':
    case 'three_circle_diagram':
    case 'ranking':
      return join(main.map((v, i) => (v ? `${i + 1}. ${v}` : '')));
    case 'continuum':
      return r.numeric ? `${main} on a scale from ${r.min ?? 0} (${r.low}) to ${r.max ?? 10} (${r.high})` : `${main}% of the way from “${r.low}” to “${r.high}”`;
    case 'chart': {
      const def = chartFor(r, chartDef);
      if (def.family === 'quadrant') {
        const cells = Object.fromEntries(def.structure.cells.map((cell) => [cell.id, cell.label]));
        return join(main.items.map((item) => `${item.label}: ${cells[item.cell]}`));
      }
      const { x, y } = def.structure.axes;
      return join(main.points.map((p) => (p.x === null || p.y === null ? `${p.label}: not placed` : `${p.label}: ${x.label} ${p.x}/10, ${y.label} ${p.y}/10`)));
    }
    case 'choice_table':
      return join(main.map((v, i) => (v ? `${r.rows[i]}: ${v}` : '')));
    case 'paired_times':
    case 'sibling_table':
      return join(main.map((v, i) => (v ? `${r.columns[i]}: ${v}` : '')));
    case 'topic_fields':
      return join(main.map((v, i) => (v ? `${r.topics[i]}: ${v}` : '')));
    case 'scenario_fields':
      return join(main.map((v, i) => (v ? `${r.fields[i]}: ${v}` : '')));
    case 'profile':
      return join(main.map((v, i) => (v === null ? '' : `${r.scales[i].low}–${r.scales[i].high}: ${v}`)));
    case 'paired_choices':
      return join(main.map((v) => v));
    case 'shares':
      return join(main.map((v, i) => (v === null ? '' : `${r.labels[i]} ${v}%`)));
    case 'gauge':
      return `${main} (from ${r.min} to ${r.max})`;
    case 'ladder_markers':
      return join(Object.entries(main).map(([key, rung]) => `${r.markers[key]}: rung ${rung}`));
    default:
      return String(main);
  }
}

/** A saved value as plain text, for the Notice a pattern call. '' when unanswered. */
export function describeAnswer(questionOrResponse, value, chartDef = null) {
  const question = asQuestion(questionOrResponse);
  if (!value) return '';
  const lines = [];
  const main = describeMain(question, value.main, chartDef);
  if (main) lines.push(main);
  for (const [key, v] of Object.entries(value.parts ?? {})) {
    const part = question.parts?.[Number(key)];
    lines.push(part?.label ? `${part.label} ${v}` : v);
  }
  return lines.join('\n');
}
