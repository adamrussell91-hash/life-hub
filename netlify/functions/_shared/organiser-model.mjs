/**
 * Knowledge organiser, pure code: the teacher's changes to a unit's sheet, the released view a
 * class gets, the practice cards and the Leitner boxes. No storage and no clock in here; the
 * caller passes `today` (a Sydney day, YYYY-MM-DD) and the release map.
 *
 *   organiser   { v: 2, sections: [{ id, name, kind, role?, concept_key?, sentence?, dot_points?, off?, columns?,
 *                 lines: [{ id, cells, lesson_id?, also_lesson_ids?, piece_id?, tier?, open? }] }], week?, updated_at }
 *
 * The sheet is written on the unit page before teaching. Lessons tick lines: lesson_id is the first lesson
 * that ticked a line, also_lesson_ids the others. An unticked line waits. `open` marks a line from before lessons ticked (v1, no lesson): students already have it.
 *   boxes       { [line_id]: { box: 1..5, due: day, last: day, h: [{ d: day, ok }] } }
 */
import { randomBytes } from 'node:crypto';

export const ORGANISER_LIMITS = { sections: 24, lines: 200, cell: 400, reason: 80, columns: 4, name: 60 };
export const KINDS = ['table', 'list', 'sequence'];
export const ROLES = ['concept', 'ideas', 'facts', 'vocab', 'key_lines', 'story'];
const CONCEPT_KEY = /^[A-Z]{2,5}$/;
const IDEA_COLUMNS = [['Prompt', false], ['What to know', true], ['Example', false]];
const ROLE_COLUMNS = {
  concept: IDEA_COLUMNS,
  ideas: IDEA_COLUMNS,
  facts: [['Label', false], ['Detail', true]],
  vocab: [['Word', false], ['Meaning', true], ['In a sentence', false]],
  key_lines: [['Line', false], ['Who', true], ['Why it matters', false]]
};
const ROLE_OF_NAME = { 'key ideas': 'ideas', vocabulary: 'vocab', 'key lines': 'key_lines', 'story order': 'story', 'facts and topics': 'facts' };
/** Days a card waits in box 1 to 5. */
export const GAPS = [1, 3, 7, 14, 28];
/** Most cards a student answers in a day, across every sitting. */
export const DAILY_CARDS = 15;
export const REVIEW_LIMIT = 40;
const FRESH_DAYS = 7;
const HISTORY_KEPT = 30;
const HISTORY_SHOWN = 10;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[A-Za-z0-9_-]{1,120}$/;
const PREFIX = { section: 'os_', column: 'oc_', line: 'ol_' };

export class OrganiserError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const reject = (status, code, message) => {
  throw new OrganiserError(status, code, message);
};

const newId = (kind) => `${PREFIX[kind]}${randomBytes(5).toString('hex')}`;

const sydneyParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });
/** The Sydney calendar day of a moment, as YYYY-MM-DD. */
export function sydneyDay(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return sydneyParts.format(d);
}

export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const gapOf = (box) => GAPS[Math.min(Math.max(box, 1), GAPS.length) - 1];

// ---- Teacher changes -------------------------------------------------------------------------

const clone = (value) => structuredClone(value);

/**
 * The v2 shape of a stored sheet: sections with a usual name get their role, and a line with no
 * lesson stays with students (`open`). Saved on the next change; safe to run on any sheet.
 */
export function upgradeOrganiser(organiser) {
  if (organiser?.v === 2) return organiser;
  const next = clone(organiser ?? { sections: [] });
  next.v = 2;
  next.sections = Array.isArray(next.sections) ? next.sections : [];
  for (const section of next.sections) {
    const role = ROLE_OF_NAME[String(section.name ?? '').trim().toLowerCase()];
    if (role && (role === 'story' ? section.kind !== 'table' : section.kind === 'table')) section.role = role;
    for (const line of section.lines ?? []) if (!line.lesson_id) line.open = true;
  }
  return next;
}
const text = (value) => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '');

