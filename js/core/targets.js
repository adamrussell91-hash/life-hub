export function resolveTargetSet(config, dateKey) {
  const sets = [...config.target_sets].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const found = sets.filter(set => set.valid_from <= dateKey).at(-1);
  if (!found) throw new RangeError(`No target set covers ${dateKey}`);
  return found;
}

export function getDayTargets(config, dateKey, dayType = 'movement', recovery = false) {
  const set = resolveTargetSet(config, dateKey);
  return {
    calories: set.calories[dayType] + (recovery ? set.calories.recovery_bonus : 0),
    protein_g: recovery ? set.protein.recovery_daily : set.protein.daily,
    fat_ceiling_g: set.fat_ceiling_g,
    sodium_ceiling_mg: set.sodium_ceiling_mg,
    calcium_target_mg: set.calcium_target_mg,
    polyphenol_daily_aim: set.polyphenol_daily_aim,
    meal_protein_g: {
      breakfast: set.protein.breakfast,
      lunch: set.protein.lunch,
      dinner: set.protein.dinner,
      snack: set.protein.snack,
      minimum: set.protein.min_per_meal
    }
  };
}
