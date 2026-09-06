/**
 * Hammond week inventory — last-week recap + next-week forward plan.
 * Built from Life event files Hammond already loaded (30-day CN window)
 * plus open Tasks / upcoming Teaching. Path-presence digests are not a week.
 */

import {
  addCalendarDays,
  formatWeekday,
  getSydneyWeekStart,
  isCalendarDate
} from '../../../apps/life/js/core/time.js';
import { extractThisWeek } from '../../../apps/life/js/core/constraints.js';

export const WEEK_PACK_UNAVAILABLE_MARKER =
  'Week pack UNAVAILABLE — Life week files failed to load. Do not invent last week. Say the inventory is unavailable.';

const WEEKLY_PLANNING_RE = [
  /weekly\s*review/i,
  /weekly\s*recap/i,
  /week\s+recap/i,
  /recap\s+(?:the\s+|this\s+)?week/i,
  /week(?:ly)?\s+(?:forward\s+)?plan/i,
  /plan\s+(?:the\s+|my\s+|for\s+)?(?:next|coming)\s+week/i,
  /sunday\s+(?:night\s+)?(?:review|planning|recap)/i,
  /how\s+(?:was|did)\s+(?:this|the)\s+week/i,
  /week\s+ahead/i,
  /week\s+that\s+(?:just\s+)?(?:was|happened)/i
];

export function isWeeklyPlanningTurn({ message, protocolId } = {}) {
  if (protocolId === 'weekly-review') return true;
  if (typeof message !== 'string' || !message.trim()) return false;
  return WEEKLY_PLANNING_RE.some(re => re.test(message));
}

export function hammondWeekWindows(today) {
  if (!isCalendarDate(today)) return null;
  const thisWeekMon = getSydneyWeekStart(today);
  const thisWeekSun = addCalendarDays(thisWeekMon, 6);
  const nextWeekMon = addCalendarDays(thisWeekMon, 7);
  const nextWeekSun = addCalendarDays(thisWeekMon, 13);
  const tomorrow = addCalendarDays(today, 1);
  return {
    today,
    recapStart: thisWeekMon,
    recapEnd: today,
    forwardStart: tomorrow,
    forwardEnd: nextWeekSun,
    thisWeekMon,
    thisWeekSun,
    nextWeekMon,
    nextWeekSun
  };
}

function asRecord(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.record && typeof item.record === 'object') return item.record;
  if (item.type || item.date) return item;
  return null;
}

function inRange(date, start, end) {
  return typeof date === 'string' && date >= start && date <= end;
}