function cleanName(value, what = 'section') {
  const name = text(value).replace(/\s+/g, ' ');
  if (!name) reject(400, 'missing_name', `Give the ${what} a name.`);
  if (name.length > ORGANISER_LIMITS.name) reject(400, 'too_long', `A ${what} name can be up to ${ORGANISER_LIMITS.name} characters.`);
  return name;
}

const defaultColumns = () => [
  { id: newId('column'), label: 'Prompt', hide: false },
  { id: newId('column'), label: 'Answer', hide: true }
];

/** Columns from a request: ones carrying a known id keep it (and their cells); the rest are new. */
function cleanColumns(raw, known = []) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > ORGANISER_LIMITS.columns) {
    reject(400, 'bad_columns', `A table has 2 to ${ORGANISER_LIMITS.columns} columns.`);
  }
  const used = new Set();
  return raw.map((c) => {
    const keep = typeof c?.id === 'string' && known.includes(c.id) && !used.has(c.id);
    const id = keep ? c.id : newId('column');
    used.add(id);
    return { id, label: cleanName(c?.label, 'column'), hide: c?.hide === true };
  });
}

function cleanCell(value) {
  const cell = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
  if (cell.length > ORGANISER_LIMITS.cell) reject(400, 'too_long', `A cell can be up to ${ORGANISER_LIMITS.cell} characters.`);
  return cell;
}

/** Cells in the shape a section holds: one per column for a table, one otherwise. */
function cellsFor(section, raw) {
  const want = section.kind === 'table' ? section.columns.length : 1;
  if (!Array.isArray(raw) || raw.length > want) reject(400, 'bad_cells', want === 1 ? 'A line here has one cell.' : `A line here has ${want} cells.`);
  const cells = raw.map(cleanCell);
  while (cells.length < want) cells.push('');
  return cells;
}

const joined = (cells) => cells.filter((c) => c).join(' - ');

/** Cells carried to another section: positions for tables, joined text for a one-cell section. */
function recast(cells, section) {
  if (section.kind !== 'table') return [joined(cells)];
  const out = cells.slice(0, section.columns.length);
  while (out.length < section.columns.length) out.push('');
  return out;
}

function findSection(organiser, id) {
  const section = organiser.sections.find((s) => s.id === id);
  if (!section) reject(404, 'not_found', 'That section has gone.');
  return section;
}
function findLine(organiser, id) {
  for (const section of organiser.sections) {
    const index = section.lines.findIndex((l) => l.id === id);
    if (index !== -1) return { section, index, line: section.lines[index] };
  }
  return reject(404, 'not_found', 'That line has gone.');
}
const lineCount = (organiser) => organiser.sections.reduce((n, s) => n + s.lines.length, 0);
const ref = (value, what) => {
  if (typeof value !== 'string' || !REF.test(value)) reject(400, 'bad_request', `That ${what} isn’t valid.`);
  return value;
};
const slot = (value, length) => {
  if (!Number.isInteger(value)) reject(400, 'bad_request', 'Say where it goes.');
  return Math.min(Math.max(value, 0), length);
};

