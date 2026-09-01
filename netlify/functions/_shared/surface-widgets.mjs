import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { capabilitiesRoot } from './capabilities/registry.mjs';

export const WIDGETS_PREFIX = 'data/widgets/';
export const WIDGET_PATH = /^data\/widgets\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.json$/;
export const MAX_SURFACE_WIDGETS = 24;

const APPROVED_TEMPLATES = new Set(['challenge-progress', 'meal-plan-week']);

const MEAL_PLAN_DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MEAL_PLAN_DAY_LABELS = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun'
};

export function isWidgetPath(path) {
  return typeof path === 'string' && WIDGET_PATH.test(path);
}

export function loadApprovedTemplateIds() {
  const root = join(capabilitiesRoot(), 'widgets', 'templates');
  if (!existsSync(root)) return [...APPROVED_TEMPLATES];
  const ids = new Set(APPROVED_TEMPLATES);
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(root, name), 'utf8'));
      if (parsed?.approved === true && typeof parsed.id === 'string') ids.add(parsed.id);
    } catch {
      /* skip malformed template defs */
    }
  }
  return [...ids];
}

export function parseWidgetBlob(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (typeof parsed.template_id !== 'string' || !parsed.template_id.trim()) return null;
  if (typeof parsed.title !== 'string' || !parsed.title.trim()) return null;
  if (!parsed.props || typeof parsed.props !== 'object' || Array.isArray(parsed.props)) return null;
  return {
    id: typeof parsed.id === 'string' ? parsed.id : null,
    template_id: parsed.template_id.trim(),
    title: parsed.title.trim(),
    props: parsed.props,
    owner_agent: typeof parsed.owner_agent === 'string' ? parsed.owner_agent : null,
    created_at: typeof parsed.created_at === 'string' ? parsed.created_at : null,
    status: typeof parsed.status === 'string' ? parsed.status : null,
    path: null
  };
}

export function normalizeChallengeProgressWidget(widget) {
  if (!widget || widget.template_id !== 'challenge-progress') return null;
  const props = widget.props ?? {};
  const title = typeof props.title === 'string' && props.title.trim()
    ? props.title.trim()
    : widget.title;
  const pctRaw = Number(props.progress_pct);
  const progress_pct = Number.isFinite(pctRaw)
    ? Math.min(100, Math.max(0, Math.round(pctRaw)))
    : 0;
  const subtitle = typeof props.subtitle === 'string' && props.subtitle.trim()
    ? props.subtitle.trim()
    : null;
  const challenge_id = typeof props.challenge_id === 'string' ? props.challenge_id.trim() : null;
  return {
    ...widget,
    title,
    props: {
      challenge_id,
      title,
      progress_pct,
      ...(subtitle ? { subtitle } : {})
    }
  };
}

function mealPlanDayText(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const parts = ['breakfast', 'lunch', 'dinner']
    .map(slot => {
      const text = typeof value[slot] === 'string' ? value[slot].trim() : '';
      return text ? `${slot[0].toUpperCase()}${slot.slice(1)}: ${text}` : '';
    })
    .filter(Boolean);
  return parts.join(' · ');
}

export function normalizeMealPlanWeekWidget(widget) {
  if (!widget || widget.template_id !== 'meal-plan-week') return null;
  const props = widget.props ?? {};
  const week_id = typeof props.week_id === 'string' && props.week_id.trim()
    ? props.week_id.trim()
    : widget.title;
  const title = typeof props.title === 'string' && props.title.trim()
    ? props.title.trim()
    : (week_id ? `Week ${week_id}` : widget.title);
  const rawMeals = props.meals && typeof props.meals === 'object' && !Array.isArray(props.meals)
    ? props.meals
    : {};
  const days = MEAL_PLAN_DAY_ORDER.map(key => {
    const direct = rawMeals[key] ?? rawMeals[key.toUpperCase()] ?? rawMeals[MEAL_PLAN_DAY_LABELS[key]];
    const text = mealPlanDayText(direct);
    if (!text) return null;
    return { key, label: MEAL_PLAN_DAY_LABELS[key], text };
  }).filter(Boolean);
  const notes = typeof props.notes === 'string' && props.notes.trim()
    ? props.notes.trim()
    : null;
  if (!days.length && !notes) return null;
  return {
    ...widget,
    title,
    props: {
      week_id,
      title,
      meals: rawMeals,
      days,
      ...(notes ? { notes } : {})
    }
  };
}

export function normalizeSurfaceWidget(widget) {
  if (!widget) return null;
  switch (widget.template_id) {
    case 'challenge-progress':
      return normalizeChallengeProgressWidget(widget);
    case 'meal-plan-week':
      return normalizeMealPlanWeekWidget(widget);
    default:
      return null;
  }
}