function recordsOf(events, type, start, end) {
  return (Array.isArray(events) ? events : [])
    .map(asRecord)
    .filter(record => record?.type === type && inRange(record.date, start, end))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function isOpenTask(task) {
  if (!task || typeof task !== 'object') return false;
  if (task.status === 'done' || task.bucket === 'done' || task.completed_at) return false;
  return typeof task.title === 'string' && task.title.trim().length > 0;
}

function formatRange(start, end) {
  return `${formatWeekday(start)} ${start} – ${formatWeekday(end)} ${end}`;
}

function clip(text, max = 80) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function summariseFitness(workouts) {
  const completed = workouts.filter(w => w.status === 'completed');
  const planned = workouts.filter(w => w.status === 'planned');
  const skipped = workouts.filter(w => w.status === 'skipped');
  const titles = completed
    .map(w => `${w.date} ${clip(w.title || 'session', 40)}`)
    .slice(0, 8);
  return {
    logged: workouts.length,
    completed: completed.length,
    planned: planned.length,
    skipped: skipped.length,
    titles,
    empty: workouts.length === 0
  };
}

function summariseNutrition(meals) {
  const byDate = new Map();
  for (const meal of meals) {
    const day = byDate.get(meal.date) ?? { protein: 0, meals: 0 };
    day.meals += 1;
    day.protein += Number(meal.protein_g) || 0;
    byDate.set(meal.date, day);
  }
  const days = [...byDate.keys()].sort();
  const proteins = days.map(date => byDate.get(date).protein).filter(v => v > 0);
  const avg = proteins.length
    ? Math.round(proteins.reduce((sum, v) => sum + v, 0) / proteins.length)
    : null;
  return {
    days_logged: days.length,
    meals: meals.length,
    avg_protein_g: avg,
    dates: days,
    empty: meals.length === 0
  };
}

function summariseDiary(entries) {
  const lines = entries.slice(0, 8).map(entry => {
    const moods = Array.isArray(entry.moods) && entry.moods.length
      ? entry.moods.join('/')
      : (entry.mood ?? '');
    const note = typeof entry.system_note === 'string' ? clip(entry.system_note, 90) : '';
    return {
      date: entry.date,
      mood: moods || null,
      mood_score: entry.mood_score ?? null,
      system_note: note || null
    };
  });
  return {
    days: entries.length,
    lines,
    empty: entries.length === 0,
    omitted: Math.max(0, entries.length - lines.length)
  };
}

function summariseSessions(sessions) {
  return {
    count: sessions.length,
    titles: sessions.slice(0, 5).map(s => `${s.date}${s.title ? ` ${clip(s.title, 40)}` : ''}`),
    empty: sessions.length === 0
  };
}

function summariseBody(records) {
  const last = records[records.length - 1];
  if (!last) return { empty: true };
  const bits = [];
  if (last.weight_kg != null) bits.push(`${last.weight_kg}kg`);
  if (last.body_fat_pct != null) bits.push(`${last.body_fat_pct}% bf`);
  return {
    empty: false,
    date: last.date,
    label: bits.join(', ') || clip(last.title || last.notes || 'body log', 40)
  };
}

function summariseTasks(tasks, { start, end, today }) {
  const open = (Array.isArray(tasks) ? tasks : []).filter(isOpenTask);
  const due = open
    .filter(task => task.due_date && task.due_date >= start && task.due_date <= end)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const overdue = open
    .filter(task => task.due_date && task.due_date < today)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const undated = open.filter(task => !task.due_date).length;
  return {
    open_count: open.length,
    due: due.slice(0, 8).map(task => ({
      title: task.title.trim(),
      due_date: task.due_date,
      priority: task.priority ?? null
    })),
    overdue: overdue.slice(0, 6).map(task => ({
      title: task.title.trim(),
      due_date: task.due_date
    })),
    undated,
    closed_this_week: 'not_in_open_task_store',
    omitted_due: Math.max(0, due.length - 8),
    omitted_overdue: Math.max(0, overdue.length - 6)
  };
}

function summariseLessons(lessons, classes, start, end) {
  const classById = new Map(
    (Array.isArray(classes) ? classes : [])
      .filter(cls => cls?.id)
      .map(cls => [cls.id, cls])
  );
  const inWindow = (Array.isArray(lessons) ? lessons : [])
    .filter(item => item && item.delivery_status !== 'cancelled' && inRange(item.date, start, end))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    count: inWindow.length,
    rows: inWindow.slice(0, 8).map(item => {
      const cls = classById.get(item.class_id);
      const code = cls?.code;
      const title = item.title || item.display_title;
      return `${item.date}${code ? ` ${code}` : ''}${title ? ` ${clip(title, 40)}` : ''}`;
    }),
    omitted: Math.max(0, inWindow.length - 8),
    empty: inWindow.length === 0
  };
}

function thisWeekNote(centralNodeMarkdown) {
  if (typeof centralNodeMarkdown !== 'string' || !centralNodeMarkdown.trim()) {
    return { empty: true, missing: true, body: '' };
  }
  const body = extractThisWeek(centralNodeMarkdown);
  return {
    empty: !body,
    missing: false,
    body: clip(body.replace(/\n+/g, ' · '), 220)
  };
}

