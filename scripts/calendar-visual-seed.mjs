import { readFile } from 'node:fs/promises';
import { buildCanonicalPath, buildRecordSlug } from '../netlify/functions/_shared/chat-schema.mjs';
import { renderMarkdown } from '../netlify/functions/_shared/persist-log.mjs';
import { validateRecord } from '../apps/life/js/core/validate.js';
import { PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts } from '../netlify/functions/calendar-ghosts.mjs';

export const CALENDAR_VISUAL_NOW = '2026-09-24T18:05:00+10:00';
export const CALENDAR_VISUAL_PATH = 'calendar-visual.json';

const FIXTURE_URL = new URL('../docs/proposals/calendar-reference/fixture.json', import.meta.url);
const RIVER_FIXTURE_URL = new URL('../docs/proposals/calendar-reference/term-river/fixture.json', import.meta.url);

const WORKOUT = `---
schema_version: 1
id: workout-1815
type: workout
date: "2026-09-24"
time: "18:15"
created_at: "2026-09-24T18:15:00+10:00"
updated_at: "2026-09-24T18:15:00+10:00"
source: calendar-visual-seed
title: Gym
day_type: workout_45_60
status: planned
session_kind: strength
exercises: []
---
`;

function stampLog(record, index) {
  const next = {
    ...record,
    schema_version: 1,
    id: `visual-${record.type}-${record.date}-${index}`,
    created_at: CALENDAR_VISUAL_NOW,
    updated_at: CALENDAR_VISUAL_NOW,
    source: 'calendar-visual-seed'
  };
  if (next.time == null) next.time = '00:00';
  if (next.type === 'meal') {
    for (const field of ['calories', 'protein_g', 'fat_g']) {
      if (next[field] == null) next[field] = 0;
    }
  }
  return next;
}

function blockSlug(record) {
  const stem = String(record.title || record.kind || 'block')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const time = String(record.time || '00:00').replace(/[^0-9]/g, '').slice(0, 4) || '0000';
  return `${stem || 'block'}-${time}`;
}

function recordPathFor(record) {
  const slug = record.type === 'calendar_block' ? blockSlug(record) : buildRecordSlug(record);
  return buildCanonicalPath({ type: record.type, date: record.date, slug });
}

function hhmmToHours(hhmm) {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3, 5)) / 60;
}

/** Pending-queue shape for a Term River ghost (g-bob, g-newcastle, g-day-trip). */
function riverGhostEntry(item) {
  const ghost = item.ghost;
  if (!ghost) return null;
  return {
    id: item.id,
    agent: ghost.agent,
    kind: ghost.kind,
    date: ghost.date,
    start: ghost.start,
    end: ghost.end,
    title: ghost.title,
    ...(ghost.with ? { with: ghost.with } : {}),
    label: item.title,
    meta: `Hammond${item.sub ? ` · ${item.sub}` : ''}`,
    chip: {
      date: ghost.date,
      start: ghost.start,
      end: ghost.end,
      kind: ghost.with === 'corey' ? 'corey' : 'task'
    }
  };
}

/**
 * Materialise a Term River item as a Life / Tasks record when it has a durable type.
 * Bars (projects) become Tasks projects. Corey blocks and medical visits become Life records.
 * Ghosts stay in the pending queue. Professional events / hums / markers stay on RIVER.ITEMS only.
 */
function materialiseRiverItem(item, files, tasks) {
  if (!item?.id || item.ghost || item.sample) return;
  if (item.shape === 'hum' || item.shape === 'marker') return;
  if (item.type === 'professional_event') return;

  if (item.type === 'project' && item.from && item.to) {
    tasks.push({
      schema_version: 1,
      id: item.id,
      title: item.title,
      description: item.sub ?? '',
      kind: 'project',
      bucket: 'active',
      domain: 'teaching',
      status: 'open',
      priority: 'medium',
      due_date: item.to,
      start_date: item.from,
      created_at: CALENDAR_VISUAL_NOW,
      updated_at: CALENDAR_VISUAL_NOW,
      completed_at: null,
      depends_on: [],
      tags: [],
      attachments: [],
      source: 'calendar-visual-seed'
    });
    return;
  }

  if (item.type === 'task' && item.date) {
    tasks.push({
      schema_version: 1,
      id: item.id,
      title: item.title,
      description: item.sub ?? '',
      kind: 'task',
      bucket: 'active',
      domain: 'teaching',
      status: 'open',
      priority: 'medium',
      due_date: item.date,
      created_at: CALENDAR_VISUAL_NOW,
      updated_at: CALENDAR_VISUAL_NOW,
      completed_at: null,
      depends_on: [],
      tags: [],
      attachments: [],
      source: 'calendar-visual-seed'
    });
    return;
  }

  const isCorey = item.type === 'calendar_block' || item.kind === 'corey';
  if (!isCorey || !item.date || !item.start || !item.end) return;

  const record = {
    schema_version: 1,
    id: item.id,
    type: 'calendar_block',
    date: item.date,
    time: item.start,
    end_time: item.end,
    kind: 'corey',
    protected: true,
    status: item.sub === 'held' ? 'tentative' : 'confirmed',
    title: item.title,
    created_at: CALENDAR_VISUAL_NOW,
    updated_at: CALENDAR_VISUAL_NOW,
    source: 'calendar-visual-seed'
  };
  const errors = validateRecord(record);
  if (errors.length) return;
  const path = recordPathFor(record);
  if (!files.has(path)) files.set(path, renderMarkdown(record, ''));
}

/**
 * Materialise the Tideline fixture into the mock data repo and freeze "now".
 * Also materialises the Term River fixture (RIVER on calendar-visual.json, its
 * three ghosts in the pending queue, and durable items as records).
 * LOGS become Life records. GHOSTS become the pending queue. ITEMS, DUE, WALLS
 * and FREE stay on calendar-visual.json for the week view to read.
 */