function updateSection(organiser, change) {
  const section = findSection(organiser, change.section_id);
  if (change.name !== undefined) section.name = cleanName(change.name);
  if (change.sentence !== undefined) section.sentence = cleanSentence(change.sentence);
  if (change.dot_points !== undefined) section.dot_points = cleanDotPoints(change.dot_points);
  if (change.off !== undefined) {
    if (change.off === true) section.off = true;
    else delete section.off;
  }
  const kind = change.kind === undefined ? section.kind : change.kind;
  if (!KINDS.includes(kind)) reject(400, 'bad_kind', 'A section is a table, a list or a sequence.');

  if (kind === 'table') {
    const wasTable = section.kind === 'table';
    if (!wasTable && change.columns === undefined) {
      section.columns = defaultColumns();
      for (const line of section.lines) line.cells = [line.cells[0] ?? '', ''];
    } else if (change.columns !== undefined) {
      const before = wasTable ? section.columns : [];
      const next = cleanColumns(change.columns, before.map((c) => c.id));
      for (const line of section.lines) {
        const old = wasTable ? line.cells : [line.cells[0] ?? ''];
        line.cells = next.map((c, i) => {
          const was = before.findIndex((b) => b.id === c.id);
          return was !== -1 ? old[was] ?? '' : !wasTable && i === 0 ? old[0] ?? '' : '';
        });
      }
      section.columns = next;
    }
  } else if (section.kind === 'table') {
    for (const line of section.lines) line.cells = [joined(line.cells)];
    delete section.columns;
  }
  section.kind = kind;
}

const tierOf = (value) => {
  if (![1, 2, 3].includes(value)) reject(400, 'bad_request', 'A word is Tier 1, 2 or 3.');
  return value;
};

function cleanSentence(value) {
  const sentence = text(value).replace(/\s+/g, ' ');
  if (sentence.length > ORGANISER_LIMITS.cell) reject(400, 'too_long', `A sentence can be up to ${ORGANISER_LIMITS.cell} characters.`);
  return sentence;
}

function cleanDotPoints(value) {
  if (!Array.isArray(value) || value.length > 40 || value.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) reject(400, 'bad_request', 'Those dot points aren’t valid.');
  return [...new Set(value)];
}

function roleColumns(role) {
  return ROLE_COLUMNS[role].map(([label, hide]) => ({ id: newId('column'), label, hide }));
}

function newLine(section, raw) {
  const line = { id: newId('line'), cells: cellsFor(section, raw?.cells) };
  if (raw?.tier !== undefined) line.tier = tierOf(raw.tier);
  if (raw?.lesson_id) line.lesson_id = ref(raw.lesson_id, 'lesson');
  if (raw?.piece_id) line.piece_id = ref(raw.piece_id, 'piece');
  return line;
}

/**
 * One teacher change, applied to a copy of the organiser. Throws OrganiserError for anything
 * the sheet can't hold. Line, section and column ids are made here and never change after.
 */
/** Every lesson that has ticked a line, the first one first. */
export const lessonsOfLine = (line) => [...(line.lesson_id ? [line.lesson_id] : []), ...(line.also_lesson_ids ?? [])];

function addLesson(line, id) {
  if (lessonsOfLine(line).includes(id)) return;
  if (!line.lesson_id) line.lesson_id = id;
  else line.also_lesson_ids = [...(line.also_lesson_ids ?? []), id];
}

function removeLesson(line, id) {
  const rest = lessonsOfLine(line).filter((x) => x !== id);
  delete line.lesson_id;
  delete line.also_lesson_ids;
  if (rest[0]) line.lesson_id = rest[0];
  if (rest.length > 1) line.also_lesson_ids = rest.slice(1);
}