export function buildHammondWeekPack({
  events = [],
  tasks = [],
  lessons = [],
  classes = [],
  centralNodeMarkdown = '',
  today,
  loadErrors = {}
} = {}) {
  const windows = hammondWeekWindows(today);
  if (!windows) {
    return { ok: false, error: 'invalid_date', store: 'cross_hub' };
  }

  const lifeUnavailable = Boolean(loadErrors.events || loadErrors.life);
  const recapEvents = lifeUnavailable ? [] : events;
  const fitness = summariseFitness(recordsOf(recapEvents, 'workout', windows.recapStart, windows.recapEnd));
  const nutrition = summariseNutrition(recordsOf(recapEvents, 'meal', windows.recapStart, windows.recapEnd));
  const diary = summariseDiary(recordsOf(recapEvents, 'diary', windows.recapStart, windows.recapEnd));
  const vera = summariseSessions(recordsOf(recapEvents, 'mind_session', windows.recapStart, windows.recapEnd));
  const body = summariseBody([
    ...recordsOf(recapEvents, 'weight', windows.recapStart, windows.recapEnd),
    ...recordsOf(recapEvents, 'composition', windows.recapStart, windows.recapEnd),
    ...recordsOf(recapEvents, 'measurements', windows.recapStart, windows.recapEnd)
  ]);
  const medical = recordsOf(recapEvents, 'medical', windows.recapStart, windows.recapEnd);

  return {
    ok: true,
    store: 'cross_hub',
    kind: 'calculation',
    windows,
    life_unavailable: lifeUnavailable,
    recap: {
      fitness,
      nutrition,
      diary,
      vera,
      body,
      medical_visits: medical.length
    },
    forward: {
      tasks: summariseTasks(loadErrors.tasks ? [] : tasks, {
        start: windows.forwardStart,
        end: windows.forwardEnd,
        today: windows.today
      }),
      tasks_unavailable: Boolean(loadErrors.tasks),
      teaching: summariseLessons(
        loadErrors.scheduledLessons || loadErrors.lessons ? [] : lessons,
        loadErrors.classes ? [] : classes,
        windows.forwardStart,
        windows.forwardEnd
      ),
      teaching_unavailable: Boolean(loadErrors.scheduledLessons || loadErrors.lessons || loadErrors.classes),
      teaching_recap: summariseLessons(
        loadErrors.scheduledLessons || loadErrors.lessons ? [] : lessons,
        loadErrors.classes ? [] : classes,
        windows.recapStart,
        windows.recapEnd
      )
    },
    cn_this_week: thisWeekNote(centralNodeMarkdown),
    how_to_read:
      'Deterministic week inventory. Recap is Mon–today of the current Sydney week. Forward is tomorrow through next Sunday. Do not invent rows. Closed tasks are not in the open-task store.'
  };
}

