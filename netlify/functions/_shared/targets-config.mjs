export const TARGETS_CONFIG = {
  target_sets: [
    {
      valid_from: '2020-01-01',
      calories: { movement: 1660, workout_30: 1900, workout_45_60: 2200, recovery_bonus: 200 },
      protein: { daily: 120, recovery_daily: 140, breakfast: 30, lunch: 30, dinner: 40, snack: 20, min_per_meal: 25 },
      fat_ceiling_g: 50,
      sodium_ceiling_mg: 2000,
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
      weight_kg_min: 78,
      weight_kg_max: 82,
      body_fat_pct_min: 8,
      body_fat_pct_max: 10,
      body_fat_pct_tight: 8,
      shoulder_waist_ratio: 1.6
    },
    strength: {
      deadline: '2026-10-31',
      lifts: [
        { id: 'chest-e1rm', label: 'Chest e1RM', exercise: 'Bar Press', e1rm_kg: 65 },
        { id: 'arms-e1rm', label: 'Arms e1RM', exercise: 'Cable Bar Wide Grip Curl', e1rm_kg: 60 },
        { id: 'back-e1rm', label: 'Back e1RM', exercise: 'Reverse Wide Grip Bent Over Row', e1rm_kg: 47 }
      ]
    }
  }
};
