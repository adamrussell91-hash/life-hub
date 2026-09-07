/**
 * Clare DeMind workbench — 40 jobs she could not do from Life Hub chat.
 * Reads execute immediately. Writes return { kind: 'propose', proposal }
 * for the existing Confirm card / tasks:task:* blob path.
 */
import { newRecordId, newTaskId } from './tasks-blobs.mjs';
import { parseBrainDump } from './clare-dump.mjs';
import { buildClareBriefing } from './clare-desk.mjs';
import {
  addDays,
  formatDisplayDate,
  HUB_TZ,
  overdueTasks,
  parseDue,
  startOfDay,
  tasksForDay,
  toDateKey,
  toHubDateKey,
  weekDays
} from './clare-dates.mjs';
const MAX_PROTOCOL_CHARS = 24_000;

function applyProtocolUpdate(current, input) {
  const chunk = String(input?.markdown ?? '').trim();
  if (!chunk) return { ok: false, note: 'Empty protocol update — nothing written.' };
  const mode = input?.mode;
  let next = current;
  if (mode === 'replace') {
    next = chunk;
  } else if (mode === 'append') {
    next = `${String(current).trimEnd()}\n\n${chunk}\n`;
  } else if (mode === 'replace_section') {
    const heading = String(input.section_heading ?? '').trim().replace(/^#+\s*/, '');
    if (!heading) return { ok: false, note: 'replace_section needs section_heading.' };
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|\\n)##\\s+${escaped}\\b[\\s\\S]*?(?=\\n##\\s+|$)`, 'i');
    next = pattern.test(current)
      ? String(current).replace(pattern, `$1## ${heading}\n\n${chunk}\n`)
      : `${String(current).trimEnd()}\n\n## ${heading}\n\n${chunk}\n`;
  } else {
    return { ok: false, note: 'mode must be replace, append, or replace_section.' };
  }
  if (next.length > MAX_PROTOCOL_CHARS) {
    return { ok: false, note: `Protocol would exceed ${MAX_PROTOCOL_CHARS} characters.` };
  }
  return { ok: true, markdown: next };
}

export const CLARE_PROTOCOL_PATH = 'apps/tasks/config/clare-protocol.md';
export const FETCH_MAX_CHARS = 4000;
const FETCH_TIMEOUT_MS = 8000;
const FETCH_MAX_BYTES = 200 * 1024;
const WORKDAY = { start: 8 * 60, end: 16 * 60 + 30 };

export const CLARE_JOBS = Object.freeze([
  { id: 1, tool: 'fetch_url', job: 'Fetch a URL and extract readable facts' },
  { id: 2, tool: 'fetch_url', job: 'Check whether a URL is still live' },
  { id: 3, tool: 'research_topic', job: 'Research a topic from cited URLs' },
  { id: 4, tool: 'research_topic', job: 'Find official AU government or education sources' },
  { id: 5, tool: 'lookup_au_dates', job: 'Look up Australian public holidays' },
  { id: 6, tool: 'lookup_au_dates', job: 'Look up NSW and QLD school terms' },
  { id: 7, tool: 'lookup_place', job: 'Look up a place hours, phone, or address from a URL' },
  { id: 8, tool: 'compare_options', job: 'Compare options from URLs with citations' },
  { id: 9, tool: 'clare_mutate', job: 'Attach research notes to a task' },
  { id: 10, tool: 'clare_mutate', job: 'Create a task' },
  { id: 11, tool: 'clare_mutate', job: 'Update a task' },
  { id: 12, tool: 'clare_mutate', job: 'Complete a task' },
  { id: 13, tool: 'clare_mutate', job: 'Snooze or reschedule a task' },
  { id: 14, tool: 'clare_mutate', job: 'Split a task into subtasks' },
  { id: 15, tool: 'clare_mutate', job: 'Trash or kill a task' },
  { id: 16, tool: 'clare_mutate', job: 'Move a task onto a project' },
  { id: 17, tool: 'clare_mutate', job: 'Create a project' },
  { id: 18, tool: 'clare_mutate', job: 'Estimate duration' },
  { id: 19, tool: 'clare_mutate', job: 'Add tags' },
  { id: 20, tool: 'clare_mutate', job: 'Set waiting-on or blocked-by' },
  { id: 21, tool: 'clare_mutate', job: 'Batch reschedule a day' },
  { id: 22, tool: 'clare_mutate', job: 'Pin one task as today\'s focus' },
  { id: 23, tool: 'inspect_board', job: 'List projects' },
  { id: 24, tool: 'inspect_board', job: 'Get one project' },
  { id: 25, tool: 'inspect_board', job: 'List stale or rotting tasks' },
  { id: 26, tool: 'inspect_board', job: 'List blocked or waiting-on tasks' },
  { id: 27, tool: 'inspect_board', job: 'Find duplicate tasks' },
  { id: 28, tool: 'plan_work', job: 'Time-block a day' },
  { id: 29, tool: 'plan_work', job: 'Find free 15-minute slots' },
  { id: 30, tool: 'plan_work', job: 'Detect collisions with Teaching or due work' },
  { id: 31, tool: 'plan_work', job: 'Forecast weekly load' },
  { id: 32, tool: 'plan_work', job: 'Energy-aware sequencing' },
  { id: 33, tool: 'run_desk_protocol', job: 'Morning sweep from chat' },
  { id: 34, tool: 'run_desk_protocol', job: 'Tomorrow setup from chat' },
  { id: 35, tool: 'run_desk_protocol', job: 'Weekly reset from chat' },
  { id: 36, tool: 'draft_comms', job: 'Draft an email or message (does not send)' },
  { id: 37, tool: 'check_calendars', job: 'Check Teaching calendar' },
  { id: 38, tool: 'check_calendars', job: 'Check Life / task calendar' },
  { id: 39, tool: 'check_clock', job: 'Read the hub clock in Australia/Sydney' },
  { id: 40, tool: 'parse_dump', job: 'Parse a dump into task proposals; read or update your protocol' }
]);

