import type { Project } from '@/schemas/project';
import type { Task, TaskDomain, TaskPriority } from '@/schemas/task';
import { addDays, hubCalendarDate, toDateKey, toHubDateKey, HUB_TZ } from '@/domain/queries';

export type DumpKind = 'task' | 'communication' | 'note' | 'meta';

export type DumpItem = {
  raw: string;
  title: string;
  kind: DumpKind;
  /** False for meta-commentary, corrections, and other non-work chat turns. */
  actionable: boolean;
  domain: TaskDomain;
  priority: TaskPriority;
  due_date: string | null;
  parent_project_id: string | null;
  question: string | null;
  existing_title: string | null;
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const TEACHING = [
  'year',
  'lesson',
  'marking',
  'class',
  'student',
  'parent',
  'unit',
  'assessment',
  'excursion',
  'period',
  'faculty',
  'staff',
  'permission',
  'olympiad',
  'mindworks'
];
const WEDDING = ['florist', 'venue', 'wedding', 'suit', 'photographer', 'caterer', 'rsvp'];
const HEALTH = [
  'gp',
  'doctor',
  'blood',
  'dex',
  'vyvanse',
  'physio',
  'sleep',
  'script',
  'medical',
  'appointment'
];
const LIFE = ['grocer', 'rent', 'bills', 'fragrance', 'laundry', 'home', 'car', 'council'];
const COMMS = [
  'email',
  'call',
  'phone',
  'meeting',
  'message',
  'text',
  'zoom',
  'follow-up',
  'follow up',
  'reply',
  'write back'
];
const NOTE = ['remember', 'note:', 'fyi', 'just so', 'ref:', 'for later', 'idea:'];

/** Corrections, questions-about-Clare, and other chat turns that are not work to capture. */
const NON_ACTIONABLE = [
  /\bit was a question\b/i,
  /\bnot something to create\b/i,
  /\bnot a task\b/i,
  /\bwasn'?t a task\b/i,
  /\bthis isn'?t a task\b/i,
  /\bthat isn'?t a task\b/i,
  /\bno task here\b/i,
  /\bwasn'?t asking\b/i,
  /\bnot asking you to\b/i,
  /\bjust (?:a )?question\b/i,
  /\bjust asking\b/i,
  /\byou misread\b/i,
  /\bthat was a question\b/i,
  /\bdidn'?t mean (?:for you|to)\b/i,
  /\bdon'?t create\b/i,
  /\bdo not create\b/i,
  /\bstop trying to\b/i,
  /\bcontext drop(ped)?\b/i,
  /\bsomething got misread\b/i,
  /\bmisread (?:that|this|it)\b/i
];

function includesAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

/**
 * Verbs that mark the start of a new imperative clause. Used to split
 * comma-spliced brain dumps ("mark X, check Y, give Z") into separate
 * items without breaking genuine comma lists inside one task ("buy milk,
 * eggs, bread").
 */
const CLAUSE_VERBS = [
  'sort out',
  'work on',
  'deal with',
  'look at',
  'follow up',
  'figure out',
  'set up',
  'print out',
  'drop off',
  'pick up',
  'mark',
  'check',
  'give',
  'send',
  'call',
  'email',
  'book',
  'sort',
  'review',
  'submit',
  'chase',
  'confirm',
  'buy',
  'pay',
  'print',
  'laminate',
  'return',
  'collect',
  'deliver',
  'order',
  'follow',
  'meet',
  'sign',
  'upload',
  'download',
  'share',
  'finish',
  'complete',
  'prep',
  'prepare',
  'write',
  'plan',
  'organise',
  'organize',
  'schedule',
  'update',
  'fix',
  'handle',
  'tackle',
  'reply',
  'draft',
  'clean',
  'tidy',
  'pack',
  'file'
];

const CLAUSE_SPLIT = new RegExp(`,\\s+(?=(?:${CLAUSE_VERBS.join('|')})\\b)`, 'i');

function splitClauses(line: string): string[] {
  return line.split(CLAUSE_SPLIT);
}

function stripListPrefix(line: string): string {
  return line
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^(?:and then|also|then|plus)\s+/i, '')
    .trim();
}

