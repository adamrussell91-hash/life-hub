/**
 * Clare DeMind workbench — 40 jobs she could not do from Life Hub chat.
 * Reads execute immediately. Writes return { kind: 'propose', proposal }
 * for the existing Confirm card / tasks:task:* blob path.
 */
import { newRecordId, newTaskId, getJSON, setJSON } from './tasks-blobs.mjs';
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
import {
  clarifyDump,
  reclassifyItem,
  inspectProjectHealth,
  inspectActiveProjectsHealth,
  listWaitingItems,
  waitingPatch,
  matchActionsNow,
  composeDaySchedule,
  validateProposedBlocks,
  workdayForDate,
  workWindowsForDate,
  buildAuthoritativeHardBusy,
  normalizeProtectedWindowSpans,
  computeDeadlineRunway,
  createFocusBlock,
  startFocusBlock,
  finishFocusBlock,
  buildShutdown,
  createWeeklyReview,
  runWeeklyReviewStage,
  buildWeeklyPendingChanges,
  WEEKLY_REVIEW_STAGES,
  createProjectPlan,
  updateProjectPlanStage,
  lessonToBusySpan
} from './productivity-os.mjs';
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
  { id: 40, tool: 'parse_dump', job: 'Parse a dump into task proposals; read or update your protocol' },
  { id: 41, tool: 'clarify_dump', job: 'Classify a brain dump into destinations before writing' },
  { id: 42, tool: 'project_health', job: 'Inspect next-action coverage for active projects' },
  { id: 43, tool: 'waiting_review', job: 'List waiting items and propose waiting patches' },
  { id: 44, tool: 'weekly_review', job: 'Run Clare weekly review stages' },
  { id: 45, tool: 'project_plan', job: 'Natural project planning stages' },
  { id: 46, tool: 'context_match', job: 'Match open actions to current constraints' },
  { id: 47, tool: 'compose_schedule', job: 'Compose a day around lessons and protected time' },
  { id: 48, tool: 'focus_block', job: 'Create, start, or finish a focus block' },
  { id: 49, tool: 'shutdown_day', job: 'Build end-of-day shutdown decisions' },
  { id: 50, tool: 'deadline_runway', job: 'Backward-plan from a hard deadline without moving it' }
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
    `Clare workbench — ${CLARE_JOBS.length} jobs you can actually do from this chat. Use the named tool. Do not say you cannot do these.`,
    'Internet research: web_search finds pages; fetch_url opens a specific URL; research_topic cites sources; lookup_au_dates / lookup_place / compare_options for dates, venues, and options.',
    'Prefer create_task / update_task for ordinary capture and edits. Other writes (complete/reschedule/split/trash/move/estimate/tag/waiting-on/research notes/batch/pin/create project) go through clare_mutate. create_task writes immediately (status applied). Other writes wait for Adam to Confirm. Never claim a write landed until the tool returns awaiting_confirm or applied.',
    'Never merge distinct pieces of work into one create_task title or one Confirm card. One card per distinct action. Rambling dumps are multiple cards.',
    'Productivity OS: clarify_dump before capture writes; project_health / waiting_review / context_match / compose_schedule / deadline_runway / focus_block / shutdown_day / weekly_review / project_plan for deterministic planning. Hard deadlines never move via schedule tools.',
    'Weekly review: staged and resumable. Missing next actions stay informational without grounded titles. confirm:true only builds a stored Confirm proposal — never claim saved until /api/chat/confirm succeeds.',
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
      target_date: { type: 'string' },
      review_at: { type: 'string' },
      status: { type: 'string' },
      estimated_duration: { type: 'number' },
      tags: { type: 'array', items: { type: 'string' } },
      waiting_on: { type: 'string' },
      waiting_since: { type: 'string' },
      follow_up_at: { type: 'string' },
      waiting_status: { type: 'string', enum: ['waiting', 'follow_up_due', 'resolved'] },
      contexts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['device', 'place', 'person', 'energy', 'other'] },
            value: { type: 'string' }
          }
        }
      },
      cognitive_load: { type: 'string', enum: ['low', 'medium', 'high'] },
      depth: { type: 'string', enum: ['deep', 'shallow', 'admin'] },
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
    tool('plan_work', 'Plan a day or week: time-block, free slots, collisions, weekly load, energy order, compose (calendar-aware), or schedule_diff. Pass energy, capacity_minutes, workday_start/end, protected_windows, and confirmed_blocks when known. Do not invent standing preferences. Hard deadlines never move.', {
      view: { type: 'string', enum: ['time_block', 'free_slots', 'collisions', 'week_load', 'energy', 'compose', 'schedule_diff'] },
      date: { type: 'string' },
      energy_level: { type: 'string', enum: ['low', 'medium', 'high'] },
      cognitive_load: { type: 'number' },
      capacity_minutes: { type: 'number' },
      workday_start: { type: 'string', description: 'HH:MM when Adam stated a start. Omit to use the labelled fallback.' },
      workday_end: { type: 'string', description: 'HH:MM when Adam stated an end. Omit to use the labelled fallback.' },
      protected_windows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            start: { type: 'number', description: 'Minutes from midnight' },
            end: { type: 'number' },
            title: { type: 'string' }
          }
        }
      },
      confirmed_blocks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            start: { type: 'number' },
            end: { type: 'number' },
            title: { type: 'string' }
          }
        }
      },
      task_ids: { type: 'array', items: { type: 'string' } }
    }, ['view']),
    tool('clarify_dump', 'Classify a brain dump into structured destinations (next_action, project, waiting, calendar, someday, reference, trash) before any write. Reclassify one item when Adam corrects.', {
      text: { type: 'string' },
      reclassify_item_id: { type: 'string' },
      reclassify_destination: {
        type: 'string',
        enum: ['next_action', 'project', 'waiting', 'calendar', 'someday', 'reference', 'trash']
      },
      stack: { type: 'object' }
    }),
    tool('project_health', 'Inspect next-action coverage for one project or all active projects.', {
      project_id: { type: 'string' },
      all_active: { type: 'boolean' }
    }),
    tool('waiting_review', 'List waiting items with age and follow-up needs. Optionally propose a waiting patch (Confirm).', {
      today_key: { type: 'string' },
      action: { type: 'string', enum: ['list', 'follow_up', 'move_follow_up', 'resolved', 'return_to_active'] },
      task_id: { type: 'string' },
      follow_up_at: { type: 'string' },
      waiting_on: { type: 'string' }
    }),
    tool('weekly_review', 'Create or advance Clare weekly review stages. Deterministic capture → calendars → waiting → projects → someday → build → confirm. confirm:true builds a stored Confirm proposal — it does not persist writes until Adam confirms via /api/chat/confirm.', {
      review_id: { type: 'string', description: 'Stable weekly review workflow id. Resume with the same id.' },
      state: { type: 'object', description: 'Optional in-memory state. Prefer review_id so the store is the source of truth.' },
      dump_text: { type: 'string', description: 'Capture-stage brain dump text.' },
      past_notes: { type: 'array', items: { type: 'string' } },
      upcoming_notes: { type: 'array', items: { type: 'string' } },
      today_key: { type: 'string' },
      advance: { type: 'boolean', description: 'Advance one stage when true (default). Set false to attach decisions without advancing.' },
      next_action_titles: {
        type: 'object',
        description: 'Map of project_id → concrete next-action title. Only grounded titles Adam stated or that are clearly evidenced. Never invent placeholders.',
        additionalProperties: { type: 'string' }
      },
      waiting_decisions: {
        type: 'object',
        description: 'Map of task_id → waiting decision. Each value is { action: follow_up|move_follow_up|resolved|return_to_active, follow_up_at?: ISO date }.',
        additionalProperties: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['follow_up', 'move_follow_up', 'resolved', 'return_to_active'] },
            follow_up_at: { type: 'string' }
          },
          required: ['action']
        }
      },
      someday_decisions: {
        type: 'object',
        description: 'Map of task_id → someday decision. Each value is { action: keep|activate|remove, review_at?: ISO date }.',
        additionalProperties: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['keep', 'activate', 'remove'] },
            review_at: { type: 'string' }
          },
          required: ['action']
        }
      },
      selected_changes: {
        type: 'array',
        description: 'Stable pending change ids to include when confirm:true. Omit to use currently selected confirmable rows.',
        items: { type: 'string' }
      },
      confirm: {
        type: 'boolean',
        description: 'When true at the confirm stage, generate a stored Confirm proposal (pending action). Does NOT write tasks/projects yet — Adam must Confirm.'
      },
      finalize: {
        type: 'boolean',
        description: 'Alias of confirm.'
      },
      repropose: {
        type: 'boolean',
        description: 'When already awaiting_confirm, allow rebuilding a proposal.'
      },
      schedule: {
        type: 'object',
        description: 'Optional composed week schedule for the build_week stage.'
      }
    }),
    tool('project_plan', 'Natural project planning: purpose → desired outcome → brainstorm → organise → next action.', {
      project_title: { type: 'string' },
      project_id: { type: 'string' },
      state: { type: 'object' },
      purpose: { type: 'string' },
      constraints: { type: 'string' },
      desired_outcome: { type: 'string' },
      brainstorm: { type: 'array', items: { type: 'string' } },
      organised: { type: 'array', items: { type: 'object' } },
      next_actions: { type: 'array', items: { type: 'string' } },
      milestones: { type: 'array', items: { type: 'string' } },
      advance: { type: 'boolean' }
    }),
    tool('context_match', 'Match open actionable work to current constraints. Does not invent energy.', {
      available_minutes: { type: 'number' },
      energy_level: { type: 'string', enum: ['low', 'medium', 'high'] },
      cognitive_load: { type: 'string', enum: ['low', 'medium', 'high'] },
      device: { type: 'string' },
      place: { type: 'string' },
      person: { type: 'string' },
      deep_work_ok: { type: 'boolean' },
      now_key: { type: 'string' }
    }),
    tool('compose_schedule', 'Compose a day schedule around lessons, events, confirmed blocks, and protected windows. Never moves due_date.', {
      date: { type: 'string' },
      energy_level: { type: 'string', enum: ['low', 'medium', 'high'] },
      workday_start: { type: 'string' },
      workday_end: { type: 'string' },
      task_ids: { type: 'array', items: { type: 'string' } },
      protected_windows: { type: 'array', items: { type: 'object' } },
      confirmed_blocks: { type: 'array', items: { type: 'object' } },
      validate_proposed: { type: 'array', items: { type: 'object' } }
    }),
    tool('focus_block', 'Create, start, or finish a focus block. Returns deterministic focus state / session payloads.', {
      action: { type: 'string', enum: ['create', 'start', 'finish'] },
      state: { type: 'object' },
      outcome: { type: 'string' },
      task_id: { type: 'string' },
      project_id: { type: 'string' },
      work_block_id: { type: 'string' },
      planned_duration_minutes: { type: 'number' },
      finish_condition: { type: 'string' },
      depth: { type: 'string', enum: ['deep', 'shallow', 'admin'] },
      start_time: { type: 'string' },
      result: { type: 'string', enum: ['done', 'partial', 'stopped'] },
      session_id: { type: 'string' }
    }, ['action']),
    tool('shutdown_day', 'Build end-of-day shutdown decisions: loose ends, unresolved today, waiting follow-ups, tomorrow.', {
      today_key: { type: 'string' },
      tomorrow_key: { type: 'string' },
      loose_texts: { type: 'array', items: { type: 'string' } },
      unconfirmed_titles: { type: 'array', items: { type: 'string' } },
      tomorrow_events: { type: 'array', items: { type: 'object' } },
      protected_tomorrow: { type: 'object' }
    }),
    tool('deadline_runway', 'Backward-plan from a hard deadline. Never moves the deadline. Reports clear / tight / impossible.', {
      deadline: { type: 'string' },
      remaining_minutes: { type: 'number' },
      calibration_factor: { type: 'number' },
      already_scheduled_minutes: { type: 'number' },
      available_minutes_until_deadline: { type: 'number' },
      buffer_minutes: { type: 'number' },
      today: { type: 'string' },
      dependencies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            satisfied: { type: 'boolean' }
          }
        }
      }
    }, ['deadline', 'remaining_minutes']),
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