export function applyChange(organiser, change) {
  const next = clone(upgradeOrganiser(organiser));
  if (!change || typeof change !== 'object' || Array.isArray(change)) reject(400, 'bad_request', 'Invalid request.');
  switch (change.op) {
    case 'add_section': {
      if (next.sections.length >= ORGANISER_LIMITS.sections) reject(400, 'too_many_sections', `A unit can have ${ORGANISER_LIMITS.sections} sections.`);
      if (change.role !== undefined && !ROLES.includes(change.role)) reject(400, 'bad_request', 'Unknown section.');
      const kind = change.kind === undefined ? (change.role === 'story' ? 'sequence' : 'table') : change.kind;
      if (!KINDS.includes(kind)) reject(400, 'bad_kind', 'A section is a table, a list or a sequence.');
      const section = { id: newId('section'), name: cleanName(change.name), kind, lines: [] };
      if (change.role) section.role = change.role;
      if (change.concept_key !== undefined) {
        if (typeof change.concept_key !== 'string' || !CONCEPT_KEY.test(change.concept_key)) reject(400, 'bad_request', 'Unknown concept.');
        if (next.sections.some((s) => s.concept_key === change.concept_key)) reject(409, 'exists', 'That concept is already on the sheet.');
        section.concept_key = change.concept_key;
      }
      if (change.sentence !== undefined) section.sentence = cleanSentence(change.sentence);
      if (kind === 'table') section.columns = change.columns !== undefined ? cleanColumns(change.columns) : ROLE_COLUMNS[change.role] ? roleColumns(change.role) : defaultColumns();
      next.sections.push(section);
      break;
    }
    case 'update_section':
      updateSection(next, change);
      break;
    case 'delete_section': {
      const section = findSection(next, change.section_id);
      next.sections = next.sections.filter((s) => s !== section);
      if (next.week?.section_id === section.id) delete next.week;
      break;
    }
    case 'move_section': {
      const section = findSection(next, change.section_id);
      const to = slot(change.to, next.sections.length - 1);
      next.sections = next.sections.filter((s) => s !== section);
      next.sections.splice(to, 0, section);
      break;
    }
    case 'add_lines': {
      const section = findSection(next, change.section_id);
      if (!Array.isArray(change.lines)) reject(400, 'bad_request', 'Add at least one line.');
      const added = change.lines.map((raw) => newLine(section, raw)).filter((l) => l.cells.some((c) => c));
      if (!added.length) reject(400, 'empty_line', 'Type something in the line.');
      if (lineCount(next) + added.length > ORGANISER_LIMITS.lines) reject(400, 'too_many_lines', `A unit can have ${ORGANISER_LIMITS.lines} lines.`);
      section.lines.push(...added);
      break;
    }
    case 'update_line': {
      const { section, line } = findLine(next, change.line_id);
      if (change.cells !== undefined) line.cells = cellsFor(section, change.cells);
      if (change.tier !== undefined) {
        if (change.tier === null) delete line.tier;
        else line.tier = tierOf(change.tier);
      }
      // Ticking or unticking in a lesson decides this line from now on.
      if (change.lesson_id !== undefined || change.add_lesson_id !== undefined || change.remove_lesson_id !== undefined) delete line.open;
      if (change.lesson_id === null || change.lesson_id === '') delete line.also_lesson_ids;
      if (change.add_lesson_id !== undefined) addLesson(line, ref(change.add_lesson_id, 'lesson'));
      if (change.remove_lesson_id !== undefined) removeLesson(line, ref(change.remove_lesson_id, 'lesson'));
      for (const [field, what] of [['lesson_id', 'lesson'], ['piece_id', 'piece']]) {
        if (change[field] === undefined) continue;
        if (change[field] === null || change[field] === '') delete line[field];
        else line[field] = ref(change[field], what);
      }
      break;
    }
    case 'delete_line': {
      const { section, index } = findLine(next, change.line_id);
      section.lines.splice(index, 1);
      break;
    }
    case 'move_line': {
      const { section, index, line } = findLine(next, change.line_id);
      const target = change.section_id === undefined ? section : findSection(next, change.section_id);
      section.lines.splice(index, 1);
      if (target !== section) line.cells = recast(line.cells, target);
      target.lines.splice(slot(change.to, target.lines.length), 0, line);
      break;
    }
    case 'set_week': {
      if (change.week === null) {
        delete next.week;
        break;
      }
      const week = change.week;
      const section = findSection(next, week?.section_id);
      if (typeof week.due !== 'string' || !DAY.test(week.due) || Number.isNaN(Date.parse(week.due))) reject(400, 'bad_date', 'Pick the day it is due.');
      const reason = text(week.reason).replace(/\s+/g, ' ');
      if (reason.length > ORGANISER_LIMITS.reason) reject(400, 'too_long', `A reason can be up to ${ORGANISER_LIMITS.reason} characters.`);
      next.week = { section_id: section.id, due: week.due, reason };
      break;
    }
    default:
      reject(400, 'bad_action', 'Unknown change.');
  }
  return next;
}

