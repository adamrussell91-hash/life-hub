/**
 * Clare / Hammond Productivity OS — deterministic processors (plain JS).
 * Ported from apps/tasks/src/domain/* for Netlify chat tools.
 * No TypeScript imports. No dependencies.
 */

// ─── Date truth ──────────────────────────────────────────────────────────────

export function isHardOverdue(task, todayKey) {
  if (!task?.due_date) return false;
  return task.due_date < todayKey;
}

export function isReviewDue(task, todayKey) {
  if (!task?.review_at) return false;
  return task.review_at <= todayKey;
}

export function assertNoSilentDeadlineMutation(input) {
  if (input.intent !== 'plan_work') return { ok: true };
  if (input.before.due_date !== input.after.due_date) {
    return { ok: false, reason: 'Planning work must not change due_date.' };
  }
  if (input.before.due_time !== input.after.due_time) {
    return { ok: false, reason: 'Planning work must not change due_time.' };
  }
  return { ok: true };
}

// ─── Clarify ─────────────────────────────────────────────────────────────────

const WAITING_RE =
  /\b(waiting\s+(on|for)|wait\s+for|follow\s*up\s+with|heard\s+back\s+from)\b/i;
const SOMEDAY_RE = /\b(someday|maybe|one\s+day|eventually|park\s+this|incubate)\b/i;
const CALENDAR_RE =
  /\b(meeting|appointment|lesson|class|interview|call\s+at|on\s+\d{1,2}[\/\-]\d{1,2})\b/i;
const PROJECT_RE =
  /\b(project|plan\s+the|organise|organize|launch|build\s+out|multi[- ]step)\b/i;