const MUTATE_OPS = [
  'create_task', 'update_task', 'complete_task', 'reschedule_task', 'split_task',
  'trash_task', 'move_task', 'create_project', 'estimate_task', 'tag_task',
  'set_waiting_on', 'attach_research', 'batch_reschedule', 'pin_focus'
];

const OFFICIAL_AU = [
  { label: 'NSW school calendars', url: 'https://education.nsw.gov.au/schooling/calendars' },
  { label: 'NSW 2026 school calendar', url: 'https://education.nsw.gov.au/schooling/calendars/2026' },
  { label: 'QLD school terms', url: 'https://education.qld.gov.au/about-us/calendar/term-dates' },
  { label: 'NSW public holidays', url: 'https://www.nsw.gov.au/about-nsw/public-holidays' },
  { label: 'QLD public holidays', url: 'https://www.qld.gov.au/recreation/travel/holidays/public' },
  { label: 'NSW Education', url: 'https://education.nsw.gov.au/' },
  { label: 'QLD Education', url: 'https://education.qld.gov.au/' },
  { label: 'NESA', url: 'https://www.nsw.gov.au/education-and-training/nesa' }
];

export function formatClareJobsForPrompt() {
  return [
    'Clare workbench — 40 jobs you can actually do from this chat. Use the named tool. Do not say you cannot do these.',
    'Internet research: web_search finds pages; fetch_url opens a specific URL; research_topic cites sources; lookup_au_dates / lookup_place / compare_options for dates, venues, and options.',
    'Prefer create_task / update_task for ordinary capture and edits. Other writes (complete/reschedule/split/trash/move/estimate/tag/waiting-on/research notes/batch/pin/create project) go through clare_mutate. Writes wait for Adam to Confirm. Never claim a write landed until the tool returns awaiting_confirm or applied.',
    'You cannot send email. draft_comms writes a draft only.',
    ...CLARE_JOBS.map(item => `${item.id}. ${item.job} — ${item.tool}`)
  ].join('\n');
}

function tool(name, description, properties, required = []) {
  return {
    name,
    description,
    input_schema: {
      type: 'object',
      properties,
      ...(required.length ? { required } : {})
    }
  };
}

export function clareWorkSchemas() {
  return [
    tool('fetch_url', 'Fetch one public https URL and extract readable text. Also use to check if a page is still live. Not a search — use web_search first if you do not have a URL.', {
      url: { type: 'string' },
      reason: { type: 'string' }
    }, ['url']),
    tool('research_topic', 'Research a topic from cited URLs (fetch each) and/or list official AU government/education sources. Prefer official pages. Cite every fact.', {
      topic: { type: 'string' },
      mode: { type: 'string', enum: ['sources', 'official'] },
      urls: { type: 'array', items: { type: 'string' } }
    }, ['topic']),
    tool('lookup_au_dates', 'Look up Australian public holidays and NSW/QLD school terms for a year. Deterministic 2026–2027 table plus official source URLs to verify.', {
      year: { type: 'number' },
      state: { type: 'string', enum: ['NSW', 'QLD', 'national'] },
      kind: { type: 'string', enum: ['holidays', 'school_terms', 'both'] }
    }),
    tool('lookup_place', 'Extract hours, phone, and address from a venue or organisation URL.', {
      url: { type: 'string' },
      name: { type: 'string' }
    }, ['url']),
    tool('compare_options', 'Fetch each option URL and return a comparison table with citations.', {
      question: { type: 'string' },
      urls: { type: 'array', items: { type: 'string' } }
    }, ['urls']),
    tool('clare_mutate', 'Propose a Tasks write (Confirm before anything is stored). Ops: create_task, update_task, complete_task, reschedule_task, split_task, trash_task, move_task, create_project, estimate_task, tag_task, set_waiting_on, attach_research, batch_reschedule, pin_focus.', {
      op: { type: 'string', enum: MUTATE_OPS },
      task_id: { type: 'string' },
      project_id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      domain: { type: 'string', enum: ['teaching', 'life', 'wedding', 'health', 'other'] },
      priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
      due_date: { type: 'string' },
      due_time: { type: 'string' },
      status: { type: 'string' },
      estimated_duration: { type: 'number' },
      tags: { type: 'array', items: { type: 'string' } },
      waiting_on: { type: 'string' },
      notes: { type: 'string' },
      subtasks: { type: 'array', items: { type: 'string' } },
      task_ids: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' }
    }, ['op']),
    tool('inspect_board', 'Read projects, stale tasks, blocked/waiting-on tasks, or likely duplicates.', {
      view: { type: 'string', enum: ['projects', 'project', 'stale', 'blocked', 'duplicates'] },
      project_id: { type: 'string' },
      query: { type: 'string' }
    }, ['view']),
    tool('plan_work', 'Plan a day or week: time-block, free 15-minute slots, collisions, weekly load, or energy-aware order. Pass energy, capacity_minutes, and workday_start/end when Adam stated them this turn. Do not invent a standing preference. If omitted, the planner uses labelled fallbacks (default 08:00–16:30 is a fallback, not a saved preference).', {
      view: { type: 'string', enum: ['time_block', 'free_slots', 'collisions', 'week_load', 'energy'] },
      date: { type: 'string' },
      energy_level: { type: 'string', enum: ['low', 'medium', 'high'] },
      cognitive_load: { type: 'number' },
      capacity_minutes: { type: 'number' },
      workday_start: { type: 'string', description: 'HH:MM when Adam stated a start. Omit to use the labelled fallback.' },
      workday_end: { type: 'string', description: 'HH:MM when Adam stated an end. Omit to use the labelled fallback.' }
    }, ['view']),
    tool('run_desk_protocol', 'Run Morning Sweep, Tomorrow Setup, Weekly Reset, or High Stakes from chat — same briefing as the Clare desk.', {
      protocol_id: { type: 'string', enum: ['morning-sweep', 'tomorrow-setup', 'weekly-reset', 'high-stakes'] }
    }, ['protocol_id']),
    tool('draft_comms', 'Draft an email or message for a task. Does not send.', {
      task_id: { type: 'string' },
      audience: { type: 'string' },
      intent: { type: 'string' },
      points: { type: 'string' }
    }, ['intent']),
    tool('check_calendars', 'List Teaching lessons and task due dates for a date window.', {
      from: { type: 'string' },
      days: { type: 'number' },
      source: { type: 'string', enum: ['teaching', 'life', 'both'] }
    }),
    tool('check_clock', 'Read Adam\'s current calendar day and local time in the hub timezone. Never invent a date.', {
      reason: { type: 'string' }
    }),
    tool('parse_dump', 'Parse a brain dump into distinct items with domain, due date, and duplicate flags. Does not write — follow with create_task after Confirm.', {
      text: { type: 'string' },
      domain: { type: 'string', enum: ['teaching', 'life', 'wedding', 'health', 'other'] }
    }, ['text']),
    tool('read_protocol', 'Read your live Clare operating protocol.', {
      reason: { type: 'string' }
    }),
    tool('update_protocol', 'Propose a rewrite of your operating protocol. Confirm before it is saved. Modes: replace | append | replace_section.', {
      mode: { type: 'string', enum: ['replace', 'append', 'replace_section'] },
      section_heading: { type: 'string' },
      markdown: { type: 'string' },
      reason: { type: 'string' }
    }, ['mode', 'markdown'])
  ];
}