export function formatHammondWeekPackForPrompt(pack) {
  if (!pack || pack.ok === false) {
    return pack?.error === 'invalid_date'
      ? 'Week pack UNAVAILABLE — invalid date. Do not invent last week.'
      : WEEK_PACK_UNAVAILABLE_MARKER;
  }

  const w = pack.windows;
  const lines = [
    `Week pack (Sydney weeks — facts only, not a Central Node audit):`,
    `Recap ${formatRange(w.recapStart, w.recapEnd)}. Forward ${formatRange(w.forwardStart, w.forwardEnd)}.`
  ];

  if (pack.life_unavailable) {
    lines.push('Last week Life files: UNAVAILABLE — do not invent nutrition/fitness/mind rows.');
  } else {
    const { fitness, nutrition, diary, vera, body, medical_visits } = pack.recap;
    lines.push(
      fitness.empty
        ? '- Fitness: no sessions in this recap window.'
        : `- Fitness: ${fitness.completed} completed, ${fitness.planned} planned, ${fitness.skipped} skipped${fitness.titles.length ? ` (${fitness.titles.join('; ')})` : ''}.`
    );
    lines.push(
      nutrition.empty
        ? '- Nutrition: no meals in this recap window.'
        : `- Nutrition: ${nutrition.days_logged} days logged, ${nutrition.meals} meals${nutrition.avg_protein_g != null ? `, avg protein ~${nutrition.avg_protein_g}g/day` : ''}.`
    );
    if (diary.empty) {
      lines.push('- Diary: no entries in this recap window (metadata only — do not quote prose).');
    } else {
      const diaryBits = diary.lines.map(row => {
        const bits = [row.date];
        if (row.mood) bits.push(`mood ${row.mood}`);
        if (row.mood_score != null) bits.push(`score ${row.mood_score}`);
        if (row.system_note) bits.push(row.system_note);
        return bits.join(' ');
      });
      lines.push(`- Diary: ${diary.days} day${diary.days === 1 ? '' : 's'} (${diaryBits.join('; ')})${diary.omitted ? ` [${diary.omitted} more omitted]` : ''}.`);
    }
    lines.push(
      vera.empty
        ? '- Vera: no mind_session in this recap window.'
        : `- Vera: ${vera.count} session${vera.count === 1 ? '' : 's'}${vera.titles.length ? ` (${vera.titles.join('; ')})` : ''}.`
    );
    lines.push(
      body.empty
        ? '- Body: no composition/weight/tape in this recap window.'
        : `- Body: ${body.date} ${body.label}.`
    );
    if (medical_visits) lines.push(`- Medical: ${medical_visits} visit file${medical_visits === 1 ? '' : 's'} in this recap window.`);
  }

  const recapTeaching = pack.forward.teaching_recap;
  if (pack.forward.teaching_unavailable) {
    lines.push('- Teaching last week: UNAVAILABLE — do not invent lessons.');
  } else if (!recapTeaching.empty) {
    lines.push(`- Teaching last week: ${recapTeaching.rows.join('; ')}${recapTeaching.omitted ? ` [${recapTeaching.omitted} more omitted]` : ''}.`);
  }

  lines.push('Next week:');
  if (pack.forward.tasks_unavailable) {
    lines.push('- Tasks: UNAVAILABLE — do not invent due/overdue rows.');
  } else {
    const { tasks } = pack.forward;
    const due = tasks.due.map(t => `${t.due_date} ${t.title}`).join('; ') || 'none dated in the forward window';
    const overdue = tasks.overdue.map(t => `${t.due_date} ${t.title}`).join('; ');
    lines.push(`- Tasks: ${tasks.open_count} open; due ${due}.${tasks.omitted_due ? ` [${tasks.omitted_due} more due omitted]` : ''}`);
    if (overdue) {
      lines.push(`- Overdue still open: ${overdue}.${tasks.omitted_overdue ? ` [${tasks.omitted_overdue} more omitted]` : ''}`);
    }
    lines.push('- Tasks closed this week: not in the open-task store (do not invent completions).');
  }

  if (pack.forward.teaching_unavailable) {
    lines.push('- Teaching ahead: UNAVAILABLE — do not invent lessons.');
  } else if (pack.forward.teaching.empty) {
    lines.push('- Teaching ahead: no lessons dated in the forward window.');
  } else {
    lines.push(`- Teaching ahead: ${pack.forward.teaching.rows.join('; ')}${pack.forward.teaching.omitted ? ` [${pack.forward.teaching.omitted} more omitted]` : ''}.`);
  }

  if (pack.cn_this_week.missing) {
    lines.push('- CN This Week: section missing.');
  } else if (pack.cn_this_week.empty) {
    lines.push('- CN This Week: empty — this review should write next week\'s compact plan there (Confirm-class replace).');
  } else {
    lines.push(`- CN This Week currently: ${pack.cn_this_week.body}`);
  }

  lines.push(
    'How to use: recap facts first (moved / stalled / overdue), then plan the forward window. One lock at the end. Do not start a Central Node audit or ask a gateway intake question unless Adam asked for an audit. Persist a Weekly Review Governance Log entry; patch This Week when the plan locks.'
  );
  return lines.join('\n');
}

export function getWeekReview({
  events = [],
  tasks = [],
  lessons = [],
  classes = [],
  centralNodeMarkdown = '',
  today,
  loadErrors = {}
} = {}) {
  const pack = buildHammondWeekPack({
    events,
    tasks,
    lessons,
    classes,
    centralNodeMarkdown,
    today,
    loadErrors
  });
  return {
    ...pack,
    prompt_text: formatHammondWeekPackForPrompt(pack)
  };
}

export function getWeekReviewSchema() {
  return {
    name: 'get_week_review',
    description:
      'Deterministic last-week recap + next-week forward plan from Life files, open Tasks, and upcoming Teaching. Required for weekly review / Sunday planning. Do not invent a week.',
    input_schema: { type: 'object', properties: {} }
  };
}