export async function loadCalendarVisualSeed() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
  const riverFixture = JSON.parse(await readFile(RIVER_FIXTURE_URL, 'utf8'));
  const files = new Map();
  const logs = Array.isArray(fixture.LOGS) ? fixture.LOGS : [];
  logs.forEach((log, index) => {
    const record = stampLog(log.record ?? {}, index);
    const errors = validateRecord(record);
    if (errors.length) throw new TypeError(`visual log ${index}: ${errors.join('; ')}`);
    const path = buildCanonicalPath({
      type: record.type,
      date: record.date,
      slug: buildRecordSlug(record)
    });
    files.set(path, renderMarkdown(record, typeof log.body === 'string' ? log.body : ''));
  });

  const ghosts = Array.isArray(fixture.GHOSTS) ? fixture.GHOSTS : [];
  const riverItems = Array.isArray(riverFixture.ITEMS) ? riverFixture.ITEMS : [];
  const riverGhosts = riverItems.map(riverGhostEntry).filter(Boolean);
  // Tideline ghosts first; river ghosts append (same id wins for the river ones).
  const byId = new Map();
  for (const ghost of ghosts) byId.set(ghost.id, ghost);
  for (const ghost of riverGhosts) byId.set(ghost.id, ghost);
  const mergedGhosts = [...byId.values()];

  files.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts(mergedGhosts.map(ghost => ({
    ...ghost,
    created_at: CALENDAR_VISUAL_NOW,
    status: 'pending'
  }))));

  const skip = ghosts.find(ghost => ghost.kind === 'skip_workout' && typeof ghost.workoutPath === 'string');
  if (skip) files.set(skip.workoutPath, WORKOUT);

  const due = Array.isArray(fixture.DUE) ? fixture.DUE : [];
  const tasks = due.filter(item => item && item.kind === 'task' && typeof item.id === 'string').map(item => ({
    schema_version: 1,
    id: item.id,
    title: item.title,
    description: '',
    kind: 'task',
    bucket: 'active',
    domain: 'teaching',
    status: 'open',
    priority: 'medium',
    due_date: item.date ?? null,
    created_at: CALENDAR_VISUAL_NOW,
    updated_at: CALENDAR_VISUAL_NOW,
    completed_at: null,
    depends_on: [],
    tags: [],
    attachments: [],
    source: 'calendar-visual-seed'
  }));

  riverItems.forEach((item) => materialiseRiverItem(item, files, tasks));

  // Commitments as lightweight work_block records for the load strip's real-data path.
  const commitments = Array.isArray(riverFixture.COMMITMENTS) ? riverFixture.COMMITMENTS : [];
  commitments.forEach((commitment, index) => {
    if (!commitment?.date) return;
    const start = typeof commitment.start === 'number' ? commitment.start : hhmmToHours(commitment.start);
    const end = typeof commitment.end === 'number' ? commitment.end : hhmmToHours(commitment.end);
    if (start == null || end == null) return;
    const toHhmm = hours => {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const record = {
      schema_version: 1,
      id: `river-commit-${index}`,
      type: 'calendar_block',
      kind: 'focus',
      date: commitment.date,
      time: toHhmm(start),
      end_time: toHhmm(end),
      title: commitment.title ?? 'Work',
      status: 'confirmed',
      protected: false,
      created_at: CALENDAR_VISUAL_NOW,
      updated_at: CALENDAR_VISUAL_NOW,
      source: 'calendar-visual-seed'
    };
    const errors = validateRecord(record);
    if (errors.length) return;
    const path = recordPathFor(record);
    if (!files.has(path)) files.set(path, renderMarkdown(record, ''));
  });

  const items = (Array.isArray(fixture.ITEMS) ? fixture.ITEMS : []).map(item => {
    if (item?.id === 'thu-workout' && skip?.workoutPath) return { ...item, recordPath: skip.workoutPath };
    return item;
  });

  const { _generated, ...riverPayload } = riverFixture;

  files.set(CALENDAR_VISUAL_PATH, JSON.stringify({
    now: CALENDAR_VISUAL_NOW,
    LOGS: fixture.LOGS ?? [],
    ITEMS: items,
    DUE: fixture.DUE ?? [],
    GHOSTS: fixture.GHOSTS ?? [],
    WALLS: fixture.WALLS ?? [],
    FREE: fixture.FREE ?? [],
    TRAY: fixture.TRAY ?? null,
    // Term dates drive "T3 W10 · last week of term" and the holiday forecast lift.
    // They are not on the planning-profile API during the visual seed (that route is 503).
    school_terms: [
      { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
      { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
    ],
    // Knowledge pages are not in the fixture logs, and /api/knowledge is 503 here.
    // The ambient line counts notes touched this week; the reference week has 12.
    NOTES: Array.from({ length: 12 }, (_, index) => ({ id: `visual-note-${index + 1}` })),
    // Term River (Concept B): the Term and Year stops read this block.
    RIVER: riverPayload
  }, null, 2));

  return {
    now: CALENDAR_VISUAL_NOW,
    files,
    tasks,
    counts: {
      logs: logs.length,
      items: Array.isArray(fixture.ITEMS) ? fixture.ITEMS.length : 0,
      due: due.length,
      ghosts: mergedGhosts.length,
      walls: Array.isArray(fixture.WALLS) ? fixture.WALLS.length : 0,
      free: Array.isArray(fixture.FREE) ? fixture.FREE.length : 0,
      riverItems: riverItems.length,
      riverGhosts: riverGhosts.length
    }
  };
}