const CLARE_WORK_NAMES = new Set(clareWorkSchemas().map(item => item.name));

export function isClareWorkTool(name) {
  return CLARE_WORK_NAMES.has(name);
}

function deny(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function ok(data) {
  return { ok: true, ...data };
}

function propose(intent, writes, surfaces = ['confirm_card', 'tasks_hub']) {
  return {
    kind: 'propose',
    proposal: {
      intent,
      reads: [],
      writes,
      surfaces
    }
  };
}

function writeEntry(path, mode, record, diff) {
  return {
    path,
    mode,
    content: JSON.stringify(record, null, 2),
    diff
  };
}

function findTask(tasks, id) {
  const taskId = String(id ?? '').trim();
  if (!taskId) return null;
  return (tasks ?? []).find(task => task?.id === taskId) ?? null;
}

function findProject(projects, id) {
  const projectId = String(id ?? '').trim();
  if (!projectId) return null;
  return (projects ?? []).find(project => project?.id === projectId) ?? null;
}

function isOpen(task) {
  if (!task || typeof task !== 'object') return false;
  if (task.status === 'done' || task.status === 'dead' || task.bucket === 'done') return false;
  return typeof task.title === 'string' && task.title.trim().length > 0;
}

function compact(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status ?? null,
    domain: task.domain ?? null,
    priority: task.priority ?? null,
    due_date: task.due_date ?? null,
    due_time: task.due_time ?? null,
    estimated_duration: task.estimated_duration ?? null,
    parent_project_id: task.parent_project_id ?? null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    waiting_on: task.waiting_on ?? null
  };
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isBlockedFetchHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === 'metadata.google.internal') return true;
  if (host === '::1' || host === '[::1]') return true;
  const ip = host.replace(/^\[|\]$/g, '');
  if (ip === '127.0.0.1' || ip === '0.0.0.0' || ip === '::1') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every(n => Number.isInteger(n))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }
  return false;
}

export function assertPublicHttpUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'missing_url' };
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'unsupported_protocol' };
  }
  if (parsed.username || parsed.password) return { ok: false, error: 'credentials_forbidden' };
  if (isBlockedFetchHost(parsed.hostname)) return { ok: false, error: 'blocked_host' };
  return { ok: true, url: parsed.toString() };
}

export function extractReadableText(html, max = FETCH_MAX_CHARS) {
  const raw = String(html ?? '');
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).slice(0, 200) : '';
  const withoutNoise = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const text = stripTags(withoutNoise).replace(/\s+/g, ' ').trim();
  return {
    title,
    text: text.slice(0, max),
    truncated: text.length > max,
    chars: text.length
  };
}

function stripTags(value) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

export function extractPlaceFacts(text) {
  const body = String(text ?? '');
  const phones = [...body.matchAll(/(?:\+61\s?|0)[2-478](?:[\s-]?\d){8}|\b\d{2}\s\d{4}\s\d{4}\b/g)]
    .map(match => match[0].trim())
    .slice(0, 4);
  const hours = [...body.matchAll(/(?:open(?:ing)? hours|hours)[:\s]+(.{8,80})/gi)]
    .map(match => match[1].trim())
    .slice(0, 3);
  const emails = [...body.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map(match => match[0])
    .slice(0, 3);
  return { phones, hours, emails };
}

async function fetchPublicUrl(url, fetchImpl = fetch) {
  const checked = assertPublicHttpUrl(url);
  if (!checked.ok) return checked;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(checked.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'LifeHub-Clare/1.0' }
    });
    const finalUrl = String(response.url || checked.url);
    const finalCheck = assertPublicHttpUrl(finalUrl);
    if (!finalCheck.ok) return { ok: false, error: 'blocked_redirect', status: response.status };
    const buf = Buffer.from(await response.arrayBuffer());
    const clipped = buf.subarray(0, FETCH_MAX_BYTES);
    const extracted = extractReadableText(clipped.toString('utf8'));
    return {
      ok: true,
      live: response.ok,
      status: response.status,
      url: checked.url,
      final_url: finalUrl,
      truncated_bytes: buf.length > FETCH_MAX_BYTES,
      ...extracted
    };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return { ok: false, error: aborted ? 'timeout' : 'fetch_failed', url: checked.url };
  } finally {
    clearTimeout(timer);
  }
}

