/** Strength and physique targets from config/targets.yml `forecast`. No second copy of the numbers. */
export function forecastConfig(targetsConfig) {
  return targetsConfig?.forecast ?? null;
}

export function bodyCompositionTargets(targetsConfig) {
  return forecastConfig(targetsConfig)?.body_composition ?? null;
}

export function strengthTargets(targetsConfig) {
  const strength = forecastConfig(targetsConfig)?.strength ?? null;
  const lifts = Array.isArray(strength?.lifts) ? strength.lifts : [];
  return {
    deadline: typeof strength?.deadline === 'string' ? strength.deadline : null,
    lifts: lifts
      .map(lift => ({
        id: lift.id ?? null,
        label: lift.label ?? lift.exercise ?? null,
        exercise: lift.exercise ?? null,
        target: Number(lift.e1rm_kg)
      }))
      .filter(lift => lift.exercise && Number.isFinite(lift.target))
  };
}
