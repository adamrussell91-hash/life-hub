import { aggregateNutrition, hasRecoveryBonus, resolveDayType } from '../core/aggregate.js';
import { getDayTargets } from '../core/targets.js';
import { comparePeriods } from '../core/trends.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';
import {
  activeChallengesForDate,
  tallyChallenge
} from '../core/nutrition-challenges.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
export const PROTEIN_TREND_CONFIG = { unit: 'g', good: 'up', thresholds: [5, 15, 30] };

export function polyphenolVsAim(score, aim) {
  const s = Number(score) || 0;
  const a = Number(aim) || 0;
  if (a <= 0) return { delta: 0, label: 'at aim', colour: 'muted' };
  const delta = s - a;
  if (delta === 0) return { delta: 0, label: 'at aim', colour: 'green' };
  if (delta > 0) return { delta, label: `+${delta} vs aim`, colour: 'green' };
  return { delta, label: `−${Math.abs(delta)} vs aim`, colour: 'muted' };
}

const EMPTY_TARGETS = {
  calories: 0,
  protein_g: 0,
  fat_ceiling_g: 0,
  sodium_ceiling_mg: 0,
  calcium_target_mg: 0,
  polyphenol_daily_aim: 0,
  meal_protein_g: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, dessert: 0, minimum: 0 }
};

function dailyNutrition(events, date, targetsConfig) {
  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : null;
  const proteinTarget = targets?.protein_g ?? 0;
  const fatCeiling = targets?.fat_ceiling_g ?? 0;

  return {
    date,
    calories: nutrition.calories,
    protein_g: nutrition.protein_g,
    fat_g: nutrition.fat_g,
    carbs_g: nutrition.carbs_g,
    proteinTarget,
    fatCeiling,
    hitProtein: proteinTarget > 0 && nutrition.protein_g >= proteinTarget,
    overFatCeiling: fatCeiling > 0 && nutrition.fat_g > fatCeiling,
    proteinPct: proteinTarget > 0
      ? Math.round((nutrition.protein_g / proteinTarget) * 100)
      : 0
  };
}

// Where a meal sits on the clock. Logged HH:MM wins; otherwise the meal type's usual
// slot, flagged so the chart can show it is an estimate rather than a logged time.
const DEFAULT_MEAL_MINUTES = { breakfast: 480, lunch: 750, snack: 930, dinner: 1140, dessert: 1230 };
export function mealMinutes(meal) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(meal?.time ?? ''));
  if (match) {
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    if (minutes >= 0 && minutes < 1440) return { minutes, timeKnown: true };
  }
  return { minutes: DEFAULT_MEAL_MINUTES[meal?.meal] ?? 720, timeKnown: false };
}

const USUAL_DAYS = 7;
const USUAL_MIN_DAYS = 3;
const USUAL_LOOKBACK = 28;
const USUAL_STEP = 30;

// Average running protein total at each half hour across recent logged days.
function buildUsualClimb(mealDays, date) {
  const earliest = addCalendarDays(date, -USUAL_LOOKBACK);
  const recent = [...mealDays.keys()]
    .filter(day => day < date && day >= earliest)
    .sort()
    .slice(-USUAL_DAYS);
  if (recent.length < USUAL_MIN_DAYS) return null;
  const timed = recent.map(day => mealDays.get(day).map(meal => ({
    minutes: mealMinutes(meal).minutes,
    protein_g: Number(meal.protein_g) || 0
  })));
  const points = [];
  for (let minutes = 360; minutes <= 1380; minutes += USUAL_STEP) {
    const sum = timed.reduce((total, meals) => total + meals
      .filter(meal => meal.minutes <= minutes)
      .reduce((dayTotal, meal) => dayTotal + meal.protein_g, 0), 0);
    points.push({ minutes, protein_g: Math.round((sum / timed.length) * 10) / 10 });
  }
  return { days: recent.length, points };
}

const averageProtein = days => (
  days.length === 0 ? 0 : days.reduce((sum, day) => sum + day.protein_g, 0) / days.length
);