export function lookupAuDates({ year, state = 'NSW', kind = 'both' } = {}) {
  const y = Number(year) || new Date().getFullYear();
  const table = AU_DATES[y];
  if (!table) {
    return {
      ok: true,
      year: y,
      note: 'No baked table for that year. Fetch the official URLs.',
      official: OFFICIAL_AU.filter(item => /holiday|term|calendar/i.test(item.label)),
      holidays: [],
      school_terms: []
    };
  }
  const holidays = (kind === 'school_terms' ? [] : table.holidays)
    .filter(item => state === 'national' ? item.scope === 'national' : (item.scope === 'national' || item.scope === state));
  const school_terms = kind === 'holidays' ? [] : (table.terms[state] ?? []);
  return {
    ok: true,
    year: y,
    state,
    holidays,
    school_terms,
    official: OFFICIAL_AU.filter(item => /holiday|term|calendar/i.test(item.label)),
    note: 'Baked 2026–2027 dates. Verify against the official URLs if a later year or a gazette change matters.'
  };
}

const AU_DATES = {
  2026: {
    holidays: [
      { date: '2026-01-01', name: "New Year's Day", scope: 'national' },
      { date: '2026-01-26', name: 'Australia Day', scope: 'national' },
      { date: '2026-04-03', name: 'Good Friday', scope: 'national' },
      { date: '2026-04-04', name: 'Easter Saturday', scope: 'national' },
      { date: '2026-04-05', name: 'Easter Sunday', scope: 'national' },
      { date: '2026-04-06', name: 'Easter Monday', scope: 'national' },
      { date: '2026-04-25', name: 'Anzac Day', scope: 'national' },
      { date: '2026-05-04', name: 'Labour Day', scope: 'QLD' },
      { date: '2026-06-08', name: "King's Birthday", scope: 'NSW' },
      { date: '2026-10-05', name: 'Labour Day', scope: 'NSW' },
      { date: '2026-10-05', name: "King's Birthday", scope: 'QLD' },
      { date: '2026-12-25', name: 'Christmas Day', scope: 'national' },
      { date: '2026-12-26', name: 'Boxing Day', scope: 'national' }
    ],
    terms: {
      NSW: [
        { term: 1, start: '2026-01-27', end: '2026-04-10' },
        { term: 2, start: '2026-04-27', end: '2026-07-03' },
        { term: 3, start: '2026-07-20', end: '2026-09-25' },
        { term: 4, start: '2026-10-12', end: '2026-12-16' }
      ],
      QLD: [
        { term: 1, start: '2026-01-27', end: '2026-04-02' },
        { term: 2, start: '2026-04-20', end: '2026-06-26' },
        { term: 3, start: '2026-07-13', end: '2026-09-18' },
        { term: 4, start: '2026-10-06', end: '2026-12-11' }
      ]
    }
  },
  2027: {
    holidays: [
      { date: '2027-01-01', name: "New Year's Day", scope: 'national' },
      { date: '2027-01-26', name: 'Australia Day', scope: 'national' },
      { date: '2027-03-26', name: 'Good Friday', scope: 'national' },
      { date: '2027-03-27', name: 'Easter Saturday', scope: 'national' },
      { date: '2027-03-28', name: 'Easter Sunday', scope: 'national' },
      { date: '2027-03-29', name: 'Easter Monday', scope: 'national' },
      { date: '2027-04-25', name: 'Anzac Day', scope: 'national' },
      { date: '2027-12-25', name: 'Christmas Day', scope: 'national' },
      { date: '2027-12-26', name: 'Boxing Day', scope: 'national' }
    ],
    terms: {
      NSW: [
        { term: 1, start: '2027-01-27', end: '2027-04-09' },
        { term: 2, start: '2027-04-26', end: '2027-07-02' },
        { term: 3, start: '2027-07-19', end: '2027-09-24' },
        { term: 4, start: '2027-10-11', end: '2027-12-17' }
      ],
      QLD: [
        { term: 1, start: '2027-01-27', end: '2027-04-01' },
        { term: 2, start: '2027-04-19', end: '2027-06-25' },
        { term: 3, start: '2027-07-12', end: '2027-09-17' },
        { term: 4, start: '2027-10-05', end: '2027-12-10' }
      ]
    }
  }
};

function readClock(now = new Date(), timeZone = HUB_TZ) {
  const local = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const parts = Object.fromEntries(local.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    timezone: timeZone,
    today: toHubDateKey(now, timeZone),
    today_weekday: parts.weekday,
    local_time: `${parts.hour}:${parts.minute}`,
    utc: now.toISOString()
  };
}

function titleTokens(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !['the', 'and', 'for', 'with'].includes(word));
}

function tokenOverlap(a, b) {
  const left = new Set(titleTokens(a));
  const right = new Set(titleTokens(b));
  if (!left.size || !right.size) return 0;
  let hit = 0;
  for (const word of left) if (right.has(word)) hit += 1;
  return hit / Math.min(left.size, right.size);
}

function titlesAreDuplicates(a, b) {
  const exact = String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  return exact || tokenOverlap(a, b) >= 0.6;
}

function minutesOf(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function dayKey(value, now) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return toHubDateKey(now, HUB_TZ);
}

function lessonDate(lesson) {
  return lesson?.date || lesson?.scheduled_date || lesson?.starts_on || null;
}

