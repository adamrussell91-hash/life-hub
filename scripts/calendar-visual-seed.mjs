import { readFile } from 'node:fs/promises';
import { buildCanonicalPath, buildRecordSlug } from '../netlify/functions/_shared/chat-schema.mjs';
import { renderMarkdown } from '../netlify/functions/_shared/persist-log.mjs';
import { validateRecord } from '../apps/life/js/core/validate.js';
import { PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts } from '../netlify/functions/calendar-ghosts.mjs';

export const CALENDAR_VISUAL_NOW = '2026-09-24T18:05:00+10:00';
export const CALENDAR_VISUAL_PATH = 'calendar-visual.json';

const FIXTURE_URL = new URL('../docs/proposals/calendar-reference/fixture.json', import.meta.url);

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

/**
 * Materialise the Tideline fixture into the mock data repo and freeze "now".
 * LOGS become Life records. GHOSTS become the pending queue. ITEMS, DUE, WALLS
 * and FREE stay on calendar-visual.json for the week view to read.
 */
export async function loadCalendarVisualSeed() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
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
  files.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts(ghosts.map(ghost => ({
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

  files.set(CALENDAR_VISUAL_PATH, JSON.stringify({
    now: CALENDAR_VISUAL_NOW,
    LOGS: fixture.LOGS ?? [],
    ITEMS: fixture.ITEMS ?? [],
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
    NOTES: Array.from({ length: 12 }, (_, index) => ({ id: `visual-note-${index + 1}` }))
  }, null, 2));

  return {
    now: CALENDAR_VISUAL_NOW,
    files,
    tasks,
    counts: {
      logs: logs.length,
      items: Array.isArray(fixture.ITEMS) ? fixture.ITEMS.length : 0,
      due: due.length,
      ghosts: ghosts.length,
      walls: Array.isArray(fixture.WALLS) ? fixture.WALLS.length : 0,
      free: Array.isArray(fixture.FREE) ? fixture.FREE.length : 0
    }
  };
}
