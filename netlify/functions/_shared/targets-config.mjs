import { load } from 'js-yaml';

// Neutral, synthetic template. Live personal targets live only in the private
// data repo's config/targets.yml, which chat reads at runtime through
// resolveTargetsConfig. This mirror must equal the public config/targets.yml.
export const TARGETS_CONFIG = {
  target_sets: [
    {
      valid_from: '2020-01-01',
      calories: { movement: 2000, workout_30: 2200, workout_45_60: 2400, recovery_bonus: 200 },
      protein: { daily: 110, recovery_daily: 130, breakfast: 25, lunch: 30, dinner: 35, snack: 20, min_per_meal: 20 },
      fat_ceiling_g: 70,
      sodium_ceiling_mg: 2300,
      calcium_target_mg: 1000,
      polyphenol_daily_aim: 10
    }
  ],
  trend_thresholds: {
    weight_kg: [0.2, 0.5, 1.0],
    body_fat_pct: [0.2, 0.5, 1.0],
    skeletal_muscle_kg: [0.1, 0.3, 0.6],
    measurement_cm: [0.3, 0.8, 1.5],
    mood_score: [1, 2, 3]
  },
  forecast: {
    body_composition: {
      weight_kg_min: 70,
      weight_kg_max: 75,
      body_fat_pct_min: 12,
      body_fat_pct_max: 15,
      body_fat_pct_tight: 12,
      shoulder_waist_ratio: 1.5
    },
    strength: {
      deadline: '2027-06-30',
      lifts: [
        { id: 'chest-e1rm', label: 'Chest e1RM', exercise: 'Bar Press', e1rm_kg: 55 },
        { id: 'arms-e1rm', label: 'Arms e1RM', exercise: 'Cable Bar Wide Grip Curl', e1rm_kg: 45 },
        { id: 'back-e1rm', label: 'Back e1RM', exercise: 'Reverse Wide Grip Bent Over Row', e1rm_kg: 50 }
      ]
    }
  }
};

function isUsableTargets(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.target_sets) && value.target_sets.length);
}

/**
 * Parse the private config/targets.yml text (or an already parsed object).
 * Falls back to the neutral bundled template when absent or invalid.
 * `forecastOnly` accepts a file that only carries the `forecast` block.
 */
export function resolveTargetsConfig(source, fallback = TARGETS_CONFIG, { forecastOnly = false } = {}) {
  if (source == null || source === '') return fallback;
  try {
    const parsed = typeof source === 'string' ? load(source) : source;
    if (forecastOnly) return parsed && typeof parsed === 'object' && parsed.forecast ? parsed : fallback;
    return isUsableTargets(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