export function inspectBoard(view, { tasks = [], projects = [], project_id, query } = {}, now = new Date()) {
  if (view === 'projects') {
    return ok({
      view,
      count: projects.length,
      projects: projects.slice(0, 30).map(project => ({
        id: project.id,
        title: project.title,
        status: project.status ?? null,
        type: project.type ?? null
      }))
    });
  }
  if (view === 'project') {
    const project = findProject(projects, project_id);
    if (!project) return deny('project_not_found', { project_id });
    const kids = (tasks ?? []).filter(task => task.parent_project_id === project.id).map(compact);
    return ok({ view, project, tasks: kids.slice(0, 40), task_count: kids.length });
  }
  const open = (tasks ?? []).filter(isOpen);
  if (view === 'stale') {
    const staleTasks = open
      .filter(task => task.updated_at || task.created_at)
      .slice()
      .sort((a, b) => String(a.updated_at || a.created_at).localeCompare(String(b.updated_at || b.created_at)))
      .slice(0, 12)
      .map(compact);
    const staleCutoff = (now instanceof Date ? now.getTime() : Date.parse(now)) - 60 * 24 * 60 * 60 * 1000;
    const staleProjects = (projects ?? [])
      .filter(project => {
        const last = project.updated_at || project.last_active || project.created_at;
        return last && Date.parse(last) < staleCutoff;
      })
      .map(project => ({
        id: project.id,
        title: project.title,
        kind: 'project',
        updated_at: project.updated_at,
        health: 'stale'
      }));
    const results = [...staleProjects, ...staleTasks].slice(0, 16);
    return ok({ view, count: results.length, results });
  }
  if (view === 'blocked') {
    const blocked = open.filter(task =>
      task.waiting_on
      || task.blocked_by
      || (Array.isArray(task.tags) && task.tags.some(tag => /wait|block/i.test(tag)))
    );
    return ok({ view, count: blocked.length, results: blocked.slice(0, 20).map(compact) });
  }
  if (view === 'duplicates') {
    const needle = String(query ?? '').trim().toLowerCase();
    const pool = open.filter(task => {
      const title = String(task.title ?? '').toLowerCase();
      return !needle || title.includes(needle) || tokenOverlap(title, needle) >= 0.4;
    });
    const groups = [];
    const used = new Set();
    for (let i = 0; i < pool.length; i += 1) {
      if (used.has(pool[i].id)) continue;
      const group = [compact(pool[i])];
      used.add(pool[i].id);
      for (let j = i + 1; j < pool.length; j += 1) {
        if (used.has(pool[j].id)) continue;
        if (titlesAreDuplicates(pool[i].title, pool[j].title)) {
          group.push(compact(pool[j]));
          used.add(pool[j].id);
        }
      }
      if (group.length > 1) groups.push(group);
    }
    return ok({ view, count: groups.length, results: groups.slice(0, 12), method: 'token_overlap' });
  }
  return deny('unknown_view');
}

export function planWork(view, {
  tasks = [],
  lessons = [],
  date,
  now = new Date(),
  energy = null,
  workday = null,
  capacity_minutes = null
} = {}) {
  const key = dayKey(date, now);
  const day = parseDue(key) ?? startOfDay(now);
  const dueToday = tasksForDay(tasks, day);
  const overdue = overdueTasks(tasks, day);
  const seen = new Set(dueToday.map(task => task.id));
  const dayTasks = [...overdue.filter(task => !seen.has(task.id)), ...dueToday];
  const dayLessons = (lessons ?? []).filter(lesson => String(lessonDate(lesson) ?? '') === key);

  if (view === 'collisions') {
    const collisions = [];
    if (dayTasks.length && dayLessons.length) {
      collisions.push({
        kind: 'teaching_and_tasks',
        date: key,
        tasks: dayTasks.slice(0, 8).map(compact),
        lessons: dayLessons.slice(0, 8).map(lesson => ({
          id: lesson.id,
          title: lesson.title,
          date: lessonDate(lesson)
        }))
      });
    }
    return ok({
      view,
      date: key,
      task_count: dayTasks.length,
      lesson_count: dayLessons.length,
      collisions
    });
  }

  if (view === 'week_load') {
    const days = weekDays(day);
    return ok({
      view,
      days: days.map(item => {
        const items = tasksForDay(tasks, item);
        const minutes = items.reduce((sum, task) => {
          const known = Number(task.estimated_duration);
          return sum + (Number.isFinite(known) && known > 0 ? known : 30);
        }, 0);
        return {
          date: toDateKey(item),
          label: formatDisplayDate(item),
          task_count: items.length,
          estimated_minutes: minutes,
          titles: items.slice(0, 4).map(task => task.title)
        };
      })
    });
  }

  if (view === 'energy') {
    const open = (tasks ?? []).filter(isOpen);
    const level = String(energy?.level ?? energy ?? '').toLowerCase();
    const load = Number(energy?.cognitive_load);
    const scored = open.map(task => {
      const due = parseDue(task.due_date);
      const overdue = due ? startOfDay(due).getTime() < startOfDay(now).getTime() : false;
      const known = Number(task.estimated_duration);
      const minutes = Number.isFinite(known) && known > 0 ? known : 30;
      const comms = Array.isArray(task.tags) && task.tags.includes('comms');
      let rank = 50;
      if (task.priority === 'urgent') rank -= 20;
      if (task.priority === 'high') rank -= 12;
      if (overdue) rank -= 15;
      if (level === 'low') {
        if (minutes <= 20) rank -= 16;
        if (comms) rank -= 8;
        if (minutes >= 60) rank += 10;
      } else {
        if (minutes <= 20) rank -= 8;
        if (comms) rank -= 4;
      }
      if (Number.isFinite(load) && load >= 7 && minutes >= 60) rank += 8;
      return {
        ...compact(task),
        energy_rank: rank,
        overdue,
        short_win: minutes <= 20,
        energy_level_used: level || null
      };
    }).sort((a, b) => a.energy_rank - b.energy_rank);
    return ok({
      view,
      sequence: scored.slice(0, 10),
      energy_applied: Boolean(level),
      note: level
        ? `Sequenced for ${level} energy. Confirm before moving dates.`
        : 'No current energy supplied. Overdue and short wins first. Confirm before moving dates.'
    });
  }

  const bounds = resolveWorkday({ workday, now, date: key });
  const reserved = dayLessons.map(lessonBusy).filter(Boolean);
  const capacity = capacity_minutes == null || capacity_minutes === ''
    ? Number.NaN
    : Number(capacity_minutes);
  const planned = [];
  let usedMinutes = 0;
  const deferred = [];
  const sortedTasks = [...dayTasks].sort((a, b) => {
    const aOver = parseDue(a.due_date) && startOfDay(parseDue(a.due_date)).getTime() < startOfDay(now).getTime();
    const bOver = parseDue(b.due_date) && startOfDay(parseDue(b.due_date)).getTime() < startOfDay(now).getTime();
    if (aOver !== bOver) return aOver ? -1 : 1;
    return 0;
  });
  for (const task of sortedTasks.slice(0, 12)) {
    if (task.blocked_by || task.depends_on) {
      deferred.push({
        ...compact(task),
        reason: `Blocked by ${task.blocked_by || task.depends_on}`
      });
      continue;
    }
    const known = Number(task.estimated_duration);
    const durationUnknown = !(Number.isFinite(known) && known > 0);
    const minutes = durationUnknown ? 30 : Math.max(15, known);
    if (Number.isFinite(capacity) && usedMinutes + minutes > capacity) {
      deferred.push({ ...compact(task), reason: 'Insufficient remaining capacity' });
      continue;
    }
    const slot = firstFreeSlot(bounds, reserved, planned, minutes);
    if (!slot) {
      deferred.push({ ...compact(task), reason: 'No free slot around reserved commitments' });
      continue;
    }
    planned.push({
      ...compact(task),
      start: formatMinutes(slot.start),
      end: formatMinutes(slot.end),
      minutes: slot.end - slot.start,
      duration_unknown: durationUnknown,
      estimate_source: durationUnknown ? 'unknown_fallback' : 'task.estimated_duration'
    });
    usedMinutes += minutes;
  }
  const used = [
    ...reserved,
    ...planned.map(block => ({ start: minutesOf(block.start), end: minutesOf(block.end) }))
  ].filter(item => item.start != null && item.end != null);
  const slots = freeSlots(bounds, used);
  const workdayLabel = `${formatMinutes(bounds.start)}–${formatMinutes(bounds.end)} ${bounds.source}`;
  if (view === 'free_slots') {
    return ok({
      view,
      date: key,
      slots,
      workday: workdayLabel,
      reserved_lessons: reserved.map(item => ({ start: formatMinutes(item.start), end: formatMinutes(item.end), title: item.title }))
    });
  }
  return ok({
    view: 'time_block',
    date: key,
    blocks: planned,
    leftover_slots: slots,
    lessons: dayLessons.length,
    reserved_lessons: reserved.map(item => ({
      start: formatMinutes(item.start),
      end: formatMinutes(item.end),
      title: item.title
    })),
    deferred,
    workday: workdayLabel,
    insufficient_capacity: Number.isFinite(capacity) && deferred.some(item => item.reason.includes('capacity'))
  });
}