/**
 * Clare’s full workbench on every turn.
 * Intent trimming used to drop research/plan/mutate tools on dump-shaped messages —
 * that made “chat Clare” and “dump Clare” different agents. Adam’s rule: same Clare,
 * full capabilities, everywhere. message/protocolId kept for call-site compatibility.
 */
export function selectClareWorkSchemas(_opts = {}) {
  return clareWorkSchemas();
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

export function statedPlannerInputs(message) {
  const text = String(message ?? '');
  const lower = text.toLowerCase();
  const energyWord = lower.match(/\benergy\s+(?:is\s+(?:really\s+|quite\s+)?)?(low|medium|high)\b/)
    ?? lower.match(/\b(low|medium|high)\s+energy\b/);
  const energy = energyWord ? { level: energyWord[1] } : null;
  const minuteMatch = lower.match(/\b(?:only\s+(?:got\s+|have\s+)?(?:about\s+|around\s+)?)?(\d{1,3})\s*(?:minutes|mins|min)\b/);
  const hourMatch = lower.match(/\b(?:only\s+(?:got\s+|have\s+)?(?:about\s+|around\s+)?)?(\d(?:\.\d+)?)\s*hours?\b/);
  let capacity_minutes = null;
  if (minuteMatch) capacity_minutes = Number(minuteMatch[1]);
  else if (hourMatch) capacity_minutes = Math.round(Number(hourMatch[1]) * 60);
  if (!Number.isFinite(capacity_minutes) || capacity_minutes <= 0) capacity_minutes = null;
  return { energy, capacity_minutes, workday: null };
}

export function planWork(view, {
  tasks = [],
  lessons = [],
  date,
  now = new Date(),
  energy = null,
  workday = null,
  capacity_minutes = null,
  protected_windows = null,
  confirmed_blocks = null,
  task_ids = null,
  planning_profile = null
} = {}) {
  const key = dayKey(date, now);
  const day = parseDue(key) ?? startOfDay(now);
  const dueToday = tasksForDay(tasks, day);
  const overdue = overdueTasks(tasks, day);
  const seen = new Set(dueToday.map(task => task.id));
  const dayTasks = [...overdue.filter(task => !seen.has(task.id)), ...dueToday];
  const dayLessons = (lessons ?? []).filter(lesson => String(lessonDate(lesson) ?? '') === key);

  if (view === 'compose' || view === 'schedule_diff') {
    const idFilter = Array.isArray(task_ids) && task_ids.length
      ? new Set(task_ids.map(String))
      : null;
    const pool = (idFilter
      ? tasks.filter(task => idFilter.has(String(task.id)))
      : dayTasks
    ).filter(task => task.status !== 'done' && task.status !== 'dead');
    const lessonSpans = dayLessons.map(lessonToBusySpan).filter(Boolean);
    const composed = composeDaySchedule({
      date: key,
      tasks: pool.map(task => ({
        id: task.id,
        title: task.title,
        estimated_duration: task.estimated_duration,
        depth: task.depth ?? null,
        cognitive_load: task.cognitive_load ?? null,
        priority: task.priority ?? null,
        due_date: task.due_date ?? null,
        target_date: task.target_date ?? null,
        depends_on: task.depends_on ?? [],
        blocked: Boolean(task.blocked_since || task.waiting_on)
      })),
      lessons: lessonSpans,
      protected_windows: Array.isArray(protected_windows) ? protected_windows.map(span => {
        if (Number.isFinite(Number(span.start)) && Number.isFinite(Number(span.end))) {
          return {
            start: Number(span.start),
            end: Number(span.end),
            title: span.title ?? 'Protected',
            kind: 'protected'
          };
        }
        const start = minutesOf(span.start);
        const end = minutesOf(span.end);
        if (start == null || end == null) return null;
        return {
          start,
          end,
          title: span.title ?? span.label ?? 'Protected',
          kind: 'protected'
        };
      }).filter(Boolean) : [],
      confirmed_blocks: Array.isArray(confirmed_blocks) ? confirmed_blocks.map(span => {
        if (Number.isFinite(Number(span.start)) && Number.isFinite(Number(span.end))) {
          return {
            start: Number(span.start),
            end: Number(span.end),
            title: span.title ?? 'Confirmed',
            kind: 'locked'
          };
        }
        const start = minutesOf(span.start_time || span.start);
        if (start == null) return null;
        return {
          start,
          end: start + (Number(span.duration_minutes) || 60),
          title: span.title ?? 'Confirmed',
          kind: 'locked'
        };
      }).filter(Boolean) : [],
      workday: workday?.start && workday?.end
        ? { start: workday.start, end: workday.end, source: workday.source || 'tool_input' }
        : null,
      energy: energy?.level ?? null,
      planning_profile
    });
    return ok({
      view,
      ...composed,
      note: view === 'schedule_diff'
        ? 'Proposed ghost blocks vs hard busy. Confirm before writing work blocks. Deadlines unchanged.'
        : 'Compose uses hard constraints first. Deadlines unchanged.'
    });
  }

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
  return lessonToBusySpan(lesson);
}

export function workflowStateKey(id) {
  return `workflow_state/${id}`;
}

export async function loadWorkflowState(store, id) {
  if (!store || !id) return null;
  try {
    const raw = await getJSON(store, workflowStateKey(id));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function saveWorkflowState(store, id, state) {
  if (!store || !id || !state) return state;
  const next = { ...state, id, updated_at: new Date().toISOString() };
  await setJSON(store, workflowStateKey(id), next);
  return next;
}

/** Mark weekly review awaiting_confirm only after a durable pending action id exists. */
export async function markWeeklyReviewAwaitingConfirm(store, reviewId, { pendingActionId, stamp } = {}) {
  const state = await loadWorkflowState(store, reviewId);
  if (!state) return null;
  return saveWorkflowState(store, reviewId, {
    ...state,
    status: 'awaiting_confirm',
    pending_action_id: pendingActionId ?? state.pending_action_id ?? null,
    pending_action_status: 'pending',
    updated_at: stamp || new Date().toISOString()
  });
}

/**
 * Record that the Weekly Review pending action executed its writes.
 * Leaves status awaiting_confirm until markWeeklyReviewComplete succeeds.
 */
export async function markWeeklyReviewPendingConsumed(store, reviewId, { pendingActionId, stamp } = {}) {
  const state = await loadWorkflowState(store, reviewId);
  if (!state) return null;
  return saveWorkflowState(store, reviewId, {
    ...state,
    status: state.status === 'complete' ? 'complete' : 'awaiting_confirm',
    pending_action_id: pendingActionId ?? state.pending_action_id ?? null,
    pending_action_status: 'consumed',
    pending_action_consumed_at: stamp || new Date().toISOString(),
    updated_at: stamp || new Date().toISOString()
  });
}

/** Complete weekly review only after Confirm writes succeeded and the pending action was consumed. */
export async function markWeeklyReviewComplete(store, reviewId, { stamp } = {}) {
  const state = await loadWorkflowState(store, reviewId);
  if (!state) return null;
  const completedAt = stamp || new Date().toISOString();
  return saveWorkflowState(store, reviewId, {
    ...state,
    status: 'complete',
    completed_at: completedAt,
    pending_action_id: null,
    pending_action_status: 'consumed',
    updated_at: completedAt
  });
}

/**
 * If workflow is awaiting_confirm but its pending action is positively marked consumed,
 * heal to complete. Missing pending alone is NOT evidence of completion.
 */
export async function reconcileWeeklyReviewIfPendingConsumed(store, reviewId) {
  const state = await loadWorkflowState(store, reviewId);
  if (!state) return null;
  if (state.status !== 'awaiting_confirm') return state;
  if (state.pending_action_status !== 'consumed') return state;
  return markWeeklyReviewComplete(store, reviewId);
}

/**
 * Pre-queue Schedule Diff preview. Not active — ghosts require awaiting_confirm + durable id.
 * Compose persists this before proposeOsAction; queue success promotes to awaiting_confirm.
 */
export async function markScheduleDiffPreparing(store, {
  stamp,
  scheduleContext = null,
  proposed = null,
  writes = null,
  date = null
} = {}) {
  if (!store) return null;
  const updatedAt = stamp || new Date().toISOString();
  return saveWorkflowState(store, 'schedule_diff:current', {
    id: 'schedule_diff:current',
    kind: 'schedule_diff',
    ...(date ? { date } : {}),
    ...(Array.isArray(proposed) ? { proposed } : { proposed: [] }),
    ...(Array.isArray(writes) ? { writes } : {}),
    status: 'preparing',
    pending_action_id: null,
    pending_action_status: null,
    ...(scheduleContext && typeof scheduleContext === 'object' ? { schedule_context: scheduleContext } : {}),
    updated_at: updatedAt
  });
}

/** Mark schedule_diff:current awaiting_confirm with the durable pending action id. */
export async function markScheduleDiffAwaitingConfirm(store, {
  pendingActionId,
  stamp,
  scheduleContext = null,
  proposed = null,
  writes = null,
  date = null
} = {}) {
  if (!store || !pendingActionId) return null;
  const state = (await loadWorkflowState(store, 'schedule_diff:current')) || {
    id: 'schedule_diff:current',
    kind: 'schedule_diff'
  };
  const updatedAt = stamp || new Date().toISOString();
  return saveWorkflowState(store, 'schedule_diff:current', {
    ...state,
    id: 'schedule_diff:current',
    kind: 'schedule_diff',
    ...(date ? { date } : {}),
    ...(Array.isArray(proposed) ? { proposed } : {}),
    ...(Array.isArray(writes) ? { writes } : {}),
    status: 'awaiting_confirm',
    pending_action_id: pendingActionId,
    pending_action_status: 'pending',
    ...(scheduleContext && typeof scheduleContext === 'object' ? { schedule_context: scheduleContext } : {}),
    updated_at: updatedAt
  });
}

/**
 * Stamp positive Confirm consume evidence without claiming terminal confirmed yet.
 * Identity guard: never stamp a newer workflow bound to a different pending id.
 */
export async function markScheduleDiffPendingConsumed(store, {
  pendingActionId,
  stamp,
  selectedWritePaths = null
} = {}) {
  if (!store || !pendingActionId) return null;
  const state = await loadWorkflowState(store, 'schedule_diff:current');
  if (!state) return null;
  if (state.pending_action_id !== pendingActionId) return state;
  if (state.status === 'confirmed') return state;
  const consumedAt = stamp || new Date().toISOString();
  return saveWorkflowState(store, 'schedule_diff:current', {
    ...state,
    status: state.status === 'discarded' ? state.status : 'awaiting_confirm',
    pending_action_id: pendingActionId,
    pending_action_status: 'consumed',
    pending_action_consumed_at: consumedAt,
    ...(Array.isArray(selectedWritePaths) ? { selected_write_paths: selectedWritePaths } : {}),
    updated_at: consumedAt
  });
}

/**
 * Confirm terminal reconciliation — only when pending_action_id matches.
 * Identity guard: never terminate a newer workflow bound to a different pending id.
 */
export async function markScheduleDiffConfirmed(store, {
  pendingActionId,
  stamp,
  selectedWritePaths = null
} = {}) {
  if (!store || !pendingActionId) return null;
  const state = await loadWorkflowState(store, 'schedule_diff:current');
  if (!state) return null;
  if (state.pending_action_id !== pendingActionId) return state;
  const confirmedAt = stamp || new Date().toISOString();
  return saveWorkflowState(store, 'schedule_diff:current', {
    ...state,
    status: 'confirmed',
    pending_action_id: pendingActionId,
    pending_action_status: 'consumed',
    confirmed_at: confirmedAt,
    ...(Array.isArray(selectedWritePaths) ? { selected_write_paths: selectedWritePaths } : {}),
    proposed: [],
    updated_at: confirmedAt
  });
}

/**
 * Heal awaiting_confirm → confirmed only with positive consume evidence + identity match.
 * Never infers terminal state from a missing pending id alone.
 */
export async function reconcileScheduleDiffIfPendingConsumed(store, {
  pendingActionId,
  stamp,
  selectedWritePaths = null,
  queueEvidenceConsumed = false
} = {}) {
  if (!store || !pendingActionId) return null;
  const state = await loadWorkflowState(store, 'schedule_diff:current');
  if (!state) return null;
  if (state.pending_action_id !== pendingActionId) return state;
  if (state.status === 'confirmed') return state;
  const positive =
    state.pending_action_status === 'consumed'
    || queueEvidenceConsumed === true;
  if (!positive) return state;
  return markScheduleDiffConfirmed(store, {
    pendingActionId,
    stamp,
    selectedWritePaths: selectedWritePaths ?? state.selected_write_paths ?? null
  });
}

/**
 * Stamp positive dismiss evidence without claiming terminal discarded yet.
 */
export async function markScheduleDiffPendingDismissed(store, { pendingActionId, stamp } = {}) {
  if (!store || !pendingActionId) return null;
  const state = await loadWorkflowState(store, 'schedule_diff:current');
  if (!state) return null;
  if (state.pending_action_id !== pendingActionId) return state;
  if (state.status === 'discarded' || state.status === 'confirmed') return state;
  const dismissedAt = stamp || new Date().toISOString();
  return saveWorkflowState(store, 'schedule_diff:current', {
    ...state,
    status: 'awaiting_confirm',
    pending_action_id: pendingActionId,
    pending_action_status: 'dismissed',
    pending_action_dismissed_at: dismissedAt,
    updated_at: dismissedAt
  });
}

/** Discard terminal reconciliation — identity guard on pending_action_id. */
export async function markScheduleDiffDiscarded(store, { pendingActionId, stamp } = {}) {
  if (!store || !pendingActionId) return null;
  const state = await loadWorkflowState(store, 'schedule_diff:current');
  if (!state) return null;
  if (state.pending_action_id !== pendingActionId) return state;
  const discardedAt = stamp || new Date().toISOString();
  return saveWorkflowState(store, 'schedule_diff:current', {
    ...state,
    status: 'discarded',
    pending_action_id: pendingActionId,
    pending_action_status: 'dismissed',
    discarded_at: discardedAt,
    proposed: [],
    updated_at: discardedAt
  });
}

/**
 * Heal to discarded only with positive dismiss evidence + identity match.
 * Queue tombstone (queueEvidenceDismissed) is primary recovery when workflow stamp never landed.
 */
export async function reconcileScheduleDiffIfPendingDismissed(store, {
  pendingActionId,
  stamp,
  queueEvidenceDismissed = false
} = {}) {
  if (!store || !pendingActionId) return null;
  const state = await loadWorkflowState(store, 'schedule_diff:current');
  if (!state) return null;
  if (state.pending_action_id !== pendingActionId) return state;
  if (state.status === 'discarded') return state;
  const positive =
    state.pending_action_status === 'dismissed'
    || queueEvidenceDismissed === true;
  if (!positive) return state;
  return markScheduleDiffDiscarded(store, { pendingActionId, stamp });
}

/**
 * Active Schedule Diff ghosts require awaiting_confirm + durable pending id + proposed[].
 * preparing / terminal / missing id → no ghosts.
 */
export function scheduleDiffActiveProposed(state) {
  if (!state || typeof state !== 'object') return [];
  if (state.status !== 'awaiting_confirm') return [];
  const id = typeof state.pending_action_id === 'string' ? state.pending_action_id.trim() : '';
  if (!id) return [];
  return Array.isArray(state.proposed) && state.proposed.length ? state.proposed : [];
}

function calendarNotesFromCtx({ lessons = [], workBlocks = [], tasks = [], todayKey, past = false }) {
  const day = parseDue(todayKey);
  if (!day) return [];
  const notes = [];
  for (let i = 1; i <= 7; i += 1) {
    const d = addDays(day, past ? -i : i);
    const key = toDateKey(d);
    const dayLessons = (lessons ?? []).filter(l => String(lessonDate(l) ?? '') === key);
    const dayBlocks = (workBlocks ?? []).filter(b => b.date === key && b.status !== 'cancelled');
    const dayTasks = tasksForDay(tasks, d);
    if (!dayLessons.length && !dayBlocks.length && !dayTasks.length) continue;
    const bits = [
      key,
      dayLessons.length ? `${dayLessons.length} lesson(s)` : null,
      dayBlocks.length ? `${dayBlocks.length} work block(s)` : null,
      dayTasks.length ? `${dayTasks.length} task(s)` : null
    ].filter(Boolean);
    notes.push(bits.join(' · '));
  }
  return notes;
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
  if (typeof input.bucket === 'string') base.bucket = input.bucket;
  if (typeof input.review_at === 'string' || input.review_at === null) base.review_at = input.review_at;
  if (Array.isArray(input.tags)) {
    base.tags = [...new Set([...(base.tags ?? []), ...input.tags.map(tag => String(tag).trim()).filter(Boolean)])];
  }
  if (typeof input.waiting_on === 'string') base.waiting_on = input.waiting_on.trim();
  else if (input.waiting_on === null) base.waiting_on = null;
  if (typeof input.waiting_since === 'string' || input.waiting_since === null) {
    base.waiting_since = input.waiting_since;
  }
  if (typeof input.follow_up_at === 'string' || input.follow_up_at === null) {
    base.follow_up_at = input.follow_up_at;
  }
  if (typeof input.waiting_status === 'string' || input.waiting_status === null) {
    base.waiting_status = input.waiting_status;
  }
  if (typeof input.target_date === 'string' || input.target_date === null) {
    base.target_date = input.target_date;
  }
  if (typeof input.review_at === 'string' || input.review_at === null) {
    base.review_at = input.review_at;
  }
  if (Array.isArray(input.contexts)) base.contexts = input.contexts;
  if (typeof input.cognitive_load === 'string') base.cognitive_load = input.cognitive_load;
  if (typeof input.depth === 'string') base.depth = input.depth;
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
  if (op === 'set_waiting_on') {
    if (typeof patch.waiting_on === 'string' && patch.waiting_on.trim()) {
      if (!patch.waiting_since) patch.waiting_since = stamp;
      if (!patch.waiting_status) patch.waiting_status = 'waiting';
    }
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



function selectWeeklyPendingChanges(pending, input) {
  const selectedIds = new Set(
    (Array.isArray(input.selected_changes) ? input.selected_changes : [])
      .map((item) => (typeof item === 'string' ? item : item?.id))
      .filter(Boolean)
  );
  return (pending ?? []).filter((change) => {
    if (!change || change.confirmable === false || change.kind === 'informational') return false;
    if (selectedIds.size) return selectedIds.has(change.id);
    return change.selected !== false;
  });
}

function writesFromWeeklyPendingChanges(selected, state, tasks, stamp) {
  const writes = [];
  const captureIds = new Set(selected.filter((c) => c.kind === 'capture').map((c) => c.id));
  if (captureIds.size) {
    const captureItems = (state.capture?.items ?? []).filter((item) => captureIds.has(item.id));
    writes.push(...writesFromClarifyItems(captureItems, stamp));
  }

  for (const change of selected) {
    if (change.kind === 'next_action') {
      const title = String(change.title ?? '').trim();
      const projectId = String(change.project_id ?? '').trim();
      if (!title || !projectId) {
        return { ok: false, error: 'invalid_next_action', detail: change.id };
      }
      const task = buildTaskRecord({ title, project_id: projectId, bucket: 'active' }, null, stamp);
      writes.push(writeEntry(
        `tasks:task:${task.id}`,
        'create',
        task,
        `weekly review next action — ${title}`
      ));
      continue;
    }
    if (change.kind === 'waiting') {
      const existing = findTask(tasks, change.task_id);
      if (!existing) return { ok: false, error: 'waiting_task_not_found', detail: change.task_id };
      const patch = waitingPatch(change.action, {
        follow_up_at: change.follow_up_at,
        nowIso: stamp
      });
      if (!patch || !Object.keys(patch).length) {
        return { ok: false, error: 'invalid_waiting_action', detail: change.action };
      }
      const record = buildTaskRecord(patch, existing, stamp);
      writes.push(writeEntry(
        `tasks:task:${record.id}`,
        'overwrite',
        record,
        `weekly review waiting ${change.action} — ${existing.title}`
      ));
      continue;
    }
    if (change.kind === 'someday') {
      const existing = findTask(tasks, change.task_id);
      if (!existing) return { ok: false, error: 'someday_task_not_found', detail: change.task_id };
      let patch;
      if (change.action === 'keep') {
        patch = { review_at: change.review_at || stamp.slice(0, 10) };
      } else if (change.action === 'activate') {
        patch = { bucket: 'active', review_at: null };
      } else if (change.action === 'remove') {
        patch = { bucket: 'trash' };
      } else {
        return { ok: false, error: 'invalid_someday_action', detail: change.action };
      }
      const record = buildTaskRecord(patch, existing, stamp);
      writes.push(writeEntry(
        `tasks:task:${record.id}`,
        'overwrite',
        record,
        `weekly review someday ${change.action} — ${existing.title}`
      ));
      continue;
    }
  }

  const scheduleIds = new Set(selected.filter((c) => c.kind === 'schedule_block').map((c) => c.id));
  if (scheduleIds.size) {
    const proposed = (state.schedule?.proposed ?? state.schedule?.blocks ?? []).filter((block, index) => {
      const id = block.write_path || block.id || `schedule:${index}`;
      return scheduleIds.has(id) && block.selected !== false;
    });
    writes.push(...writesFromScheduleProposed(proposed, stamp).writes);
  }

  return { ok: true, writes };
}

function writesFromClarifyItems(items, stamp) {
  const writes = [];
  for (const item of items ?? []) {
    if (!item || item.selected === false) continue;
    const destination = item.destination;
    if (destination === 'trash' || destination === 'reference') continue;
    const title = String(item.text ?? '').trim();
    if (!title) continue;
    if (destination === 'project') {
      const nextTitle = String(item.project_next_action ?? '').trim();
      // No fabricated next-action placeholders — skip durable write until grounded.
      if (!nextTitle) continue;
      const projectId = newRecordId('proj');
      const project = {
        schema_version: 1,
        id: projectId,
        title,
        status: 'active',
        created_at: stamp,
        updated_at: stamp
      };
      writes.push(writeEntry(
        `tasks:project:${projectId}`,
        'create',
        project,
        `weekly capture project — ${title}`
      ));
      const task = buildTaskRecord({
        title: nextTitle,
        project_id: projectId,
        bucket: 'active'
      }, null, stamp);
      writes.push(writeEntry(
        `tasks:task:${task.id}`,
        'create',
        task,
        `weekly capture next action — ${nextTitle}`
      ));
      continue;
    }
    const patch = { title, bucket: destination === 'someday' ? 'someday' : 'active' };
    if (destination === 'waiting') {
      const waitingOn = String(item.waiting_on ?? '').trim();
      // No durable waiting_on = 'Unknown' stand-in — remain informational until known.
      if (!waitingOn) continue;
      patch.waiting_on = waitingOn;
      patch.waiting_status = 'waiting';
      patch.waiting_since = stamp;
    }
    if (destination === 'calendar' && item.calendar_date) {
      patch.due_date = item.calendar_date;
    }
    const task = buildTaskRecord(patch, null, stamp);
    writes.push(writeEntry(
      `tasks:task:${task.id}`,
      'create',
      task,
      `weekly capture → ${destination}: ${title}`
    ));
  }
  return writes;
}

function writesFromScheduleProposed(proposed, stamp) {
  const writes = [];
  const blocks = [];
  for (const block of proposed ?? []) {
    if (!block || block.selected === false) continue;
    const id = newRecordId('wblock');
    const record = {
      schema_version: 1,
      id,
      task_id: block.task_id ?? null,
      project_id: block.project_id ?? null,
      title: block.title || 'Planned work',
      date: block.date,
      start_time: block.start_time || block.start || '09:00',
      duration_minutes: Number(block.duration_minutes) || 30,
      depth: block.depth === 'deep' ? 'deep' : block.depth === 'admin' ? 'admin' : 'shallow',
      status: 'proposed',
      source: 'clare',
      locked: false,
      created_at: stamp,
      updated_at: stamp
    };
    const path = `tasks:work_block:${id}`;
    writes.push(writeEntry(path, 'create', record, `schedule ${record.date} ${record.start_time} · ${record.title}`));
    blocks.push({ ...block, ...record, id: path, write_path: path, selected: true });
  }
  return { writes, blocks };
}

export async function executeClareWork(name, input = {}, ctx = {}) {
  const now = ctx.now ?? new Date();
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const tasks = ctx.tasks ?? [];
  const projects = ctx.projects ?? [];
  const lessons = ctx.lessons ?? [];
  const workBlocks = ctx.workBlocks ?? ctx.work_blocks ?? [];
  const planningProfile = ctx.planning_profile ?? null;
  const tasksStore = ctx.tasksStore ?? null;

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
      capacity_minutes: input.capacity_minutes ?? ctx.capacity_minutes ?? null,
      protected_windows: input.protected_windows ?? null,
      confirmed_blocks: input.confirmed_blocks ?? null,
      task_ids: input.task_ids ?? null,
      planning_profile: planningProfile
    });
  }
  if (name === 'clarify_dump') {
    if (input.reclassify_item_id && input.reclassify_destination && input.stack) {
      return ok(reclassifyItem(input.stack, input.reclassify_item_id, input.reclassify_destination));
    }
    const text = String(input.text ?? '').trim();
    if (!text) return deny('missing_text');
    return ok(clarifyDump(text));
  }
  if (name === 'project_health') {
    if (input.all_active || !input.project_id) {
      return ok({
        results: inspectActiveProjectsHealth(projects, tasks, now.toISOString())
      });
    }
    const project = findProject(projects, input.project_id);
    if (!project) return deny('project_not_found', { project_id: input.project_id });
    return ok(inspectProjectHealth(project, tasks, now.toISOString()));
  }
  if (name === 'waiting_review') {
    const todayKey = input.today_key || toHubDateKey(now) || now.toISOString().slice(0, 10);
    const action = input.action || 'list';
    if (action === 'list') {
      return ok({ today_key: todayKey, items: listWaitingItems(tasks, todayKey) });
    }
    const existing = findTask(tasks, input.task_id);
    if (!existing) return deny('task_not_found', { task_id: input.task_id ?? null });
    const patch = waitingPatch(action, {
      follow_up_at: input.follow_up_at,
      waiting_on: input.waiting_on,
      nowIso: now.toISOString()
    });
    if (typeof input.waiting_on === 'string') patch.waiting_on = input.waiting_on.trim();
    const record = buildTaskRecord(patch, existing, now.toISOString());
    return propose(`Waiting ${action}: ${existing.title}`, [
      writeEntry(`tasks:task:${record.id}`, 'overwrite', record, `waiting ${action} — ${existing.title}`)
    ]);
  }
  if (name === 'weekly_review') {
    const reviewId = String(input.review_id || 'weekly_review').trim() || 'weekly_review';
    let state = input.state && typeof input.state === 'object'
      ? input.state
      : (await loadWorkflowState(tasksStore, reviewId)) || createWeeklyReview(reviewId);
    if (!state.id) state = { ...state, id: reviewId };
    // Heal stranded awaiting_confirm only when pending_action_status is positively consumed.
    if (tasksStore && state.status === 'awaiting_confirm' && state.pending_action_status === 'consumed') {
      state = (await reconcileWeeklyReviewIfPendingConsumed(tasksStore, reviewId)) || state;
    }
    if (state.status === 'complete') {
      return ok({
        stages: WEEKLY_REVIEW_STAGES,
        state,
        workflow_state_key: workflowStateKey(reviewId),
        already_complete: true
      });
    }
    const todayKey = input.today_key || toHubDateKey(now) || now.toISOString().slice(0, 10);

    // Decisions must land in state before any persist so a crash/reload keeps them.
    state = {
      ...state,
      next_action_titles: {
        ...(state.next_action_titles && typeof state.next_action_titles === 'object' ? state.next_action_titles : {}),
        ...(input.next_action_titles && typeof input.next_action_titles === 'object' ? input.next_action_titles : {})
      },
      waiting_decisions: {
        ...(state.waiting_decisions && typeof state.waiting_decisions === 'object' ? state.waiting_decisions : {}),
        ...(input.waiting_decisions && typeof input.waiting_decisions === 'object' ? input.waiting_decisions : {})
      },
      someday_decisions: {
        ...(state.someday_decisions && typeof state.someday_decisions === 'object' ? state.someday_decisions : {}),
        ...(input.someday_decisions && typeof input.someday_decisions === 'object' ? input.someday_decisions : {})
      }
    };

    if (input.advance !== false) {
      let schedule = input.schedule ?? null;
      if (state.current_stage === 'build_week' && !schedule) {
        const composed = planWork('compose', {
          tasks,
          lessons,
          date: todayKey,
          now,
          planning_profile: planningProfile,
          confirmed_blocks: workBlocks.filter(b => b.status === 'confirmed' || b.status === 'in_progress')
        });
        schedule = composed;
      }
      const stageInput = {
        dump_text: input.dump_text,
        next_action_titles: state.next_action_titles,
        waiting_decisions: state.waiting_decisions,
        someday_decisions: state.someday_decisions,
        past_notes: input.past_notes
          ?? (state.current_stage === 'past_calendar'
            ? calendarNotesFromCtx({ lessons, workBlocks, tasks, todayKey, past: true })
            : undefined),
        upcoming_notes: input.upcoming_notes
          ?? (state.current_stage === 'upcoming_calendar'
            ? calendarNotesFromCtx({ lessons, workBlocks, tasks, todayKey, past: false })
            : undefined),
        tasks,
        projects,
        today_key: todayKey,
        schedule
      };
      state = runWeeklyReviewStage(state, stageInput);
    }

    if ((!state.pending_changes || !state.pending_changes.length) && state.current_stage === 'confirm') {
      state = { ...state, pending_changes: buildWeeklyPendingChanges(state) };
    } else if (state.current_stage === 'confirm') {
      // Rebuild when decisions/titles arrived so informational rows can become confirmable.
      state = { ...state, pending_changes: buildWeeklyPendingChanges(state) };
    }

    // Persist after decisions + pending_changes are merged (never save then mutate).
    state = await saveWorkflowState(tasksStore, reviewId, state);

    const finalize = Boolean(input.confirm || input.finalize);
    if (finalize && state.current_stage === 'confirm') {
      if (state.status === 'awaiting_confirm' && !input.repropose) {
        return ok({
          stages: WEEKLY_REVIEW_STAGES,
          state,
          workflow_state_key: workflowStateKey(reviewId),
          already_awaiting_confirm: true
        });
      }
      const stamp = now.toISOString();
      const selected = selectWeeklyPendingChanges(state.pending_changes, input);
      const invalid = selected.find((c) => c.kind === 'next_action' && !String(c.title ?? '').trim());
      if (invalid) {
        return deny('invalid_weekly_pending_change', { id: invalid.id, reason: 'next_action_missing_title' });
      }
      const built = writesFromWeeklyPendingChanges(selected, state, tasks, stamp);
      if (!built.ok) return deny(built.error, { detail: built.detail ?? null });
      const writes = built.writes;
      if (!writes.length) {
        return deny('no_selected_weekly_changes');
      }
      // Do NOT set awaiting_confirm here. That status means a durable pending action
      // id exists — chat sets it only after proposeOsAction queue persistence succeeds.
      state = await saveWorkflowState(tasksStore, reviewId, {
        ...state,
        pending_changes: selected,
        status: 'in_progress',
        pending_action_id: null,
        updated_at: stamp
      });
      const proposal = propose(
        `Weekly review confirm (${writes.length} change${writes.length === 1 ? '' : 's'})`,
        writes,
        ['confirm_card', 'tasks_hub', 'weekly_review']
      );
      return {
        ...proposal,
        stages: WEEKLY_REVIEW_STAGES,
        state,
        workflow_state_key: workflowStateKey(reviewId),
        workflow_kind: 'weekly_review',
        workflow_id: reviewId
      };
    }

    return ok({ stages: WEEKLY_REVIEW_STAGES, state, workflow_state_key: workflowStateKey(reviewId) });
  }

  if (name === 'project_plan') {
    const projectId = input.project_id ? String(input.project_id).trim() : '';
    const stateId = projectId ? `project_plan:${projectId}` : 'project_plan';
    let state = input.state && typeof input.state === 'object'
      ? input.state
      : await loadWorkflowState(tasksStore, stateId);
    if (!state) {
      const title = String(input.project_title ?? '').trim();
      if (!title) return deny('missing_project_title');
      state = createProjectPlan({
        project_title: title,
        project_id: input.project_id ?? null,
        purpose: input.purpose,
        desired_outcome: input.desired_outcome
      });
    }
    const patch = {};
    for (const key of ['purpose', 'constraints', 'desired_outcome', 'brainstorm', 'organised', 'next_actions', 'milestones']) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    state = updateProjectPlanStage(state, patch, Boolean(input.advance));
    state = await saveWorkflowState(tasksStore, stateId, state);

    const finalize = Boolean(input.confirm || input.finalize);
    const onNext = state.current_stage === 'next_action';
    const actions = Array.isArray(state.next_actions) ? state.next_actions.filter(Boolean) : [];
    if (finalize && onNext) {
      const stamp = now.toISOString();
      const writes = [];
      let projectId = state.project_id ? String(state.project_id) : '';
      const existing = projectId ? findProject(projects, projectId) : null;
      if (!existing) {
        projectId = newRecordId('proj');
        const project = {
          schema_version: 1,
          id: projectId,
          title: state.project_title || 'Untitled project',
          status: 'active',
          purpose: state.purpose || '',
          desired_outcome: state.desired_outcome || '',
          notes: Array.isArray(state.brainstorm) ? state.brainstorm.join('\n') : '',
          created_at: stamp,
          updated_at: stamp
        };
        writes.push(writeEntry(
          `tasks:project:${projectId}`,
          'create',
          project,
          `create project — ${project.title}`
        ));
      } else {
        const project = {
          ...existing,
          purpose: state.purpose || existing.purpose || '',
          desired_outcome: state.desired_outcome || existing.desired_outcome || '',
          updated_at: stamp
        };
        writes.push(writeEntry(
          `tasks:project:${projectId}`,
          'append',
          project,
          `update project plan — ${project.title}`
        ));
      }
      for (const action of actions) {
        const title = typeof action === 'string' ? action.trim() : String(action?.title ?? '').trim();
        if (!title) continue;
        const task = buildTaskRecord({
          title,
          project_id: projectId,
          bucket: 'active'
        }, null, stamp);
        writes.push(writeEntry(
          `tasks:task:${task.id}`,
          'create',
          task,
          `next action — ${title}`
        ));
      }
      if (writes.length) {
        const proposal = propose(
          `Confirm project plan: ${state.project_title || projectId}`,
          writes,
          ['confirm_card', 'tasks_hub', 'project_plan']
        );
        return { ...proposal, state, workflow_state_key: workflowStateKey(stateId) };
      }
    }

    return ok({ state, workflow_state_key: workflowStateKey(stateId) });
  }
  if (name === 'context_match') {
    return ok(matchActionsNow(tasks, {
      available_minutes: input.available_minutes,
      energy_level: input.energy_level,
      cognitive_load: input.cognitive_load,
      device: input.device,
      place: input.place,
      person: input.person,
      deep_work_ok: input.deep_work_ok,
      now_key: input.now_key || toHubDateKey(now) || now.toISOString().slice(0, 10)
    }));
  }
  if (name === 'compose_schedule') {
    const dateKey = dayKey(input.date, now);
    const explicitWorkday = input.workday_start && input.workday_end
      ? { start: input.workday_start, end: input.workday_end, source: 'tool_input' }
      : null;
    const effectiveWorkday = workdayForDate(dateKey, planningProfile, explicitWorkday);
    const effectiveWindows = workWindowsForDate(dateKey, planningProfile);
    const authoritativeBlocks = Array.isArray(input.confirmed_blocks)
      ? input.confirmed_blocks
      : workBlocks.filter(b => b.status === 'confirmed' || b.status === 'in_progress');
    const lifeEvents = ctx.lifeEvents ?? ctx.events ?? [];
    const explicitProtected = normalizeProtectedWindowSpans(input.protected_windows);
    const hardBusy = buildAuthoritativeHardBusy({
      date: dateKey,
      lessons: lessons ?? [],
      workBlocks: authoritativeBlocks,
      planningProfile,
      extraProtectedWindows: explicitProtected,
      events: lifeEvents
    });

    if (Array.isArray(input.validate_proposed) && input.validate_proposed.length) {
      return ok(validateProposedBlocks(input.validate_proposed, hardBusy, effectiveWorkday));
    }
    const composed = planWork('compose', {
      tasks,
      lessons,
      date: input.date,
      now,
      energy: input.energy_level ? { level: input.energy_level } : null,
      workday: effectiveWorkday,
      protected_windows: hardBusy.filter((span) =>
        span.kind === 'protected'
        || span.kind === 'outside_work_window'
        || span.kind === 'life_event'
      ),
      confirmed_blocks: authoritativeBlocks,
      task_ids: input.task_ids,
      planning_profile: planningProfile
    });
    const scheduleContext = {
      date: dateKey,
      workday: composed?.workday ?? effectiveWorkday,
      work_windows: effectiveWindows,
      protected_windows: explicitProtected,
      hardBusy
    };
    const rawProposed = Array.isArray(composed?.proposed) ? composed.proposed : [];
    const selected = rawProposed.filter(block => block && block.selected !== false);
    if (!selected.length) {
      return {
        ...composed,
        hardBusy,
        workday: composed?.workday ?? effectiveWorkday,
        work_windows: effectiveWindows,
        schedule_context: scheduleContext,
        workflow_kind: 'schedule_diff',
        workflow_id: 'schedule_diff:current'
      };
    }

    const stamp = now.toISOString();
    const writes = [];
    const proposed = [];
    for (const block of selected) {
      const id = newRecordId('wblock');
      const record = {
        schema_version: 1,
        id,
        task_id: block.task_id ?? null,
        project_id: block.project_id ?? null,
        title: block.title || 'Planned work',
        date: block.date || dateKey,
        start_time: block.start_time || block.start || '09:00',
        duration_minutes: Number(block.duration_minutes) || 30,
        depth: block.depth === 'deep' ? 'deep' : block.depth === 'admin' ? 'admin' : 'shallow',
        status: 'proposed',
        source: 'clare',
        locked: false,
        created_at: stamp,
        updated_at: stamp
      };
      const path = `tasks:work_block:${id}`;
      writes.push(writeEntry(
        path,
        'create',
        record,
        `schedule ${record.date} ${record.start_time} · ${record.title}`
      ));
      // Card Confirm Selected uses item.id as accept path.
      proposed.push({
        ...block,
        ...record,
        id: path,
        write_path: path,
        selected: true
      });
    }

    const proposal = propose(
      `Schedule ${writes.length} work block${writes.length === 1 ? '' : 's'}`,
      writes,
      ['confirm_card', 'tasks_hub', 'schedule_diff', 'calendar_ghost']
    );

    // Pre-queue preparing state — not active until chat stamps awaiting_confirm + real pending id.
    await markScheduleDiffPreparing(tasksStore, {
      stamp,
      date: dateKey,
      proposed,
      writes: writes.map(w => ({ path: w.path, diff: w.diff })),
      scheduleContext
    });

    return {
      ...proposal,
      ...composed,
      proposed,
      hardBusy,
      workday: composed?.workday ?? effectiveWorkday,
      work_windows: effectiveWindows,
      schedule_context: scheduleContext,
      workflow_kind: 'schedule_diff',
      workflow_id: 'schedule_diff:current',
      note: 'Ghost blocks only until Confirm. Deadlines unchanged.'
    };
  }
  if (name === 'focus_block') {
    const action = input.action || 'create';
    if (action === 'create') {
      const outcome = String(input.outcome ?? '').trim();
      if (!outcome) return deny('missing_outcome');
      const state = createFocusBlock({
        outcome,
        task_id: input.task_id ?? null,
        project_id: input.project_id ?? null,
        work_block_id: input.work_block_id ?? null,
        planned_duration_minutes: Number(input.planned_duration_minutes) || 50,
        finish_condition: String(input.finish_condition ?? 'Outcome met'),
        depth: input.depth || 'shallow',
        start_time: input.start_time ?? null
      });
      return ok({ state });
    }
    if (!input.state || typeof input.state !== 'object') return deny('missing_focus_state');
    if (action === 'start') {
      const started = startFocusBlock(input.state, now.toISOString());
      const sessionId = String(input.session_id || newRecordId('wsession')).trim();
      const record = {
        schema_version: 1,
        id: sessionId,
        task_id: started.sessionCreate.task_id ?? null,
        project_id: started.sessionCreate.project_id ?? null,
        work_block_id: started.sessionCreate.work_block_id ?? null,
        started_at: started.sessionCreate.started_at,
        finished_at: null,
        actual_duration_minutes: null,
        depth: started.sessionCreate.depth ?? 'shallow',
        work_mode: started.sessionCreate.work_mode ?? 'predefined',
        work_mode_confidence: started.sessionCreate.work_mode_confidence ?? 'explicit',
        result: 'open',
        source: 'focus_block',
        notes: ''
      };
      const proposal = propose(`Start focus session: ${input.state?.spec?.outcome || sessionId}`, [
        writeEntry(`tasks:work_session:${sessionId}`, 'create', record, `focus session start — ${sessionId}`)
      ]);
      return {
        ...proposal,
        session_id: sessionId,
        state: {
          ...started.state,
          session: { ...started.state.session, id: sessionId }
        }
      };
    }
    if (action === 'finish') {
      const finished = finishFocusBlock(input.state, input.result || 'done', now.toISOString());
      const sessionId = String(
        input.session_id || input.state?.session?.id || newRecordId('wsession')
      ).trim();
      const patch = {
        id: sessionId,
        ...finished.sessionPatch,
        result: finished.sessionPatch.result || input.result || 'done'
      };
      // Prefer Confirm path: append/overwrite existing session.
      const mode = input.session_id || input.state?.session?.id ? 'append' : 'create';
      const record = mode === 'create'
        ? {
            schema_version: 1,
            id: sessionId,
            task_id: input.state?.spec?.task_id ?? null,
            project_id: input.state?.spec?.project_id ?? null,
            work_block_id: input.state?.spec?.work_block_id ?? null,
            started_at: input.state?.session?.started_at || now.toISOString(),
            depth: input.state?.spec?.depth || 'shallow',
            work_mode: 'predefined',
            work_mode_confidence: 'explicit',
            source: 'focus_block',
            notes: '',
            ...patch
          }
        : patch;
      const proposal = propose(`Finish focus session: ${input.state?.spec?.outcome || sessionId}`, [
        writeEntry(
          `tasks:work_session:${sessionId}`,
          mode === 'create' ? 'create' : 'append',
          record,
          `focus session finish — ${sessionId}`
        )
      ]);
      return {
        ...proposal,
        session_id: sessionId,
        state: finished.state
      };
    }
    return deny('unknown_focus_action');
  }
  if (name === 'shutdown_day') {
    const todayKey = input.today_key || toHubDateKey(now) || now.toISOString().slice(0, 10);
    const tomorrowKey = input.tomorrow_key || (() => {
      const d = parseDue(todayKey);
      return d ? toDateKey(addDays(d, 1)) : todayKey;
    })();
    return ok(buildShutdown({
      today_key: todayKey,
      tomorrow_key: tomorrowKey,
      tasks,
      loose_texts: input.loose_texts,
      unconfirmed_titles: input.unconfirmed_titles,
      tomorrow_events: input.tomorrow_events,
      protected_tomorrow: input.protected_tomorrow ?? null
    }));
  }
  if (name === 'deadline_runway') {
    if (!input.deadline || !Number.isFinite(Number(input.remaining_minutes))) {
      return deny('missing_runway_inputs');
    }
    return ok(computeDeadlineRunway({
      deadline: input.deadline,
      remaining_minutes: Number(input.remaining_minutes),
      calibration_factor: input.calibration_factor,
      already_scheduled_minutes: input.already_scheduled_minutes,
      available_minutes_until_deadline: input.available_minutes_until_deadline,
      buffer_minutes: input.buffer_minutes,
      today: input.today || toHubDateKey(now) || now.toISOString().slice(0, 10),
      dependencies: input.dependencies
    }));
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