function titleCaseAction(line: string): string {
  const cleaned = polishTaskTitle(stripIntentionPhrases(stripDuePhrases(stripListPrefix(line))));
  if (!cleaned) return '';
  const first = cleaned.charAt(0).toUpperCase();
  return `${first}${cleaned.slice(1)}`.replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}

function stripIntentionPhrases(line: string): string {
  return line
    .replace(
      /^(?:i(?:'ve|'ve|\s+have)\s+)?(?:really\s+|just\s+|actually\s+|probably\s+)?(?:need|have|want|ought|should|gotta|got)\s+to\s+/i,
      ''
    )
    .replace(/^(?:i\s+)?(?:really\s+|just\s+|actually\s+|probably\s+)?(?:need|have|want|ought|should|gotta|got)\s+to\s+/i, '')
    .replace(/^i(?:'m| am)\s+(?:really\s+|just\s+)?(?:going to|gonna|meant to|supposed to)\s+/i, '')
    .replace(/^i\s+(?:must|should|need|have)\s+/i, '')
    .replace(/^(?:really\s+|just\s+|actually\s+)?(?:need|have|want|ought|should|gotta|got)\s+to\s+/i, '')
    .trim();
}

/** Turn rambling dump lines into short action titles. */
function polishTaskTitle(line: string): string {
  return line
    .replace(/^(?:really|just|actually|also|maybe|probably)\s+/i, '')
    .replace(
      /\b(?:sort out|work on|deal with|look at|finish|complete|prep(?:are)? for|write|email|call|book|schedule|organis[ez]e|plan|review|update|fix|handle|tackle|figure out|get)\s+(?:my|the|this|that)\s+/i,
      (match) => match.replace(/\s+(?:my|the|this|that)\s+/i, ' ')
    )
    .replace(/\b(?:my|the)\s+(?=(?:appraisal|goal|report|meeting|lesson|unit|assessment|marking|email|call)\b)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripDuePhrases(line: string): string {
  return line
    .replace(/\b(?:due\s+)?(?:today|tomorrow|tonight|this afternoon|this week|next week)\b/gi, '')
    .replace(/\b(?:on|this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bdue\s+\d{4}-\d{2}-\d{2}\b/gi, '')
    .replace(/\bdue\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, '')
    .replace(/[,\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferDomain(text: string, preferred: TaskDomain): TaskDomain {
  if (includesAny(text, TEACHING)) return 'teaching';
  if (includesAny(text, WEDDING)) return 'wedding';
  if (includesAny(text, HEALTH)) return 'health';
  if (includesAny(text, LIFE)) return 'life';
  return preferred;
}

function inferPriority(text: string): TaskPriority {
  if (includesAny(text, ['urgent', 'asap', 'now', 'critical', 'today or die'])) return 'urgent';
  if (includesAny(text, ['high', 'important', 'deadline', 'must', 'overdue'])) return 'high';
  if (includesAny(text, ['low', 'someday', 'maybe', 'whenever'])) return 'low';
  return 'medium';
}

function isNonActionable(text: string): boolean {
  if (NON_ACTIONABLE.some((pattern) => pattern.test(text))) return true;
  // Lexical wording fixes (“Encouraging is supposed to be incursion”) — not new work.
  if (parseWordingCorrection(text)) return true;
  if (/\?\s*$/.test(text.trim()) && !includesAny(text, COMMS)) {
    const actionish =
      /\b(?:email|call|book|schedule|write|draft|finish|prep|mark|send|reply|fix|sort|organis[ez]e|plan|review|update|handle|tackle)\b/i;
    if (!actionish.test(text)) return true;
  }
  return false;
}

function inferKind(text: string): DumpKind {
  if (isNonActionable(text)) return 'meta';
  if (NOTE.some((n) => text.startsWith(n) || text.includes(` ${n}`))) return 'note';
  if (includesAny(text, COMMS)) return 'communication';
  return 'task';
}

function nextWeekday(from: Date, weekday: number): Date {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const delta = (weekday - start.getDay() + 7) % 7;
  return addDays(start, delta === 0 ? 7 : delta);
}

function parseExplicitDate(text: string, now: Date): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = dmy[3]
      ? Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])
      : now.getFullYear();
    return toDateKey(new Date(year, month - 1, day));
  }
  return null;
}

function inferDue(
  text: string,
  now: Date,
  timeZone: string
): { due_date: string | null; hint: string | null } {
  const explicit = parseExplicitDate(text, now);
  if (explicit) return { due_date: explicit, hint: null };
  // Anchor relative words to Adam's hub calendar day (UTC hosts would otherwise shift).
  const hubDay = hubCalendarDate(now, timeZone);
  if (/\btoday\b/.test(text) || /\bthis afternoon\b/.test(text) || /\btonight\b/.test(text)) {
    return { due_date: toHubDateKey(now, timeZone), hint: null };
  }
  if (/\btomorrow\b/.test(text)) {
    return { due_date: toDateKey(addDays(hubDay, 1)), hint: null };
  }
  const weekday = Object.keys(WEEKDAYS).find((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (weekday) {
    return { due_date: toDateKey(nextWeekday(hubDay, WEEKDAYS[weekday]!)), hint: null };
  }
  if (/\bthis week\b/.test(text)) return { due_date: null, hint: 'this-week' };
  if (/\bnext week\b/.test(text)) return { due_date: null, hint: 'next-week' };
  return { due_date: null, hint: null };
}

function matchProject(text: string, projects: Project[]): string | null {
  let best: { id: string; len: number } | null = null;
  for (const project of projects) {
    const name = project.title.trim().toLowerCase();
    if (name.length < 3) continue;
    if (text.includes(name) && (!best || name.length > best.len)) {
      best = { id: project.id, len: name.length };
    }
  }
  return best?.id ?? null;
}

function matchExisting(title: string, tasks: Task[]): string | null {
  const needle = title.trim().toLowerCase();
  const hit = tasks.find(
    (t) =>
      t.status !== 'done' &&
      t.status !== 'dead' &&
      t.title.trim().toLowerCase() === needle
  );
  return hit?.title ?? null;
}

/** Phrasing Clare uses when a dump title already exists as an open task. */
export function duplicateOnBoardQuestion(title: string): string {
  return `“${title}” is already on the board. Leave it, or make a new one?`;
}

export type DuplicateFollowUp =
  | { action: 'leave'; title: string }
  | { action: 'make_new'; title: string };

/**
 * When Adam answers a leave-or-new question with a short reply, recover the
 * original title from recent chat instead of treating the reply as a new dump.
 */
export function resolveDuplicateFollowUp(
  text: string,
  recentThread?: Array<{ role: 'user' | 'assistant'; text: string }>
): DuplicateFollowUp | null {
  const trimmed = text.trim();
  if (!trimmed || !recentThread?.length) return null;

  const leave =
    /^(leave it|leave|skip(?: it)?|no|nah|ignore|keep(?: the)? existing)\.?$/i.test(trimmed);
  const makeNew =
    /^(make a new one|new one|another one|duplicate(?: it)?|make another|create a new one|yes[,.]?\s*make(?: a)? new(?: one)?)\.?$/i.test(
      trimmed
    );
  if (!leave && !makeNew) return null;

  for (let i = recentThread.length - 1; i >= 0; i -= 1) {
    const turn = recentThread[i]!;
    if (turn.role !== 'assistant') continue;
    const match = turn.text.match(/[“"]([^”"]+)[”"] is already on the board/i);
    if (!match?.[1]) continue;
    const title = match[1].trim();
    if (!title) continue;
    return leave ? { action: 'leave', title } : { action: 'make_new', title };
  }
  return null;
}

export type WordingCorrectionFollowUp = {
  wrong: string;
  right: string;
  /** Prior titles with the wrong word rewritten. Empty = correction with no card to patch. */
  correctedTitles: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripBothClause(value: string): string {
  return value
    .replace(/\s+for\s+both(?:\s+of\s+(?:those|them|these))?\.?$/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

/** Lexical word-swap — not “the meeting is supposed to be tomorrow”. */
function looksLikeLexicalSwap(wrong: string, right: string, full: string): boolean {
  if (
    /\b(?:today|tomorrow|tonight|this afternoon|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      full
    )
  ) {
    return false;
  }
  if (/\b(?:sent|done|finished|ready|due|scheduled)\b/i.test(right)) return false;
  const wWords = wrong.trim().split(/\s+/).filter(Boolean).length;
  const rWords = right.trim().split(/\s+/).filter(Boolean).length;
  return wWords >= 1 && wWords <= 4 && rWords >= 1 && rWords <= 4;
}

function applyLexicalReplace(haystack: string, wrong: string, right: string): string {
  const re = new RegExp(escapeRegExp(wrong), 'gi');
  return haystack.replace(re, (match) => {
    if (match === match.toUpperCase()) return right.toUpperCase();
    if (match === match.toLowerCase()) return right.toLowerCase();
    if (match[0] === match[0]!.toUpperCase()) {
      return `${right.charAt(0).toUpperCase()}${right.slice(1)}`;
    }
    return right;
  });
}

/**
 * Parse “X is supposed to be Y” / “change X to Y” style wording fixes.
 * Returns null when the line looks like real work (“meeting is supposed to be tomorrow”).
 */
export function parseWordingCorrection(text: string): { wrong: string; right: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const itsNot = /^(?:it'?s|its)\s+(.+?),?\s+not\s+(.+?)$/i.exec(trimmed);
  if (itsNot) {
    // “it's incursion, not encouraging”
    const right = stripBothClause(itsNot[1] ?? '');
    const wrong = stripBothClause(itsNot[2] ?? '');
    if (wrong && right && looksLikeLexicalSwap(wrong, right, trimmed)) {
      return { wrong, right };
    }
  }

  const notDash = /^not\s+(.+?)[,—-]\s*(?:it'?s\s+)?(.+?)$/i.exec(trimmed);
  if (notDash) {
    // “not encouraging — incursion”
    const wrong = stripBothClause(notDash[1] ?? '');
    const right = stripBothClause(notDash[2] ?? '');
    if (wrong && right && looksLikeLexicalSwap(wrong, right, trimmed)) {
      return { wrong, right };
    }
  }

  const patterns: RegExp[] = [
    /^(.+?)\s+(?:is|was|are)\s+supposed\s+to\s+be\s+(.+)$/i,
    /^(.+?)\s+should\s+(?:be|read|say)\s+(.+)$/i,
    /^(.+?)\s+(?:was\s+)?meant\s+to\s+(?:be|say|read)\s+(.+)$/i,
    /^change\s+(.+?)\s+to\s+(.+)$/i,
    /^replace\s+(.+?)\s+with\s+(.+)$/i,
    /^(.+?)\s*(?:→|->|=>)\s*(.+)$/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(trimmed);
    if (!match) continue;
    const wrong = stripBothClause(match[1] ?? '');
    const right = stripBothClause(match[2] ?? '');
    if (!wrong || !right || wrong.toLowerCase() === right.toLowerCase()) continue;
    if (!looksLikeLexicalSwap(wrong, right, trimmed)) continue;
    return { wrong, right };
  }
  return null;
}

/**
 * When Adam corrects a word on a card Clare just quoted, rewrite that title
 * instead of treating the correction sentence as a new dump.
 */
export function resolveWordingCorrectionFollowUp(
  text: string,
  recentThread?: Array<{ role: 'user' | 'assistant'; text: string }>
): WordingCorrectionFollowUp | null {
  const parsed = parseWordingCorrection(text);
  if (!parsed) return null;

  const candidates: string[] = [];
  if (recentThread?.length) {
    for (let i = recentThread.length - 1; i >= 0; i -= 1) {
      const turn = recentThread[i]!;
      if (turn.role === 'assistant') {
        for (const match of turn.text.matchAll(/[“"]([^”"]{3,})[”"]/g)) {
          const title = match[1]?.trim();
          if (title) candidates.push(title);
        }
      } else if (turn.role === 'user' && turn.text.trim() !== text.trim()) {
        const prior = turn.text.trim();
        if (prior && new RegExp(escapeRegExp(parsed.wrong), 'i').test(prior)) {
          candidates.push(prior);
        }
      }
    }
  }

  const correctedTitles: string[] = [];
  const seen = new Set<string>();
  const wrongRe = new RegExp(escapeRegExp(parsed.wrong), 'i');
  for (const title of candidates) {
    if (!wrongRe.test(title)) continue;
    const next = applyLexicalReplace(title, parsed.wrong, parsed.right);
    if (next === title) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    correctedTitles.push(next);
  }

  return {
    wrong: parsed.wrong,
    right: parsed.right,
    correctedTitles
  };
}

function questionFor(item: {
  title: string;
  kind: DumpKind;
  actionable: boolean;
  due_date: string | null;
  hint: string | null;
  existing_title: string | null;
}): string | null {
  if (!item.actionable || item.kind === 'meta') return null;
  if (item.existing_title) {
    return duplicateOnBoardQuestion(item.title);
  }
  if (item.kind === 'note') {
    return `“${item.title}” looks like a note — task, comms, or ignore?`;
  }
  if (item.hint === 'this-week' || item.hint === 'next-week') {
    return `Is “${item.title}” due this week or next week?`;
  }
  if (!item.due_date) {
    return `“${item.title}” has no due date. Want one, or is it living its best life?`;
  }
  return null;
}

/** Split a brain dump into lines without turning “Year 9 and 10” into two tasks. */
export function splitDumpLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  const chunks = raw
    .split(/\n+|(?:^|\s)(?:[-*•]|\d+[.)])\s+|;\s+|\s+and then\s+|,\s+(?:also|then|plus)\s+/i)
    .flatMap((line) => splitClauses(line))
    .map((line) => stripListPrefix(line))
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const line of chunks) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }
  return unique.map((line) => stripListPrefix(line));
}

export function parseBrainDump(
  text: string,
  options: {
    now?: Date;
    timezone?: string;
    preferredDomain?: TaskDomain;
    tasks?: Task[];
    projects?: Project[];
    /** Skip twin detection — Adam already chose "make a new one". */
    forceNewTitles?: boolean;
  } = {}
): DumpItem[] {
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? HUB_TZ;
  const preferred = options.preferredDomain ?? 'teaching';
  const tasks = options.tasks ?? [];
  const projects = options.projects ?? [];
  const forceNew = Boolean(options.forceNewTitles);
  return splitDumpLines(text).map((line) => {
    const lower = line.toLowerCase();
    const kind = inferKind(lower);
    const actionable = kind !== 'meta';
    const { due_date, hint } = inferDue(lower, now, timezone);
    const title = titleCaseAction(line) || stripListPrefix(line);
    const existing_title = actionable && !forceNew ? matchExisting(title, tasks) : null;
    const item = {
      raw: line,
      title,
      kind,
      actionable,
      domain: inferDomain(lower, preferred),
      priority: inferPriority(lower),
      due_date,
      parent_project_id: matchProject(lower, projects),
      existing_title,
      hint
    };
    return {
      raw: item.raw,
      title: item.title,
      kind: item.kind,
      actionable: item.actionable,
      domain: item.domain,
      priority: item.priority,
      due_date: item.due_date,
      parent_project_id: item.parent_project_id,
      existing_title: item.existing_title,
      question: questionFor(item)
    };
  });
}

export function metaVoiceLine(raw: string): string {
  const snippet = raw.trim().slice(0, 72);
  return `Got it — "${snippet}". I'm listening; what do you want to do with that?`;
}

export function dumpVoiceLine(items: DumpItem[]): string {
  const tasks = items.filter((i) => i.actionable && i.kind !== 'note' && !i.existing_title);
  const notes = items.filter((i) => i.kind === 'note');
  const meta = items.filter((i) => i.kind === 'meta');
  const twins = items.filter((i) => i.existing_title);
  if (!items.length) {
    return 'That dump came through empty. Try again — I only sort chaos that actually arrives.';
  }
  if (meta.length && !tasks.length && !notes.length && !twins.length) {
    return metaVoiceLine(meta[0]!.raw);
  }
  if (items.length === 1 && tasks.length === 1) {
    return 'Right — one thing, and it actually has a shape. Here is my take.';
  }
  const bits = [
    `OK so I have ${items.length} thing${items.length === 1 ? '' : 's'} from that dump`
  ];
  if (twins.length) {
    bits.push(
      twins.length === 1
        ? '1 already living on the board'
        : `${twins.length} already living on the board`
    );
  }
  if (notes.length) {
    bits.push(
      notes.length === 1 ? '1 looks like a note, not work' : `${notes.length} look like notes, not work`
    );
  }
  if (tasks.length && tasks.length < items.length) {
    bits.push(`I can propose ${tasks.length} now`);
  }
  return `${bits.join(' — ')}. Let me untangle that for you.`;
}