// ---- Release ---------------------------------------------------------------------------------

/** What a line says, in one string: for the end-of-lesson card and the lesson picker's wording. */
export function lineText(section, line) {
  const cells = line.cells ?? [];
  if (section.kind !== 'table') return cells[0]?.trim() ?? '';
  const columns = section.columns ?? [];
  const cue = cells[columns.findIndex((c) => !c.hide)]?.trim() ?? '';
  const answer = cells[columns.findIndex((c) => c.hide)]?.trim() ?? '';
  if (section.role === 'concept' || section.role === 'ideas') return answer || cue;
  return cue && answer ? `${cue}: ${answer}` : cue || answer || cells.find((c) => c?.trim())?.trim() || '';
}

/**
 * What a class may see. `releases` maps lesson id to { state: 'released', day } | { state: 'waiting' }
 * | { state: 'gone' } (see lessonReleases). A line goes out on the first day a lesson that ticked it
 * is released, or when it is `open`. Sections with no released line are left out, so waiting text and its section
 * names never leave the server. A section the teacher ticked off stays home too.
 * Lines carry lesson_id, lesson_ids (those released), piece_id and released_on for the server's own use: studentSheet strips them.
 */
export function releasedSheet(organiser, releases, today) {
  const sections = [];
  for (const section of upgradeOrganiser(organiser).sections) {
    if (section.off) continue;
    const lines = [];
    for (const line of section.lines ?? []) {
      const ticked = lessonsOfLine(line);
      const out = ticked.filter((id) => releases?.[id]?.state === 'released');
      if (ticked.length ? !out.length : !line.open) continue;
      const days = out.map((id) => releases[id].day).filter(Boolean).sort();
      const day = days[0] ?? null;
      lines.push({
        id: line.id,
        cells: line.cells,
        fresh: day !== null && addDays(day, FRESH_DAYS) > today,
        ...(line.lesson_id ? { lesson_id: line.lesson_id } : {}),
        ...(out.length ? { lesson_ids: out } : {}),
        ...(line.piece_id ? { piece_id: line.piece_id } : {}),
        ...(line.tier ? { tier: line.tier } : {}),
        ...(day ? { released_on: day } : {})
      });
    }
    if (!lines.length) continue;
    sections.push({
      id: section.id,
      name: section.name,
      kind: section.kind,
      ...(section.role ? { role: section.role } : {}),
      ...(section.sentence ? { sentence: section.sentence } : {}),
      ...(section.kind === 'table' ? { columns: section.columns } : {}),
      lines
    });
  }
  const w = organiser?.week;
  const target = w && sections.find((s) => s.id === w.section_id);
  const week = target && today <= w.due ? { section_id: target.id, section_name: target.name, due: w.due, reason: w.reason ?? '' } : undefined;
  return { sections, ...(week ? { week } : {}) };
}

/** The sheet as a student receives it: no lesson or piece ids, no release days. */
export function studentSheet(sheet) {
  return {
    sections: sheet.sections.map((s) => ({
      ...s,
      lines: s.lines.map(({ id, cells, fresh, tier }) => ({ id, cells, fresh, ...(tier ? { tier } : {}) }))
    })),
    ...(sheet.week ? { week: sheet.week } : {})
  };
}

// ---- Practice --------------------------------------------------------------------------------

/**
 * One card per released line of a table with a hidden and a shown column. `builds` maps a piece id
 * to the claim it builds.
 */