function hubMinutes(now) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: HUB_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now instanceof Date ? now : new Date(now));
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function resolveWorkday({ workday, now, date }) {
  if (workday?.start && workday?.end) {
    return {
      start: minutesOf(workday.start) ?? WORKDAY.start,
      end: minutesOf(workday.end) ?? WORKDAY.end,
      source: workday.source || 'tool_input'
    };
  }
  let start = WORKDAY.start;
  const end = WORKDAY.end;
  let source = 'default_workday_fallback';
  if (date && date === toHubDateKey(now, HUB_TZ)) {
    const current = hubMinutes(now);
    if (current != null && current > start && current < end) {
      start = current;
      source = 'interrupted_today';
    }
  }
  return { start, end, source };
}

function lessonBusy(lesson) {
  const start = minutesOf(lesson.starts_at || lesson.start || lesson.start_time);
  if (start == null) return null;
  const minutes = Number(lesson.duration_minutes || lesson.minutes) || 60;
  return { start, end: start + minutes, title: lesson.title, kind: 'lesson' };
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function firstFreeSlot(bounds, reserved, planned, minutes) {
  const busy = [
    ...reserved,
    ...planned.map(block => ({ start: minutesOf(block.start), end: minutesOf(block.end) }))
  ]
    .filter(item => item.start != null && item.end != null)
    .sort((a, b) => a.start - b.start);
  let cursor = bounds.start;
  for (const block of busy) {
    if (block.start - cursor >= minutes) {
      return { start: cursor, end: cursor + minutes };
    }
    cursor = Math.max(cursor, block.end);
  }
  if (bounds.end - cursor >= minutes) return { start: cursor, end: cursor + minutes };
  return null;
}

function freeSlots(bounds, busy) {
  const slots = [];
  let scan = bounds.start;
  const ordered = [...busy].sort((a, b) => a.start - b.start);
  for (const block of ordered) {
    if (block.start - scan >= 15) slots.push({ start: formatMinutes(scan), end: formatMinutes(block.start) });
    scan = Math.max(scan, block.end);
  }
  if (bounds.end - scan >= 15) slots.push({ start: formatMinutes(scan), end: formatMinutes(bounds.end) });
  return slots;
}

function buildTaskRecord(input, existing, nowIso) {
  const base = existing ? { ...existing } : {
    schema_version: 1,
    id: newTaskId(),
    kind: 'task',
    bucket: 'active',
    status: 'open',
    priority: 'medium',
    domain: 'other',
    description: '',
    tags: ['clare'],
    created_at: nowIso,
    completed_at: null,
    source: 'clare_chat'
  };
  if (typeof input.title === 'string' && input.title.trim()) base.title = input.title.trim();
  if (typeof input.description === 'string') base.description = input.description;
  if (typeof input.domain === 'string') base.domain = input.domain;
  if (typeof input.priority === 'string') base.priority = input.priority;
  if (typeof input.due_date === 'string' || input.due_date === null) base.due_date = input.due_date;
  if (typeof input.due_time === 'string' || input.due_time === null) base.due_time = input.due_time;
  if (typeof input.status === 'string') base.status = input.status;
  if (Number.isFinite(Number(input.estimated_duration))) base.estimated_duration = Number(input.estimated_duration);
  if (typeof input.project_id === 'string') base.parent_project_id = input.project_id;
  if (Array.isArray(input.tags)) {
    base.tags = [...new Set([...(base.tags ?? []), ...input.tags.map(tag => String(tag).trim()).filter(Boolean)])];
  }
  if (typeof input.waiting_on === 'string') base.waiting_on = input.waiting_on.trim();
  base.updated_at = nowIso;
  return base;
}

export function buildClareMutation(input, { tasks = [], projects = [], nowIso = () => new Date().toISOString() } = {}) {
  const op = String(input?.op ?? '').trim();
  if (!MUTATE_OPS.includes(op)) return deny('unknown_op');
  const stamp = nowIso();

  if (op === 'create_task') {
    const title = String(input.title ?? '').trim();
    if (!title) return deny('missing_title');
    const record = buildTaskRecord(input, null, stamp);
    record.title = title;
    return propose(`Create task: ${title}`, [
      writeEntry(`tasks:task:${record.id}`, 'create', record, `new task “${title}”`)
    ]);
  }

  if (op === 'create_project') {
    const title = String(input.title ?? '').trim();
    if (!title) return deny('missing_title');
    const record = {
      schema_version: 1,
      id: newRecordId('proj'),
      title,
      description: String(input.description ?? ''),
      status: 'active',
      type: 'standard',
      tags: Array.isArray(input.tags) ? input.tags : ['clare'],
      created_at: stamp,
      updated_at: stamp
    };
    return propose(`Create project: ${title}`, [
      writeEntry(`tasks:project:${record.id}`, 'create', record, `new project “${title}”`)
    ]);
  }

  if (op === 'batch_reschedule') {
    const ids = Array.isArray(input.task_ids) ? input.task_ids.slice(0, 8) : [];
    const due = typeof input.due_date === 'string' ? input.due_date : '';
    if (!ids.length || !due) return deny('missing_batch');
    const writes = [];
    for (const id of ids) {
      const existing = findTask(tasks, id);
      if (!existing) continue;
      const record = buildTaskRecord({ due_date: due }, existing, stamp);
      writes.push(writeEntry(`tasks:task:${record.id}`, 'overwrite', record, `reschedule ${existing.title} → ${due}`));
    }
    if (!writes.length) return deny('no_matching_tasks');
    return propose(`Batch reschedule ${writes.length} tasks to ${due}`, writes);
  }

  const existing = findTask(tasks, input.task_id);
  if (!existing) return deny('task_not_found', { task_id: input.task_id ?? null });

  if (op === 'split_task') {
    const titles = (Array.isArray(input.subtasks) ? input.subtasks : [])
      .map(title => String(title).trim())
      .filter(Boolean)
      .slice(0, 7);
    if (!titles.length) return deny('missing_subtasks');
    const writes = [];
    for (const title of titles) {
      const child = buildTaskRecord({
        title,
        domain: existing.domain,
        priority: existing.priority,
        project_id: existing.parent_project_id,
        due_date: existing.due_date
      }, null, stamp);
      child.kind = 'step';
      child.parent_task_id = existing.id;
      writes.push(writeEntry(`tasks:task:${child.id}`, 'create', child, `subtask “${title}”`));
    }
    return propose(`Split “${existing.title}” into ${titles.length} steps`, writes);
  }

  const patch = { ...input };
  if (op === 'complete_task') {
    patch.status = 'done';
    patch.bucket = 'done';
  }
  if (op === 'trash_task') {
    patch.status = 'dead';
    patch.bucket = 'trash';
  }
  if (op === 'reschedule_task' && !patch.due_date) return deny('missing_due_date');
  if (op === 'move_task' && !patch.project_id) return deny('missing_project_id');
  if (op === 'estimate_task' && !Number.isFinite(Number(patch.estimated_duration))) {
    return deny('missing_estimate');
  }
  if (op === 'pin_focus') {
    patch.tags = [...(existing.tags ?? []), 'clare-focus'];
    patch.priority = existing.priority === 'low' ? 'high' : existing.priority;
  }
  if (op === 'attach_research') {
    const notes = String(input.notes ?? '').trim();
    if (!notes) return deny('missing_notes');
    const blocks = Array.isArray(existing.page_blocks) ? [...existing.page_blocks] : [];
    blocks.push({
      type: 'note',
      text: notes.slice(0, 4000),
      source: 'clare_research',
      created_at: stamp
    });
    const record = buildTaskRecord({}, existing, stamp);
    record.page_blocks = blocks.slice(0, 80);
    return propose(`Attach research to “${existing.title}”`, [
      writeEntry(`tasks:task:${record.id}`, 'overwrite', record, `research note on ${existing.title}`)
    ]);
  }

  const record = buildTaskRecord(patch, existing, stamp);
  if (op === 'complete_task') record.completed_at = stamp;
  const label = String(input.summary ?? op).replace(/_/g, ' ');
  return propose(`${label}: ${existing.title}`, [
    writeEntry(`tasks:task:${record.id}`, 'overwrite', record, `${label} — ${existing.title}`)
  ]);
}

export function formatClareDraft({ task, audience, intent, points }) {
  const who = String(audience ?? 'there').trim() || 'there';
  const why = String(intent ?? '').trim();
  const extra = String(points ?? '').trim();
  const about = task?.title ? ` about ${task.title}` : '';
  return [
    `Hi ${who},`,
    '',
    why || `Following up${about}.`,
    extra ? '' : null,
    extra || null,
    '',
    'Thanks,',
    'Adam'
  ].filter(line => line !== null).join('\n');
}

export async function executeClareWork(name, input = {}, ctx = {}) {
  const now = ctx.now ?? new Date();
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const tasks = ctx.tasks ?? [];
  const projects = ctx.projects ?? [];
  const lessons = ctx.lessons ?? [];

  if (name === 'check_clock') {
    return ok({ ...readClock(now, ctx.timezone || HUB_TZ), reason: input.reason ?? null });
  }
  if (name === 'read_protocol') {
    const markdown = String(ctx.protocol ?? '');
    return ok({ path: CLARE_PROTOCOL_PATH, chars: markdown.length, markdown, reason: input.reason ?? null });
  }
  if (name === 'update_protocol') {
    const current = String(ctx.protocol ?? '');
    const applied = applyProtocolUpdate(current, {
      mode: input.mode,
      markdown: input.markdown,
      section_heading: input.section_heading
    });
    if (!applied.ok) return deny(applied.note || 'protocol_update_failed');
    return propose(
      `Update Clare protocol: ${input.reason || input.mode}`,
      [{
        path: CLARE_PROTOCOL_PATH,
        mode: 'overwrite',
        content: applied.markdown,
        diff: `protocol ${input.mode}`
      }],
      ['confirm_card']
    );
  }
  if (name === 'parse_dump') {
    const items = parseBrainDump(input.text, {
      now,
      timezone: ctx.timezone || HUB_TZ,
      preferredDomain: input.domain ?? 'teaching',
      tasks,
      projects
    });
    const kept = items.slice(0, 20);
    return ok({
      count: items.length,
      items: kept,
      kept: kept.length,
      omitted: Math.max(0, items.length - kept.length),
      truncated: items.length > kept.length
    });
  }
  if (name === 'run_desk_protocol') {
    const briefing = buildClareBriefing(tasks, input.protocol_id, now, { projects });
    return ok({ protocol_id: briefing.protocol_id, briefing });
  }
  if (name === 'inspect_board') {
    return inspectBoard(input.view, { tasks, projects, project_id: input.project_id, query: input.query }, now);
  }
  if (name === 'plan_work') {
    const energyLevel = input.energy_level ?? input.energy?.level ?? ctx.energy?.level ?? null;
    const cognitiveLoad = input.cognitive_load ?? input.energy?.cognitive_load ?? ctx.energy?.cognitive_load;
    const energy = energyLevel || Number.isFinite(Number(cognitiveLoad))
      ? { level: energyLevel, cognitive_load: cognitiveLoad }
      : null;
    const start = input.workday_start ?? input.workday?.start ?? ctx.workday?.start ?? null;
    const end = input.workday_end ?? input.workday?.end ?? ctx.workday?.end ?? null;
    const workday = start && end
      ? { start, end, source: input.workday?.source ?? ctx.workday?.source ?? 'tool_input' }
      : null;
    return planWork(input.view, {
      tasks,
      lessons,
      date: input.date,
      now,
      energy,
      workday,
      capacity_minutes: input.capacity_minutes ?? ctx.capacity_minutes ?? null
    });
  }
  if (name === 'check_calendars') {
    const from = dayKey(input.from, now);
    const days = Math.min(14, Math.max(1, Number(input.days) || 3));
    const start = parseDue(from) ?? startOfDay(now);
    const source = input.source || 'both';
    const window = [];
    for (let i = 0; i < days; i += 1) {
      const day = addDays(start, i);
      const key = toDateKey(day);
      const dayTasks = source === 'teaching' ? [] : tasksForDay(tasks, day).map(compact);
      const dayLessons = source === 'life' ? [] : (lessons ?? [])
        .filter(lesson => String(lessonDate(lesson) ?? '') === key)
        .slice(0, 8)
        .map(lesson => ({ id: lesson.id, title: lesson.title, date: key, class_id: lesson.class_id ?? null }));
      window.push({ date: key, tasks: dayTasks, lessons: dayLessons });
    }
    return ok({ from, days, source, window });
  }
  if (name === 'draft_comms') {
    const task = findTask(tasks, input.task_id);
    return ok({
      sent: false,
      note: 'Draft only. Clare cannot send email.',
      draft: formatClareDraft({
        task,
        audience: input.audience,
        intent: input.intent,
        points: input.points
      })
    });
  }
  if (name === 'lookup_au_dates') {
    return lookupAuDates(input);
  }
  if (name === 'fetch_url') {
    const result = await fetchPublicUrl(input.url, fetchImpl);
    if (!result.ok) return result;
    return { ...result, reason: input.reason ?? null };
  }
  if (name === 'lookup_place') {
    const page = await fetchPublicUrl(input.url, fetchImpl);
    if (!page.ok) return page;
    return ok({
      name: input.name ?? page.title,
      url: page.final_url,
      live: page.live,
      title: page.title,
      ...extractPlaceFacts(`${page.title} ${page.text}`),
      excerpt: page.text.slice(0, 800)
    });
  }
  if (name === 'compare_options') {
    const urls = (Array.isArray(input.urls) ? input.urls : []).slice(0, 5);
    if (!urls.length) return deny('missing_urls');
    const options = [];
    for (const url of urls) {
      const page = await fetchPublicUrl(url, fetchImpl);
      options.push(page.ok
        ? { url: page.final_url, live: page.live, title: page.title, excerpt: page.text.slice(0, 500) }
        : { url, live: false, error: page.error });
    }
    return ok({ question: input.question ?? null, options });
  }
  if (name === 'research_topic') {
    const urls = (Array.isArray(input.urls) ? input.urls : []).slice(0, 5);
    const sources = [];
    for (const url of urls) {
      const page = await fetchPublicUrl(url, fetchImpl);
      sources.push(page.ok
        ? { url: page.final_url, live: page.live, title: page.title, excerpt: page.text.slice(0, 900), truncated: page.truncated }
        : { url, live: false, error: page.error });
    }
    return ok({
      topic: input.topic,
      mode: input.mode || (urls.length ? 'sources' : 'official'),
      official: input.mode === 'official' || !urls.length ? OFFICIAL_AU : [],
      sources,
      note: urls.length
        ? 'Cite only what the fetched pages actually say.'
        : 'No URLs supplied. Official AU starting points listed — web_search, then fetch_url the real pages.'
    });
  }
  if (name === 'clare_mutate') {
    return buildClareMutation(input, { tasks, projects, nowIso: () => now.toISOString() });
  }
  return deny('unknown_tool', { name });
}