const REFERENCE_RE = /\b(reference|note\s+to\s+self|fyi|bookmark|read\s+later\s+ref)\b/i;
const TRASH_RE = /\b(trash|delete|ignore|never\s+mind|nvm|cancel\s+that)\b/i;
const PERSON_RE = /\b(?:from|for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;

function splitCommitments(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const lines = raw
    .split(/\n+|•|\u2022|(?:^|\s)[-*]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  return raw
    .split(/(?<=[.!?])\s+(?=[A-Z])|(?:\s*;\s*)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function classifyOne(text, index) {
  const id = `clarify_${index + 1}`;
  const missing = [];
  let destination = 'next_action';
  let ambiguous = false;
  let question = null;
  let project_next_action = null;
  let waiting_on = null;
  let calendar_date = null;

  if (TRASH_RE.test(text)) {
    destination = 'trash';
  } else if (WAITING_RE.test(text)) {
    destination = 'waiting';
    const person = text.match(PERSON_RE);
    waiting_on = person?.[1] ?? null;
    if (!waiting_on) {
      missing.push('waiting_on');
      ambiguous = true;
      question = 'Who or what are you waiting on?';
    }
  } else if (SOMEDAY_RE.test(text)) {
    destination = 'someday';
  } else if (CALENDAR_RE.test(text)) {
    destination = 'calendar';
    const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/);
    calendar_date = dateMatch?.[1] ?? null;
    if (!calendar_date) {
      missing.push('calendar_date');
      ambiguous = true;
      question = 'Which date belongs on the calendar?';
    }
  } else if (REFERENCE_RE.test(text)) {
    destination = 'reference';
  } else if (PROJECT_RE.test(text) || /\band\b.+\band\b/i.test(text)) {
    destination = 'project';
    project_next_action = null;
    missing.push('project_next_action');
    ambiguous = true;
    question = 'What is the first concrete next action for this project?';
  } else {
    destination = 'next_action';
  }

  if (!ambiguous) question = null;

  return {
    id,
    text,
    destination,
    missing,
    ambiguous,
    question,
    project_next_action,
    waiting_on,
    calendar_date
  };
}

export function clarifyDump(text) {
  const parts = splitCommitments(text);
  return {
    source_text: text,
    items: parts.map((part, i) => classifyOne(part, i))
  };
}

export function reclassifyItem(stack, itemId, destination) {
  return {
    ...stack,
    items: stack.items.map((item) => {
      if (item.id !== itemId) return item;
      const next = { ...item, destination, ambiguous: false, question: null, missing: [] };
      if (destination === 'waiting' && !next.waiting_on) {
        next.missing = ['waiting_on'];
        next.ambiguous = true;
        next.question = 'Who or what are you waiting on?';
      }
      if (destination === 'project' && !next.project_next_action) {
        next.project_next_action = null;
        next.missing = ['project_next_action'];
        next.ambiguous = true;
        next.question = 'What is the first concrete next action for this project?';
      }
      return next;
    })
  };
}

// ─── Project health ──────────────────────────────────────────────────────────

const DONE = new Set(['done', 'dead', 'archived_dead']);
const DEAD_BUCKET = new Set(['trash', 'trashed']);

function isBlockedByDeps(task, all) {
  if (task.blocked_since) return true;
  const deps = task.depends_on ?? [];
  if (!deps.length) return false;
  const byId = new Map(all.map((t) => [t.id, t]));
  return deps.some((id) => {
    const dep = byId.get(id);
    if (!dep) return true;
    return !DONE.has(String(dep.status));
  });
}

function isOpenExecutable(task, all) {
  if (DONE.has(String(task.status))) return false;
  if (DEAD_BUCKET.has(String(task.bucket))) return false;
  if (task.bucket === 'someday') return false;
  if (task.waiting_status === 'waiting' || task.waiting_status === 'follow_up_due') return false;
  if (task.waiting_on) return false;
  if (isBlockedByDeps(task, all)) return false;
  return task.status === 'open' || task.status === 'in_progress' || task.status === 'deferred';
}

function isWaitingTask(task) {
  if (DONE.has(String(task.status))) return false;
  return Boolean(
    task.waiting_on ||
      task.waiting_status === 'waiting' ||
      task.waiting_status === 'follow_up_due'
  );
}

function openMilestones(project) {
  return (project.milestones ?? []).filter((m) => m.status === 'open');
}

export function inspectProjectHealth(project, tasks, nowIso = new Date().toISOString()) {
  const children = tasks.filter((t) => t.parent_project_id === project.id);
  const executable = children.filter((t) => isOpenExecutable(t, tasks));
  const waiting = children.filter(isWaitingTask);
  const blocked = children.filter(
    (t) => !DONE.has(String(t.status)) && isBlockedByDeps(t, tasks) && !isWaitingTask(t)
  );
  const milestones = openMilestones(project);
  const unmet = [];
  for (const m of milestones) {
    for (const dep of m.depends_on ?? []) {
      const child = children.find((t) => t.id === dep);
      if (!child || !DONE.has(String(child.status))) unmet.push(dep);
    }
  }

  const base = {
    project_id: project.id,
    executable_next_actions: executable.map((t) => t.id),
    waiting_task_ids: waiting.map((t) => t.id),
    blocked_task_ids: blocked.map((t) => t.id),
    open_milestones: milestones.map((m) => m.id),
    unmet_dependencies: unmet
  };

  if (project.status === 'stalled' || project.stall_flagged_at) {
    return { ...base, health: 'stalled', reason: 'Project is flagged stalled.' };
  }
  if (executable.length > 0) {
    return { ...base, health: 'healthy', reason: `${executable.length} executable next action(s).` };
  }
  if (waiting.length > 0 && blocked.length === 0) {
    return { ...base, health: 'waiting_only', reason: 'Only waiting items — no independent next action.' };
  }
  if (blocked.length > 0) {
    return { ...base, health: 'blocked', reason: 'Open work is blocked by unmet dependencies.' };
  }
  void nowIso;
  return { ...base, health: 'missing_next_action', reason: 'No open executable next action.' };
}

export function inspectActiveProjectsHealth(projects, tasks, nowIso) {
  return projects
    .filter((p) => p.status === 'active' || p.status === 'revived')
    .map((p) => inspectProjectHealth(p, tasks, nowIso));
}

// ─── Waiting ─────────────────────────────────────────────────────────────────

function daysBetweenKeys(fromIso, todayKey) {
  const from = fromIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${todayKey}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function deriveWaitingStatus(task, todayKey) {
  if (task.waiting_status === 'resolved') return 'resolved';
  if (!task.waiting_on && !task.waiting_status) return null;
  if (task.follow_up_at && task.follow_up_at <= todayKey) return 'follow_up_due';
  return 'waiting';
}

export function listWaitingItems(tasks, todayKey) {
  const out = [];
  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'dead') continue;
    const status = deriveWaitingStatus(task, todayKey);
    if (!status || status === 'resolved') continue;
    if (!task.waiting_on && status !== 'follow_up_due') continue;
    const age = task.waiting_since ? daysBetweenKeys(task.waiting_since, todayKey) : null;
    out.push({
      task_id: task.id,
      title: task.title,
      waiting_on: task.waiting_on ?? '',
      waiting_since: task.waiting_since ?? null,
      follow_up_at: task.follow_up_at ?? null,
      waiting_status: status,
      age_days: age,
      needs_action: status === 'follow_up_due'
    });
  }
  return out.sort((a, b) => {
    if (a.needs_action !== b.needs_action) return a.needs_action ? -1 : 1;
    return (b.age_days ?? 0) - (a.age_days ?? 0);
  });
}

export function waitingPatch(action, input) {
  const now = input.nowIso ?? new Date().toISOString();
  switch (action) {
    case 'follow_up':
      return {
        follow_up_at: input.follow_up_at ?? now.slice(0, 10),
        waiting_status: 'follow_up_due'
      };
    case 'move_follow_up':
      return {
        follow_up_at: input.follow_up_at ?? null,
        waiting_status: 'waiting'
      };
    case 'resolved':
      return {
        waiting_status: 'resolved',
        waiting_on: null,
        follow_up_at: null
      };
    case 'return_to_active':
      return {
        waiting_status: null,
        waiting_on: null,
        waiting_since: null,
        follow_up_at: null
      };
    default:
      return {};
  }
}

// ─── Context match ───────────────────────────────────────────────────────────

function isOpenTask(task) {
  return task.status === 'open' || task.status === 'in_progress';
}

function blockedForMatch(task) {
  return Boolean(task.blocked_since || task.waiting_on || task.waiting_status === 'waiting');
}

export function matchActionsNow(tasks, constraints = {}) {
  const energy = constraints.energy_level ?? null;
  const load = constraints.cognitive_load ?? null;
  const minutes = constraints.available_minutes ?? null;
  const open = tasks.filter((t) => isOpenTask(t) && t.bucket !== 'someday' && !blockedForMatch(t));

  const scored = [];
  for (const task of open) {
    let score = 50;
    const reasons = [];
    const est = task.estimated_duration;
    const depth = task.depth;

    if (minutes != null && Number.isFinite(minutes)) {
      if (est != null && est > minutes) {
        score += 40;
        continue;
      }
      if (est != null && est <= minutes) {
        score -= 12;
        reasons.push(`fits ${est}m`);
      } else if (est == null && minutes <= 30) {
        score -= 4;
        reasons.push('short window');
      }
    }

    if (energy === 'low') {
      if (depth === 'deep') {
        score += 30;
        continue;
      }
      if ((est ?? 99) <= 25 || depth === 'admin' || depth === 'shallow') {
        score -= 14;
        reasons.push('low energy');
      }
      if (task.cognitive_load === 'high') score += 20;
    } else if (energy === 'high') {
      if (depth === 'deep') {
        score -= 10;
        reasons.push('deep work');
      }
    }

    if (load === 'low' && task.cognitive_load === 'high') score += 18;
    if (load === 'high' && (task.cognitive_load === 'low' || depth === 'admin')) {
      score -= 8;
      reasons.push('light load');
    }

    if (constraints.deep_work_ok === false && depth === 'deep') continue;
    if (constraints.deep_work_ok === true && depth === 'deep') {
      score -= 8;
      reasons.push('deep suitable');
    }

    const contexts = task.contexts ?? [];
    if (constraints.device) {
      const hit = contexts.some(
        (c) => c.kind === 'device' && c.value.toLowerCase() === constraints.device.toLowerCase()
      );
      if (contexts.some((c) => c.kind === 'device') && !hit) continue;
      if (hit) {
        score -= 10;
        reasons.push(`on ${constraints.device}`);
      }
    }
    if (constraints.place) {
      const hit = contexts.some(
        (c) => c.kind === 'place' && c.value.toLowerCase() === constraints.place.toLowerCase()
      );
      if (contexts.some((c) => c.kind === 'place') && !hit) continue;
      if (hit) {
        score -= 10;
        reasons.push(`at ${constraints.place}`);
      }
    }
    if (constraints.person) {
      const hit = contexts.some(
        (c) => c.kind === 'person' && c.value.toLowerCase() === constraints.person.toLowerCase()
      );
      if (contexts.some((c) => c.kind === 'person') && !hit) continue;
      if (hit) {
        score -= 8;
        reasons.push(`with ${constraints.person}`);
      }
    }

    if (constraints.now_key && task.due_date && task.due_date <= constraints.now_key) {
      score -= 16;
      reasons.push('deadline pressure');
    }

    if (!reasons.length) reasons.push('open and actionable');
    scored.push({
      task_id: task.id,
      title: task.title,
      reason: reasons[0],
      score,
      depth: depth ?? null,
      estimated_duration: est ?? null
    });
  }

  scored.sort((a, b) => a.score - b.score);
  return {
    matches: scored.slice(0, 5),
    energy_applied: Boolean(energy),
    note: energy
      ? `Matched with ${energy} energy.`
      : 'No energy supplied — matched on time, context, and deadline only.'
  };
}

// ─── Schedule compose ────────────────────────────────────────────────────────

export function minutesOf(hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Teaching scheduled lessons: date + start_time (HH:MM); default duration 60. */
export function lessonToBusySpan(lesson) {
  if (!lesson || typeof lesson !== 'object') return null;
  if (Number.isFinite(Number(lesson.start)) && Number.isFinite(Number(lesson.end))) {
    return {
      start: Number(lesson.start),
      end: Number(lesson.end),
      title: lesson.title ?? 'Lesson',
      kind: 'lesson'
    };
  }
  if (
    Number.isFinite(Number(lesson.start_minutes)) &&
    Number.isFinite(Number(lesson.end_minutes))
  ) {
    return {
      start: Number(lesson.start_minutes),
      end: Number(lesson.end_minutes),
      title: lesson.title ?? 'Lesson',
      kind: 'lesson'
    };
  }
  const start =
    minutesOf(lesson.starts_at || lesson.start_time || lesson.start) ??
    (Number.isFinite(Number(lesson.start_minutes)) ? Number(lesson.start_minutes) : null);
  if (start == null) return null;
  const minutes =
    Number(lesson.duration_minutes || lesson.minutes || lesson.duration) || 60;
  return {
    start,
    end: start + Math.max(1, Math.round(minutes)),
    title: lesson.title ?? 'Lesson',
    kind: 'lesson'
  };
}

function minBlockMinutesForDepth(depth, profile) {
  if (depth === 'deep') {
    const pref = Number(profile?.deep_work_preference?.min_block_minutes);
    return Number.isFinite(pref) && pref > 0 ? pref : 90;
  }
  return 25;
}

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function freeSlots(bounds, busy, minMinutes = 15) {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = bounds.start;
  for (const span of sorted) {
    if (span.end <= bounds.start || span.start >= bounds.end) continue;
    const start = Math.max(span.start, bounds.start);
    const end = Math.min(span.end, bounds.end);
    if (start > cursor && start - cursor >= minMinutes) {
      gaps.push({ start: cursor, end: start });
    }
    cursor = Math.max(cursor, end);
  }
  if (bounds.end - cursor >= minMinutes) gaps.push({ start: cursor, end: bounds.end });
  return gaps;
}

function firstFit(gaps, minutes, preferDeep) {
  const ordered = preferDeep
    ? [...gaps].sort((a, b) => b.end - b.start - (a.end - a.start))
    : gaps;
  for (const gap of ordered) {
    if (gap.end - gap.start >= minutes) {
      return { start: gap.start, end: gap.start + minutes };
    }
  }
  return null;
}

export const FALLBACK_WORKDAY = {
  start: '08:00',
  end: '16:30',
  source: 'fallback'
};

/**
 * Resolve effective workday for a calendar date.
 * Priority:
 * 1. explicit trusted workday (tool_input / compose metadata)
 * 2. planning_profile.work_windows for that weekday
 * 3. FALLBACK_WORKDAY
 * Confirm must not trust client-supplied workday overrides.
 */
export function workdayForDate(date, planningProfile = null, explicitWorkday = null) {
  if (explicitWorkday?.start && explicitWorkday?.end) {
    return {
      start: explicitWorkday.start,
      end: explicitWorkday.end,
      source: explicitWorkday.source || 'tool_input'
    };
  }
  if (date && planningProfile && typeof planningProfile === 'object') {
    const cap = dayCapacity(date, planningProfile);
    if (cap.work_source === 'profile' && Array.isArray(cap.work_windows) && cap.work_windows.length) {
      const starts = cap.work_windows.map((w) => minutesOf(w.start)).filter((n) => n != null);
      const ends = cap.work_windows.map((w) => minutesOf(w.end)).filter((n) => n != null);
      if (starts.length && ends.length) {
        return {
          start: formatMinutes(Math.min(...starts)),
          end: formatMinutes(Math.max(...ends)),
          source: 'planning_profile'
        };
      }
    }
  }
  return { ...FALLBACK_WORKDAY };
}

function placeTaskBlocks(task, {
  date,
  bounds,
  hardBusy,
  plannedSpans,
  energy,
  profile
}) {
  const known = Number(task.estimated_duration);
  if (!Number.isFinite(known) || known <= 0) {
    return {
      proposed: [],
      remaining: 0,
      reason: 'Missing required duration estimate'
    };
  }
  let remaining = Math.max(15, Math.round(known));
  const depth = task.depth ?? 'shallow';
  const minBlock = minBlockMinutesForDepth(depth, profile);
  const preferDeep = depth === 'deep' && energy !== 'low';
  const proposed = [];

  while (remaining > 0) {
    const busy = [...hardBusy, ...plannedSpans];
    const gaps = freeSlots(bounds, busy, Math.min(minBlock, remaining));
    const needFull = remaining;
    let slot = firstFit(gaps, needFull, preferDeep);
    let chunk = needFull;
    if (!slot) {
      const ordered = preferDeep
        ? [...gaps].sort((a, b) => b.end - b.start - (a.end - a.start))
        : gaps;
      const fit = ordered.find((g) => {
        const size = g.end - g.start;
        return size >= Math.min(minBlock, remaining);
      });
      if (!fit) break;
      chunk = Math.min(remaining, fit.end - fit.start);
      if (chunk < remaining && chunk < minBlock) break;
      slot = { start: fit.start, end: fit.start + chunk };
    }
    proposed.push({
      temp_id: `ghost_${task.id}_${formatMinutes(slot.start)}`,
      task_id: task.id,
      title: task.title,
      date,
      start_time: formatMinutes(slot.start),
      duration_minutes: chunk,
      depth,
      selected: true
    });
    plannedSpans.push({
      start: slot.start,
      end: slot.end,
      title: task.title,
      kind: 'work_block'
    });
    remaining -= chunk;
  }

  return {
    proposed,
    remaining,
    reason: remaining > 0 ? 'No free window under hard constraints' : null,
    // Caller should discard proposed when remaining > 0 (all-or-nothing per task).
    complete: remaining === 0 && proposed.length > 0
  };
}

export function composeDaySchedule(input) {
  const profile = input.planning_profile ?? input.profile ?? null;
  const workday = workdayForDate(
    input.date,
    profile,
    input.workday?.start && input.workday?.end ? input.workday : null
  );

  const bounds = {
    start: minutesOf(workday.start) ?? 8 * 60,
    end: minutesOf(workday.end) ?? 16 * 60 + 30
  };

  const protectedSpans = Array.isArray(input.protected_windows) && input.protected_windows.length
    ? input.protected_windows
    : protectedSpansForDate(input.date, profile);

  const hardBusy = [
    ...(input.lessons ?? []),
    ...(input.events ?? []),
    ...(input.confirmed_blocks ?? []),
    ...protectedSpans
  ];

  const collisions = [];
  for (let i = 0; i < hardBusy.length; i++) {
    for (let j = i + 1; j < hardBusy.length; j++) {
      if (overlaps(hardBusy[i], hardBusy[j])) {
        collisions.push(
          `${hardBusy[i].title ?? 'block'} overlaps ${hardBusy[j].title ?? 'block'}`
        );
      }
    }
  }

  const proposed = [];
  const unscheduled = [];
  const plannedSpans = [];
  const doneIds = new Set();

  const sorted = [...input.tasks].sort((a, b) => {
    const depthScore = (d) => (d === 'deep' ? 0 : d === 'shallow' ? 1 : 2);
    if (a.due_date !== b.due_date) {
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
    }
    return depthScore(a.depth) - depthScore(b.depth);
  });

  for (const task of sorted) {
    if (task.blocked) {
      unscheduled.push({ task_id: task.id, title: task.title, reason: 'Blocked' });
      continue;
    }
    const deps = task.depends_on ?? [];
    if (deps.some((id) => !doneIds.has(id) && sorted.some((t) => t.id === id))) {
      const unmet = deps.filter((id) => sorted.some((t) => t.id === id) && !doneIds.has(id));
      if (unmet.length) {
        unscheduled.push({
          task_id: task.id,
          title: task.title,
          reason: `Depends on ${unmet.join(', ')}`
        });
        continue;
      }
    }

    const placed = placeTaskBlocks(task, {
      date: input.date,
      bounds,
      hardBusy,
      plannedSpans,
      energy: input.energy,
      profile
    });
    if (placed.complete) {
      proposed.push(...placed.proposed);
      doneIds.add(task.id);
    } else if (placed.reason) {
      // Roll back any partial spans from an incomplete place attempt.
      for (let i = 0; i < placed.proposed.length; i += 1) plannedSpans.pop();
      unscheduled.push({
        task_id: task.id,
        title: task.title,
        reason: placed.reason,
        remaining_minutes: placed.remaining || undefined
      });
    }
  }

  const stillUnsched = [];
  for (const item of unscheduled) {
    if (!item.reason.startsWith('Depends on')) {
      stillUnsched.push(item);
      continue;
    }
    const task = sorted.find((t) => t.id === item.task_id);
    if (!task) {
      stillUnsched.push(item);
      continue;
    }
    const deps = task.depends_on ?? [];
    if (deps.some((id) => sorted.some((t) => t.id === id) && !doneIds.has(id))) {
      stillUnsched.push(item);
      continue;
    }
    const placed = placeTaskBlocks(task, {
      date: input.date,
      bounds,
      hardBusy,
      plannedSpans,
      energy: input.energy,
      profile
    });
    if (placed.complete) {
      proposed.push(...placed.proposed);
      doneIds.add(task.id);
    } else if (placed.reason) {
      for (let i = 0; i < placed.proposed.length; i += 1) plannedSpans.pop();
      stillUnsched.push({
        task_id: task.id,
        title: task.title,
        reason: placed.reason,
        remaining_minutes: placed.remaining || undefined
      });
    }
  }

  const finalGaps = freeSlots(bounds, [...hardBusy, ...plannedSpans]);
  let status = 'fully_scheduled';
  if (!proposed.length && stillUnsched.length) {
    status = stillUnsched.every((u) => u.reason.includes('Missing'))
      ? 'missing_info'
      : 'impossible';
  } else if (stillUnsched.length) {
    status = 'partially_scheduled';
  }

  return {
    status,
    date: input.date,
    proposed,
    unscheduled: stillUnsched,
    free_windows: finalGaps.map((g) => ({
      start: formatMinutes(g.start),
      end: formatMinutes(g.end),
      minutes: g.end - g.start
    })),
    workday,
    collisions
  };
}

/** Build hard-busy spans for stale schedule confirm checks. */
export function buildAuthoritativeHardBusy({
  date,
  lessons = [],
  workBlocks = [],
  planningProfile = null,
  protected_windows = null
}) {
  const lessonSpans = (lessons ?? [])
    .filter((lesson) => {
      const d = lesson?.date || lesson?.scheduled_date || lesson?.starts_on;
      return !date || String(d ?? '') === date;
    })
    .map(lessonToBusySpan)
    .filter(Boolean);

  const confirmed = (workBlocks ?? [])
    .filter(
      (b) =>
        b &&
        (!date || b.date === date) &&
        (b.status === 'confirmed' || b.status === 'in_progress' || b.status === 'done') &&
        b.status !== 'cancelled'
    )
    .map((b) => {
      const start = minutesOf(b.start_time);
      if (start == null) return null;
      return {
        start,
        end: start + (Number(b.duration_minutes) || 60),
        title: b.title ?? 'Work block',
        kind: 'locked'
      };
    })
    .filter(Boolean);

  const protectedSpans = Array.isArray(protected_windows)
    ? protected_windows
        .map((w) => {
          if (Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end))) {
            return {
              start: Number(w.start),
              end: Number(w.end),
              title: w.title ?? w.label ?? 'Protected',
              kind: 'protected'
            };
          }
          const start = minutesOf(w.start);
          const end = minutesOf(w.end);
          if (start == null || end == null) return null;
          return {
            start,
            end,
            title: w.title ?? w.label ?? 'Protected',
            kind: 'protected'
          };
        })
        .filter(Boolean)
    : protectedSpansForDate(date, planningProfile);

  return [...lessonSpans, ...confirmed, ...protectedSpans];
}

/**
 * Before confirming compose_schedule / schedule-diff work_block writes,
 * re-check collisions against authoritative calendar. Returns revised proposal
 * payload when stale collisions appear.
 */
export function detectStaleScheduleCollisions({
  proposedBlocks,
  hardBusy,
  workday = FALLBACK_WORKDAY
}) {
  const check = validateProposedBlocks(proposedBlocks ?? [], hardBusy ?? [], workday);
  if (check.ok) return { ok: true, conflicts: [] };
  return {
    ok: false,
    error: 'stale_schedule_collision',
    conflicts: check.conflicts,
    revised: {
      status: 'needs_recompose',
      note: 'Calendar changed since proposal — confirm blocked. Recompose against current hard busy.',
      conflicts: check.conflicts,
      hard_busy: hardBusy
    }
  };
}

export function validateProposedBlocks(proposed, hardBusy, workday = FALLBACK_WORKDAY) {
  const bounds = {
    start: minutesOf(workday.start) ?? 8 * 60,
    end: minutesOf(workday.end) ?? 16 * 60 + 30
  };
  const conflicts = [];
  const accepted = [];
  for (const block of proposed) {
    if (!block.selected) continue;
    const start = minutesOf(block.start_time);
    if (start == null) {
      conflicts.push({ temp_id: block.temp_id, reason: 'Invalid start time' });
      continue;
    }
    const span = {
      start,
      end: start + block.duration_minutes,
      title: block.title,
      kind: 'work_block'
    };
    if (span.start < bounds.start || span.end > bounds.end) {
      conflicts.push({ temp_id: block.temp_id, reason: 'Outside work boundaries' });
      continue;
    }
    const hit = [...hardBusy, ...accepted].find((b) => overlaps(b, span));
    if (hit) {
      conflicts.push({
        temp_id: block.temp_id,
        reason: `Collides with ${hit.title ?? hit.kind ?? 'busy time'}`
      });
      continue;
    }
    accepted.push(span);
  }
  return { ok: conflicts.length === 0, conflicts };
}

// ─── Deadline runway ─────────────────────────────────────────────────────────

function addDaysKey(key, days) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenDates(a, b) {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function computeDeadlineRunway(input) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const factor =
    input.calibration_factor != null && Number.isFinite(input.calibration_factor)
      ? Math.max(0.5, input.calibration_factor)
      : 1;
  const remaining = Math.max(0, Math.round(input.remaining_minutes * factor));
  const scheduled = Math.max(0, input.already_scheduled_minutes ?? 0);
  const stillNeeded = Math.max(0, remaining - scheduled);

  const bufferConfigured = input.buffer_minutes;
  const buffer =
    bufferConfigured != null && Number.isFinite(bufferConfigured)
      ? Math.max(0, bufferConfigured)
      : (input.fallback_buffer_minutes ?? 60);
  const buffer_source =
    bufferConfigured != null && Number.isFinite(bufferConfigured) ? 'profile' : 'fallback';

  const unsatisfied = (input.dependencies ?? []).filter((d) => !d.satisfied);
  const totalNeed = stillNeeded + buffer;
  const available = input.available_minutes_until_deadline;

  let risk = 'clear';
  if (available != null && available < stillNeeded) risk = 'impossible';
  else if (available != null && available < totalNeed) risk = 'tight';
  else if (daysBetweenDates(today, input.deadline) <= 1 && stillNeeded > 120) risk = 'tight';

  const workDaysNeeded = Math.max(1, Math.ceil(stillNeeded / 120));
  const latest = addDaysKey(input.deadline, -workDaysNeeded);
  const recommended = addDaysKey(input.deadline, -(workDaysNeeded + (buffer_source === 'fallback' ? 1 : 0)));

  const blocks = [];
  let left = stillNeeded;
  while (left > 0) {
    const chunk = Math.min(left, left > 90 ? 90 : left >= 45 ? 60 : Math.max(25, left));
    blocks.push({ minutes: chunk, depth: chunk >= 60 ? 'deep' : 'shallow' });
    left -= chunk;
  }

  const segments = [
    { kind: 'work', label: 'Required work', minutes: stillNeeded, date: recommended },
    ...unsatisfied.map((d) => ({
      kind: 'dependency',
      label: d.title,
      minutes: null,
      date: null
    })),
    { kind: 'buffer', label: `Buffer (${buffer_source})`, minutes: buffer, date: latest },
    { kind: 'deadline', label: 'Deadline', minutes: null, date: input.deadline }
  ];

  let note = `Hard deadline ${input.deadline} unchanged.`;
  if (risk === 'impossible') {
    note = `Impossible under available capacity before ${input.deadline}. Deadline not moved.`;
  } else if (risk === 'tight') {
    note = `Tight runway before ${input.deadline}. Protect the required blocks.`;
  }
  if (unsatisfied.length) {
    note += ` ${unsatisfied.length} unsatisfied dependenc${unsatisfied.length === 1 ? 'y' : 'ies'}.`;
  }

  return {
    latest_safe_start: latest < today ? today : latest,
    recommended_start: recommended < today ? today : recommended,
    required_work_minutes: stillNeeded,
    buffer_minutes: buffer,
    buffer_source,
    risk,
    unsatisfied_dependencies: unsatisfied.map((d) => ({ id: d.id, title: d.title })),
    segments,
    required_blocks: blocks,
    note
  };
}

// ─── Focus block ─────────────────────────────────────────────────────────────

export function createFocusBlock(spec) {
  return {
    status: 'ready',
    spec: {
      ...spec,
      task_id: spec.task_id ?? null,
      project_id: spec.project_id ?? null,
      work_block_id: spec.work_block_id ?? null,
      start_time: spec.start_time ?? null
    },
    session: null,
    elapsed_minutes: null
  };
}

export function startFocusBlock(state, nowIso = new Date().toISOString()) {
  const sessionCreate = {
    task_id: state.spec.task_id ?? null,
    project_id: state.spec.project_id ?? null,
    work_block_id: state.spec.work_block_id ?? null,
    started_at: nowIso,
    depth: state.spec.depth,
    work_mode: 'predefined',
    work_mode_confidence: 'explicit',
    source: 'focus_block'
  };
  return {
    state: {
      ...state,
      status: 'running',
      session: { ...sessionCreate, result: 'open' }
    },
    sessionCreate
  };
}

export function finishFocusBlock(state, result, nowIso = new Date().toISOString()) {
  const started = state.session?.started_at ?? nowIso;
  const elapsed = Math.max(
    1,
    Math.round((Date.parse(nowIso) - Date.parse(started)) / 60_000)
  );
  const sessionPatch = {
    finished_at: nowIso,
    actual_duration_minutes: elapsed,
    result
  };
  return {
    state: {
      ...state,
      status: 'finished',
      elapsed_minutes: elapsed,
      session: { ...state.session, ...sessionPatch }
    },
    sessionPatch
  };
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

export function buildShutdown(input) {
  const items = [];
  for (const text of input.loose_texts ?? []) {
    items.push({
      id: `loose_${items.length}`,
      kind: 'loose',
      title: text,
      suggested: 'carry'
    });
  }

  for (const task of input.tasks) {
    if (task.status === 'done' || task.status === 'dead') continue;
    if (task.due_date === input.today_key && task.status !== 'done') {
      items.push({
        id: `today_${task.id}`,
        kind: 'unresolved_today',
        title: task.title,
        task_id: task.id,
        suggested: 'carry'
      });
    }
  }

  for (const waiting of listWaitingItems(input.tasks, input.today_key)) {
    if (!waiting.needs_action) continue;
    items.push({
      id: `wait_${waiting.task_id}`,
      kind: 'waiting',
      title: `Follow up: ${waiting.title}`,
      task_id: waiting.task_id,
      suggested: 'leave'
    });
  }

  for (const event of input.tomorrow_events ?? []) {
    items.push({
      id: `tom_${items.length}`,
      kind: 'tomorrow',
      title: event.title,
      suggested: 'leave'
    });
  }

  for (const title of input.unconfirmed_titles ?? []) {
    items.push({
      id: `unc_${items.length}`,
      kind: 'unconfirmed',
      title,
      suggested: 'leave'
    });
  }

  const note =
    items.length === 0
      ? 'Workday closed. Nothing needs a decision.'
      : `${items.length} item(s) need a decision before shutdown.`;

  return {
    status: items.length === 0 ? 'closed' : 'open',
    items,
    tomorrow_first_block: input.protected_tomorrow ?? null,
    note
  };
}

// ─── Weekly review ───────────────────────────────────────────────────────────

export const WEEKLY_REVIEW_STAGES = [
  'capture',
  'past_calendar',
  'upcoming_calendar',
  'waiting',
  'projects',
  'someday',
  'build_week',
  'confirm'
];

export function createWeeklyReview(id = `wr_${Date.now()}`) {
  return {
    id,
    current_stage: 'capture',
    completed: [],
    capture: null,
    past_calendar_notes: [],
    upcoming_calendar_notes: [],
    waiting: [],
    project_health: [],
    someday_due: [],
    schedule: null,
    pending_changes: [],
    next_action_titles: {},
    waiting_decisions: {},
    someday_decisions: {},
    status: 'in_progress',
    updated_at: new Date().toISOString()
  };
}

function advanceWeekly(state, stage) {
  const idx = WEEKLY_REVIEW_STAGES.indexOf(stage);
  const next = WEEKLY_REVIEW_STAGES[Math.min(idx + 1, WEEKLY_REVIEW_STAGES.length - 1)];
  const completed = [...new Set([...state.completed, stage])];
  return {
    ...state,
    current_stage: next,
    completed,
    updated_at: new Date().toISOString()
  };
}


export function buildWeeklyPendingChanges(state) {
  const nextTitles = state.next_action_titles && typeof state.next_action_titles === 'object'
    ? state.next_action_titles
    : {};
  const waitingDecisions = state.waiting_decisions && typeof state.waiting_decisions === 'object'
    ? state.waiting_decisions
    : {};
  const somedayDecisions = state.someday_decisions && typeof state.someday_decisions === 'object'
    ? state.someday_decisions
    : {};

  const capture = (state.capture?.items ?? [])
    .filter((i) => i.destination !== 'trash' && i.destination !== 'reference')
    .map((i) => {
      const needsClarify = Boolean(i.ambiguous) || (Array.isArray(i.missing) && i.missing.length > 0)
        || (i.destination === 'waiting' && !String(i.waiting_on ?? '').trim())
        || (i.destination === 'project' && !String(i.project_next_action ?? '').trim());
      if (needsClarify) {
        return {
          id: i.id,
          kind: 'informational',
          destination: i.destination,
          summary: i.question
            || `Clarify needed before capture can write: ${i.text.slice(0, 60)}`,
          selected: false,
          confirmable: false
        };
      }
      return {
        id: i.id,
        kind: 'capture',
        destination: i.destination,
        summary: `Clarify → ${i.destination}: ${i.text.slice(0, 60)}`,
        selected: true,
        confirmable: true
      };
    });

  const nextActions = [];
  for (const h of state.project_health ?? []) {
    if (h.health !== 'missing_next_action') continue;
    const projectId = h.project_id;
    const title = typeof nextTitles[projectId] === 'string' ? nextTitles[projectId].trim() : '';
    if (!title) {
      nextActions.push({
        id: `project_health:${projectId}`,
        kind: 'informational',
        project_id: projectId,
        summary: `Project ${projectId} needs a next action — provide a concrete next action before Confirm`,
        selected: false,
        confirmable: false
      });
      continue;
    }
    nextActions.push({
      id: `next_action:${projectId}`,
      kind: 'next_action',
      project_id: projectId,
      title,
      summary: `Create next action “${title}” for project ${projectId}`,
      selected: true,
      confirmable: true
    });
  }

  const waiting = [];
  for (const item of state.waiting ?? []) {
    const decision = waitingDecisions[item.task_id];
    if (!decision || !decision.action) {
      if (item.needs_action) {
        waiting.push({
          id: `waiting:${item.task_id}:needs_decision`,
          kind: 'informational',
          task_id: item.task_id,
          summary: `Waiting “${item.title}” needs a decision (follow_up / move_follow_up / resolved / return_to_active)`,
          selected: false,
          confirmable: false
        });
      }
      continue;
    }
    const action = decision.action;
    waiting.push({
      id: `waiting:${item.task_id}:${action}`,
      kind: 'waiting',
      task_id: item.task_id,
      action,
      follow_up_at: decision.follow_up_at ?? null,
      summary: `Waiting ${action}: ${item.title}`,
      selected: true,
      confirmable: true
    });
  }

  const someday = [];
  for (const item of state.someday_due ?? []) {
    const decision = somedayDecisions[item.task_id];
    if (!decision || !decision.action) {
      someday.push({
        id: `someday:${item.task_id}:needs_decision`,
        kind: 'informational',
        task_id: item.task_id,
        summary: `Someday “${item.title}” is due for review — choose keep / activate / remove`,
        selected: false,
        confirmable: false
      });
      continue;
    }
    someday.push({
      id: `someday:${item.task_id}:${decision.action}`,
      kind: 'someday',
      task_id: item.task_id,
      action: decision.action,
      review_at: decision.review_at ?? null,
      summary: `Someday ${decision.action}: ${item.title}`,
      selected: true,
      confirmable: true
    });
  }

  const schedule = (state.schedule?.proposed ?? state.schedule?.blocks ?? [])
    .filter((b) => b && b.selected !== false)
    .map((b, index) => ({
      id: b.write_path || b.id || `schedule:${index}`,
      kind: 'schedule_block',
      summary: `Schedule ${b.date || ''} ${b.start_time || b.start || ''} · ${b.title || 'block'}`.trim(),
      selected: true,
      confirmable: true
    }));

  return [...capture, ...nextActions, ...waiting, ...someday, ...schedule];
}

export function runWeeklyReviewStage(state, input) {
  // Merge durable decision maps before stage work so resume keeps titles/choices.
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
  const stage = state.current_stage;
  if (stage === 'capture') {
    const capture = clarifyDump(input.dump_text ?? '');
    return advanceWeekly({ ...state, capture }, 'capture');
  }
  if (stage === 'past_calendar') {
    return advanceWeekly(
      { ...state, past_calendar_notes: input.past_notes ?? state.past_calendar_notes },
      'past_calendar'
    );
  }
  if (stage === 'upcoming_calendar') {
    return advanceWeekly(
      {
        ...state,
        upcoming_calendar_notes: input.upcoming_notes ?? state.upcoming_calendar_notes
      },
      'upcoming_calendar'
    );
  }
  if (stage === 'waiting') {
    const today = input.today_key ?? new Date().toISOString().slice(0, 10);
    return advanceWeekly(
      { ...state, waiting: listWaitingItems(input.tasks ?? [], today) },
      'waiting'
    );
  }
  if (stage === 'projects') {
    return advanceWeekly(
      {
        ...state,
        project_health: inspectActiveProjectsHealth(input.projects ?? [], input.tasks ?? [])
      },
      'projects'
    );
  }
  if (stage === 'someday') {
    const today = input.today_key ?? new Date().toISOString().slice(0, 10);
    const someday_due = (input.tasks ?? [])
      .filter((t) => t.bucket === 'someday' && isReviewDue(t, today))
      .map((t) => ({
        task_id: t.id,
        title: t.title,
        review_at: t.review_at
      }));
    return advanceWeekly({ ...state, someday_due }, 'someday');
  }
  if (stage === 'build_week') {
    const withSchedule = { ...state, schedule: input.schedule ?? null };
    const advanced = advanceWeekly(withSchedule, 'build_week');
    return {
      ...advanced,
      pending_changes: advanced.pending_changes?.length
        ? advanced.pending_changes
        : buildWeeklyPendingChanges(withSchedule)
    };
  }
  return {
    ...state,
    current_stage: 'confirm',
    completed: [...new Set([...state.completed, 'confirm'])],
    pending_changes: state.pending_changes.length
      ? state.pending_changes
      : buildWeeklyPendingChanges(state),
    updated_at: new Date().toISOString()
  };
}

// ─── Project plan ────────────────────────────────────────────────────────────

const PROJECT_PLAN_STAGES = [
  'purpose',
  'desired_outcome',
  'brainstorm',
  'organise',
  'next_action'
];

export function createProjectPlan(input) {
  return {
    id: `pp_${Date.now()}`,
    project_id: input.project_id ?? null,
    project_title: input.project_title,
    current_stage: 'purpose',
    completed: [],
    purpose: input.purpose ?? '',
    constraints: '',
    desired_outcome: input.desired_outcome ?? '',
    brainstorm: [],
    organised: [],
    next_actions: [],
    milestones: [],
    updated_at: new Date().toISOString()
  };
}

export function updateProjectPlanStage(state, patch, advance = false) {
  const next = { ...state, ...patch, updated_at: new Date().toISOString() };
  if (!advance) return next;
  const idx = PROJECT_PLAN_STAGES.indexOf(state.current_stage);
  const stage = state.current_stage;
  const completed = [...new Set([...state.completed, stage])];
  const current_stage = PROJECT_PLAN_STAGES[Math.min(idx + 1, PROJECT_PLAN_STAGES.length - 1)];
  return { ...next, completed, current_stage };
}

// ─── Hammond portfolio ───────────────────────────────────────────────────────

export function listActiveProjects(projects) {
  return projects.filter((p) => p.status === 'active' || p.status === 'revived');
}

export function activeProjectMeter(projects, profile) {
  const active = listActiveProjects(projects);
  const limit = profile?.active_project_limit ?? null;
  if (limit == null) {
    return {
      active_count: active.length,
      limit: null,
      slots_left: null,
      over_by: null,
      status: 'unset',
      message: `${active.length} active. Limit not set.`,
      active_project_ids: active.map((p) => p.id)
    };
  }
  const over = active.length - limit;
  if (over > 0) {
    return {
      active_count: active.length,
      limit,
      slots_left: 0,
      over_by: over,
      status: 'over',
      message: `${active.length} active of limit ${limit}. Choose ${over} to pause.`,
      active_project_ids: active.map((p) => p.id)
    };
  }
  if (over === 0) {
    return {
      active_count: active.length,
      limit,
      slots_left: 0,
      over_by: 0,
      status: 'full',
      message: `${active.length} active of limit ${limit}. No slots left.`,
      active_project_ids: active.map((p) => p.id)
    };
  }
  return {
    active_count: active.length,
    limit,
    slots_left: -over,
    over_by: 0,
    status: 'ok',
    message: `${active.length} active of limit ${limit}. ${-over} slot${-over === 1 ? '' : 's'} left.`,
    active_project_ids: active.map((p) => p.id)
  };
}

export function assessNewCommitment(input) {
  const meter = activeProjectMeter(input.projects, input.profile);
  if (!input.candidate.info_complete) {
    return {
      decision: 'need_more_info',
      meter,
      pause_candidates: [],
      reason: 'Need more information before commitment.'
    };
  }
  if (!input.candidate.substantial) {
    return {
      decision: 'accept',
      meter,
      pause_candidates: [],
      reason: 'Not a substantial portfolio item — Clare may organise.'
    };
  }
  if (meter.status === 'unset') {
    return {
      decision: 'accept',
      meter,
      pause_candidates: [],
      reason: 'No active project limit configured. Accepting; offer to set a limit.'
    };
  }
  if (meter.status === 'ok') {
    return {
      decision: 'accept',
      meter,
      pause_candidates: [],
      reason: 'Capacity available under the active project limit.'
    };
  }
  const pause_candidates = listActiveProjects(input.projects)
    .slice(0, 5)
    .map((p) => ({ id: p.id, title: p.title }));
  return {
    decision: 'replace',
    meter,
    pause_candidates,
    reason: 'Portfolio full. Replace an active commitment, defer, or decline.'
  };
}

export function buildProductivityFunnel(input) {
  let overload_at = null;
  if (input.meter.status === 'over' || input.meter.status === 'full') {
    overload_at = 'selected';
  } else if (input.organised.length > input.selected.length + 2) {
    overload_at = 'organised';
  } else if (input.scheduled.length < input.organised.length) {
    overload_at = 'scheduled';
  }
  return {
    selected: input.selected,
    organised: input.organised,
    scheduled: input.scheduled,
    overload_at
  };
}

// ─── Hammond horizons ────────────────────────────────────────────────────────

export function buildHorizonsChain(input) {
  const { direction, areas, goals, projects, tasks, focus } = input;
  let area = null;
  let goal = null;
  let project = null;

  if (focus?.type === 'project') {
    project = projects.find((p) => p.id === focus.id) ?? null;
    goal = project?.parent_goal_id
      ? goals.find((g) => g.id === project.parent_goal_id) ?? null
      : null;
    area = goal?.parent_area_id
      ? areas.find((a) => a.id === goal.parent_area_id) ?? null
      : null;
  } else if (focus?.type === 'goal') {
    goal = goals.find((g) => g.id === focus.id) ?? null;
    area = goal?.parent_area_id
      ? areas.find((a) => a.id === goal.parent_area_id) ?? null
      : null;
  } else if (focus?.type === 'area') {
    area = areas.find((a) => a.id === focus.id) ?? null;
  }

  const projectTasks = project
    ? tasks.filter((t) => t.parent_project_id === project.id)
    : [];
  const health = project ? inspectProjectHealth(project, tasks).health : 'healthy';
  const next_actions = projectTasks
    .filter((t) => t.status === 'open' || t.status === 'in_progress')
    .filter((t) => !t.waiting_on && t.bucket !== 'someday')
    .slice(0, 8)
    .map((t) => ({ id: t.id, title: t.title }));

  return {
    purpose: direction.purpose,
    principles: direction.principles,
    vision: direction.vision,
    area: area ? { id: area.id, title: area.title } : null,
    goal: goal ? { id: goal.id, title: goal.title } : null,
    project: project
      ? {
          id: project.id,
          title: project.title,
          purpose: project.purpose || project.arc_summary || '',
          quality_bar: project.quality_bar ?? null,
          health
        }
      : null,
    next_actions
  };
}

// ─── Hammond capacity ────────────────────────────────────────────────────────

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function windowMinutes(windows) {
  return windows.reduce((sum, w) => {
    const a = minutesOf(w.start);
    const b = minutesOf(w.end);
    if (a == null || b == null || b <= a) return sum;
    return sum + (b - a);
  }, 0);
}

export function weekdayKeyForDate(dateKey) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return WEEKDAY_KEYS[d.getUTCDay()];
}

export function dayCapacity(date, profile) {
  const weekday = weekdayKeyForDate(date);
  const work = profile?.work_windows?.[weekday] ?? [];
  const protectedWindows = profile?.protected_windows?.[weekday] ?? [];
  if (!work.length) {
    const start = minutesOf(FALLBACK_WORKDAY.start);
    const end = minutesOf(FALLBACK_WORKDAY.end);
    const protectedMins = windowMinutes(protectedWindows);
    return {
      date,
      weekday,
      work_windows: [{ start: FALLBACK_WORKDAY.start, end: FALLBACK_WORKDAY.end }],
      protected_windows: protectedWindows,
      work_source: 'fallback',
      available_minutes: Math.max(0, end - start - protectedMins)
    };
  }
  return {
    date,
    weekday,
    work_windows: work,
    protected_windows: protectedWindows,
    work_source: 'profile',
    available_minutes: Math.max(0, windowMinutes(work) - windowMinutes(protectedWindows))
  };
}

export function protectedSpansForDate(date, profile) {
  const cap = dayCapacity(date, profile);
  return cap.protected_windows
    .map((w) => {
      const start = minutesOf(w.start);
      const end = minutesOf(w.end);
      if (start == null || end == null) return null;
      return {
        start,
        end,
        title: w.label || 'Protected time',
        kind: 'protected'
      };
    })
    .filter(Boolean);
}

export function buildMultiscalePlan(input) {
  return {
    quarter: (input.quarter ?? []).slice(0, 3),
    month: (input.month ?? []).slice(0, 3),
    week: (input.week ?? []).slice(0, 3).map((w) => ({
      id: w.id,
      title: w.title,
      project_ids: w.project_ids ?? []
    }))
  };
}

// ─── Hammond audit ───────────────────────────────────────────────────────────

export function threefoldWorkAudit(sessions, period) {
  const inPeriod = sessions.filter((s) => {
    const day = (s.started_at ?? '').slice(0, 10);
    return day >= period.start && day <= period.end;
  });
  const classified = inPeriod.filter(
    (s) => s.work_mode && s.work_mode_confidence !== 'unknown'
  );
  const sparse = classified.length < 3;

  const buckets = {
    predefined: { minutes: 0, count: 0 },
    reactive: { minutes: 0, count: 0 },
    defining: { minutes: 0, count: 0 }
  };
  let totalMins = 0;
  for (const s of classified) {
    const mins = s.actual_duration_minutes ?? 0;
    buckets[s.work_mode].minutes += mins;
    buckets[s.work_mode].count += 1;
    totalMins += mins;
  }

  const pct = (mins) => (totalMins > 0 ? Math.round((mins / totalMins) * 100) : null);

  return {
    period_start: period.start,
    period_end: period.end,
    total_sessions: inPeriod.length,
    classified_sessions: classified.length,
    coverage_label: `${classified.length} of ${inPeriod.length} recorded work sessions classified`,
    proportions: {
      predefined: { ...buckets.predefined, pct: pct(buckets.predefined.minutes) },
      reactive: { ...buckets.reactive, pct: pct(buckets.reactive.minutes) },
      defining: { ...buckets.defining, pct: pct(buckets.defining.minutes) }
    },
    sparse,
    sessions: inPeriod.map((s) => ({
      id: s.id,
      work_mode: s.work_mode,
      confidence: s.work_mode_confidence,
      minutes: s.actual_duration_minutes ?? 0
    }))
  };
}

export function inferWorkMode(input) {
  if (input.explicit) return { work_mode: input.explicit, confidence: 'explicit' };
  if (input.from_planning_workflow) {
    return { work_mode: 'defining', confidence: 'inferred' };
  }
  if (input.created_midday_interrupt) {
    return { work_mode: 'reactive', confidence: 'inferred' };
  }
  void input.title;
  return { work_mode: null, confidence: 'unknown' };
}

export function naturalPaceAudit(input) {
  if (input.weeks.length < 3) {
    return {
      weeks: [],
      sparse: true,
      signals: [],
      note: 'Insufficient weeks of evidence for pace analysis.'
    };
  }

  const weeks = input.weeks.map((w) => {
    const planned = input.blocks
      .filter((b) => b.date >= w.start && b.date <= w.end && b.status !== 'cancelled')
      .reduce((sum, b) => sum + b.duration_minutes, 0);
    const actual = input.sessions
      .filter((s) => {
        const day = (s.started_at ?? '').slice(0, 10);
        return day >= w.start && day <= w.end;
      })
      .reduce((sum, s) => sum + (s.actual_duration_minutes ?? 0), 0);
    const deadline_count = input.tasks.filter(
      (t) => t.due_date && t.due_date >= w.start && t.due_date <= w.end
    ).length;
    return {
      week_start: w.start,
      planned_minutes: planned,
      actual_minutes: actual,
      deadline_count,
      deadline_dense: deadline_count >= 5,
      carry_forward: 0
    };
  });

  const evidenceWeeks = weeks.filter((w) => w.planned_minutes + w.actual_minutes > 0);
  if (evidenceWeeks.length < 3) {
    return {
      weeks,
      sparse: true,
      signals: [],
      note: 'Sparse session and block data — no capacity threshold invented.'
    };
  }

  const baseline =
    input.baseline_planned_minutes ??
    Math.round(
      evidenceWeeks.reduce((s, w) => s + w.planned_minutes, 0) / evidenceWeeks.length
    );
  const signals = [];
  const highPlanned = evidenceWeeks.filter((w) => w.planned_minutes > baseline * 1.25);
  if (highPlanned.length >= 3) signals.push('sustained high planned load');
  const highActual = evidenceWeeks.filter((w) => w.actual_minutes > baseline * 1.25);
  if (highActual.length >= 3) signals.push('sustained high actual load');
  if (weeks.filter((w) => w.deadline_dense).length >= 2) {
    signals.push('deadline clusters');
  }
  const lowWeeks = evidenceWeeks.filter((w) => w.planned_minutes < baseline * 0.6);
  if (lowWeeks.length === 0 && evidenceWeeks.length >= 4) {
    signals.push('absence of lower intensity periods');
  }

  return {
    weeks,
    sparse: false,
    signals,
    note: signals.length
      ? `Pace signals: ${signals.join('; ')}.`
      : 'No sustained overload pattern against recent baseline.'
  };
}

export function attentionAudit(input) {
  const reactive = input.sessions.filter(
    (s) =>
      s.work_mode === 'reactive' &&
      (s.started_at ?? '').slice(0, 10) >= input.period.start &&
      (s.started_at ?? '').slice(0, 10) <= input.period.end
  );
  const comms = input.tasks.filter(
    (t) =>
      Array.isArray(t.tags) &&
      t.tags.includes('comms') &&
      (t.updated_at ?? '').slice(0, 10) >= input.period.start
  );
  const followUps = input.tasks.filter(
    (t) => t.follow_up_at && t.follow_up_at >= input.period.start && t.follow_up_at <= input.period.end
  );

  const patterns = [];
  if (reactive.length >= 3) {
    patterns.push({
      id: 'reactive_sessions',
      pattern: 'Repeated reactive work sessions',
      evidence_count: reactive.length,
      estimated_minutes: reactive.reduce((s, x) => s + (x.actual_duration_minutes ?? 0), 0),
      proposed_protocol: 'Batch reactive intake into one response window'
    });
  }
  if (comms.length >= 3) {
    patterns.push({
      id: 'comms_loop',
      pattern: 'Recurring communication tasks',
      evidence_count: comms.length,
      estimated_minutes: comms.reduce((s, t) => s + (t.estimated_duration ?? 15), 0),
      proposed_protocol: 'Establish a recurring follow-up sweep'
    });
  }
  if (followUps.length >= 3) {
    patterns.push({
      id: 'follow_up_churn',
      pattern: 'Repeated follow-up cycle',
      evidence_count: followUps.length,
      estimated_minutes: null,
      proposed_protocol: 'Create a single waiting sweep instead of ad-hoc pings'
    });
  }

  if (!patterns.length) {
    return {
      patterns: [],
      insufficient: true,
      note: 'Insufficient evidence for an attention protocol claim.'
    };
  }
  return {
    patterns,
    insufficient: false,
    note: `${patterns.length} attention pattern(s) with evidence.`
  };
}

// ─── Hammond depth ───────────────────────────────────────────────────────────

export function allocateDepthBudget(input) {
  const available_slots = input.windows.map((w, i) => ({
    id: w.id ?? `deep_${i + 1}`,
    date: w.date,
    start_time: w.start_time,
    minutes: w.minutes,
    project_id: null,
    project_title: null
  }));

  const byId = new Map(available_slots.map((s) => [s.id, s]));
  for (const a of input.assignments) {
    const slot = byId.get(a.slot_id);
    if (!slot) continue;
    slot.project_id = a.project_id;
    slot.project_title = a.project_title;
  }

  const allocations = available_slots.filter((s) => s.project_id);
  const unallocated = available_slots.length - allocations.length;
  return {
    available_slots,
    allocations,
    unallocated,
    note: available_slots.length
      ? `${available_slots.length} suitable deep window(s). ${allocations.length} assigned. ${unallocated} unallocated.`
      : 'No explicit deep windows found — reporting available capacity only.'
  };
}

export function goalDependencyLens(input) {
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const upstream = [];
  const downstream = [];
  for (const link of input.links) {
    if (link.to_id === input.focus.id) {
      const n = byId.get(link.from_id);
      if (n) upstream.push(n);
    }
    if (link.from_id === input.focus.id) {
      const n = byId.get(link.to_id);
      if (n) downstream.push(n);
    }
  }
  const blockers = upstream.slice(0, 2);
  const critical_chain = [...upstream.slice(0, 3), input.focus, ...downstream.slice(0, 2)];
  return {
    focus_id: input.focus.id,
    upstream,
    downstream,
    blockers,
    critical_chain
  };
}

// ─── Hammond handoff ─────────────────────────────────────────────────────────

export function createWeekMissionHandoff(partial) {
  return { type: 'hammond_week_mission', ...partial };
}

export function createClareScheduleReturn(partial) {
  return { type: 'clare_schedule_return', ...partial };
}

export function reconcileClareReturn(handoff, ret) {
  if (!ret.insufficient_capacity && !ret.unscheduled_work.length) {
    return {
      status: 'accepted',
      remove_outcomes: [],
      note: 'Clare schedule fits Hammond constraints.'
    };
  }
  const removable = handoff.selected_outcomes
    .filter((o) =>
      ret.unscheduled_work.some((u) =>
        o.project_ids.some((pid) => u.id.includes(pid) || u.title.includes(o.title))
      )
    )
    .map((o) => ({ id: o.id, title: o.title }));

  const cuts =
    removable.length > 0
      ? removable
      : handoff.linked_projects
          .filter((p) => p.decision !== 'protect')
          .slice(0, 1)
          .map((p) => ({ id: p.id, title: p.title }));

  if (!cuts.length) {
    return {
      status: 'blocked',
      remove_outcomes: [],
      note: 'Insufficient capacity and no non-protected outcome to remove.'
    };
  }
  return {
    status: 'needs_cuts',
    remove_outcomes: cuts,
    note: 'Clare reported insufficient capacity. Hammond must decide what leaves.'
  };
}

export function buildStrategicReview(input) {
  return {
    keep: input.keep_projects,
    pause: input.pause_projects.map((p) => ({ ...p, selected: false })),
    protect: input.protect_outcomes.slice(0, 3).map((p) => ({ ...p, selected: true })),
    answers: {
      moved: input.moved.join('; ') || 'None recorded',
      consumed: input.consumed.join('; ') || 'None recorded',
      stalled: input.stalled.join('; ') || 'None recorded',
      threefold: input.threefold_summary,
      deep_planned: input.deep_planned,
      deep_done: input.deep_done,
      capacity_diff: input.capacity_diff,
      threats: input.threats.join('; ') || 'None',
      portfolio_fit: input.portfolio_fit,
      exclude: input.exclude.join('; ') || 'None'
    }
  };
}