export function buildNutritionModel({ events, targetsConfig, date, nutritionChallenges = null, history = null, freshness = null }) {
  if (!date) throw new RangeError('Nutrition display date is unavailable');

  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : EMPTY_TARGETS;

  const week = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date)
    .map(day => dailyNutrition(events, day, targetsConfig));
  const month = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date)
    .map(day => dailyNutrition(events, day, targetsConfig));
  const previousWeek = enumerateDateKeys(
    addCalendarDays(date, -(2 * WEEK_DAYS - 1)),
    addCalendarDays(date, -WEEK_DAYS)
  ).map(day => dailyNutrition(events, day, targetsConfig));

  const mealDays = new Map();
  for (const event of events) {
    const record = event?.record;
    if (record?.type !== 'meal' || record.date > date) continue;
    const meals = mealDays.get(record.date) ?? [];
    const body = String(event.body ?? '').trim();
    const notes = typeof record.notes === 'string' ? record.notes.trim() : '';
    meals.push({
      ...record,
      id: record.id || event.path || `${record.date}-${meals.length}`,
      body,
      notes,
      summary: body.split('\n').find(Boolean) || notes || `${record.meal} logged`
    });
    mealDays.set(record.date, meals);
  }
  const dayTargets = day => {
    if (!targetsConfig) return { protein_g: 0, fat_ceiling_g: 0, calories: 0 };
    const set = getDayTargets(targetsConfig, day, resolveDayType(events, day), hasRecoveryBonus(events, day));
    return { protein_g: set.protein_g, fat_ceiling_g: set.fat_ceiling_g, calories: set.calories };
  };
  const mealHistory = {
    ...history,
    days: [...mealDays].sort(([a], [b]) => a.localeCompare(b)).map(([day, meals]) => ({
      date: day,
      meals: meals.sort((a, b) => String(a.time ?? '24:00').localeCompare(String(b.time ?? '24:00'))),
      totals: aggregateNutrition(meals, day),
      targets: dayTargets(day),
      carbsKnown: meals.every(meal => Number.isFinite(meal.carbs_g))
    }))
  };

  const mealsToday = events
    .filter(event => event?.record?.type === 'meal' && event.record.date === date)
    .slice()
    .sort((left, right) => String(left.record.time ?? '').localeCompare(String(right.record.time ?? '')))
    .map(event => {
      const record = event.record;
      const bodyLine = String(event.body ?? '').trim().split('\n').find(Boolean) ?? '';
      const notes = typeof record.notes === 'string' ? record.notes.trim() : '';
      return {
        meal: record.meal,
        time: record.time ?? null,
        ...mealMinutes(record),
        calories: record.calories ?? 0,
        protein_g: record.protein_g ?? 0,
        fat_g: record.fat_g ?? 0,
        carbs_g: record.carbs_g ?? null,
        notes,
        summary: bodyLine || notes || `${record.meal} logged`
      };
    });

  let advice = '';
  for (let i = mealsToday.length - 1; i >= 0; i--) {
    if (mealsToday[i].notes) {
      advice = mealsToday[i].notes;
      break;
    }
  }
  if (!advice) {
    for (let i = mealsToday.length - 1; i >= 0; i--) {
      if (mealsToday[i].summary && !/logged$/i.test(mealsToday[i].summary)) {
        advice = mealsToday[i].summary;
        break;
      }
    }
  }

  const challenges = activeChallengesForDate(nutritionChallenges, date).map(challenge => {
    const tally = tallyChallenge(challenge);
    const days = enumerateDateKeys(challenge.start, challenge.end).map(day => ({
      date: day,
      result: challenge.days?.[day]?.result ?? 'pending',
      note: challenge.days?.[day]?.note ?? null,
      isToday: day === date
    }));
    return {
      id: challenge.id,
      title: challenge.title,
      rule: challenge.rule,
      start: challenge.start,
      end: challenge.end,
      status: challenge.status,
      tally,
      days
    };
  });

  return {
    date,
    nutrition,
    dayType,
    targets,
    week,
    month,
    previousWeek,
    overFatCeiling: targets.fat_ceiling_g > 0 && nutrition.fat_g > targets.fat_ceiling_g,
    polyphenolVsAim: polyphenolVsAim(nutrition.polyphenol_score, targets.polyphenol_daily_aim),
    mealsToday,
    mealHistory,
    usualClimb: buildUsualClimb(mealDays, date),
    freshness,
    advice,
    challenges,
    macroSplit: {
      calories: nutrition.calories,
      caloriesTarget: targets.calories,
      protein_g: nutrition.protein_g,
      proteinTarget: targets.protein_g,
      fat_g: nutrition.fat_g,
      fatCeiling: targets.fat_ceiling_g,
      proteinPct: targets.protein_g > 0 ? Math.round((nutrition.protein_g / targets.protein_g) * 100) : 0,
      fatPct: targets.fat_ceiling_g > 0 ? Math.round((nutrition.fat_g / targets.fat_ceiling_g) * 100) : 0,
      energyPct: targets.calories > 0 ? Math.round((nutrition.calories / targets.calories) * 100) : 0
    },
    proteinTrend: comparePeriods(averageProtein(week), averageProtein(previousWeek), PROTEIN_TREND_CONFIG)
  };
}