export function buildCards(sections, builds = new Map()) {
  const cards = [];
  for (const section of sections ?? []) {
    if (section.kind !== 'table') continue;
    const columns = section.columns ?? [];
    const cueAt = columns.findIndex((c) => !c.hide);
    const answerAt = columns.findIndex((c) => c.hide);
    if (cueAt === -1 || answerAt === -1) continue;
    for (const line of section.lines) {
      const cue = line.cells[cueAt]?.trim();
      const answer = line.cells[answerAt]?.trim();
      if (!cue || !answer) continue;
      const more = columns
        .map((c, i) => ({ label: c.label, text: line.cells[i]?.trim() ?? '', i }))
        .filter((m) => m.i !== cueAt && m.i !== answerAt && m.text)
        .map(({ label, text: t }) => ({ label, text: t }));
      const claim = line.piece_id ? builds.get(line.piece_id) : undefined;
      cards.push({
        line_id: line.id,
        section: section.name,
        cue_label: columns[cueAt].label,
        cue,
        answer_label: columns[answerAt].label,
        answer,
        more,
        ...(claim ? { builds: claim } : {})
      });
    }
  }
  return cards;
}

/**
 * The Leitner box after an answer, and the card's history (one result a day, newest last). Not yet goes
 * back to box 1 and comes back tomorrow, never the same day. Got it moves up one box, at most once a
 * day: a resend keeps its box.
 */
export function applyResult(entry, result, today) {
  const h = [...(entry?.h ?? []).filter((x) => x.d !== today), { d: today, ok: result === 'got' }].slice(-HISTORY_KEPT);
  if (result === 'again') return { box: 1, due: addDays(today, 1), last: today, h };
  if (entry && entry.last === today) return { box: entry.box, due: addDays(today, gapOf(entry.box)), last: today, h };
  const box = Math.min(GAPS.length, (entry?.box ?? 1) + 1);
  return { box, due: addDays(today, gapOf(box)), last: today, h };
}

/** Only the lines of lessons this student has ticked off (and lines no lesson holds) make cards. */
export function joinedSections(sections, done) {
  return (sections ?? []).map((section) => ({
    ...section,
    lines: (section.lines ?? []).filter((line) => !line.lesson_ids?.length || line.lesson_ids.some((id) => done.has(id)))
  }));
}

/**
 * Today's set, how many cards sit in each box, and when the next ones come. Due cards come oldest first,
 * then new cards in sheet order, up to DAILY_CARDS a day counting what was already answered today. A card
 * answered today is never served again today. Late cards just wait: nothing moves down. A new card
 * counts in box 1.
 */
export function todaysCards(cards, boxes, today) {
  const entry = (c) => boxes?.[c.line_id];
  const room = Math.max(0, DAILY_CARDS - cards.filter((c) => entry(c)?.last === today).length);
  const due = cards
    .map((c, order) => ({ c, order, e: entry(c) }))
    .filter((x) => x.e && x.e.due <= today && x.e.last !== today)
    .sort((a, b) => a.e.due.localeCompare(b.e.due) || a.order - b.order)
    .map((x) => x.c);
  const chosen = [...due, ...cards.filter((c) => !entry(c))].slice(0, room);
  const taken = new Set(chosen);

  const counts = GAPS.map(() => 0);
  for (const c of cards) counts[Math.min(Math.max(entry(c)?.box ?? 1, 1), GAPS.length) - 1] += 1;

  const tomorrow = addDays(today, 1);
  const upcoming = new Map();
  for (const c of cards) {
    if (taken.has(c)) continue;
    const e = entry(c);
    const day = !e || e.due <= tomorrow ? tomorrow : e.due;
    upcoming.set(day, (upcoming.get(day) ?? 0) + 1);
  }
  const date = [...upcoming.keys()].sort()[0];
  return {
    cards: chosen.map((c) => ({ ...c, box: entry(c)?.box ?? 1, history: (entry(c)?.h ?? []).slice(-HISTORY_SHOWN) })),
    boxes: counts,
    next: date ? { date, count: Math.min(DAILY_CARDS, upcoming.get(date)) } : null
  };
}
