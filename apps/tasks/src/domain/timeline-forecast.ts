/**
 * Forecast tails. P85 comes from finished tasks that have both an estimate and an actual
 * (the task's actual_duration, or the sum of its work sessions when that field is empty).
 */

export const FORECAST_MIN_SAMPLES = 20;
export const SCHOOL_DAY_MINUTES = 120;
/** A milestone has no estimate. Its tail is the domain overrun applied to one school week. */
export const MILESTONE_WEEK_DAYS = 5;

export type ForecastTask = {
  id: string;
  domain: string;
  status: string;
  estimated_duration: number | null;
  actual_duration: number | null;
};

export type ForecastSession = {
  task_id: string | null;
  actual_duration_minutes: number | null;
};

export type ForecastSample = { domain: string; ratio: number };

export function forecastSamples(tasks: ForecastTask[], sessions: ForecastSession[] = []): ForecastSample[] {
  const logged = new Map<string, number>();
  for (const session of sessions) {
    if (!session.task_id || !session.actual_duration_minutes) continue;
    logged.set(session.task_id, (logged.get(session.task_id) ?? 0) + session.actual_duration_minutes);
  }
  const samples: ForecastSample[] = [];
  for (const task of tasks) {
    if (task.status !== 'done' || !task.estimated_duration) continue;
    const actual = task.actual_duration && task.actual_duration > 0 ? task.actual_duration : logged.get(task.id) ?? 0;
    if (actual <= 0) continue;
    samples.push({ domain: task.domain, ratio: actual / task.estimated_duration });
  }
  return samples;
}

export function forecastReady(samples: ForecastSample[]): boolean {
  return samples.length >= FORECAST_MIN_SAMPLES;
}

/** Nearest-rank P85: index ceil(0.85 × n) − 1. Null when the domain has no samples. */
export function domainP85(samples: ForecastSample[], domain: string): number | null {
  const ratios = samples
    .filter((sample) => sample.domain === domain)
    .map((sample) => sample.ratio)
    .sort((a, b) => a - b);
  if (!ratios.length) return null;
  const index = Math.min(ratios.length - 1, Math.max(0, Math.ceil(0.85 * ratios.length) - 1));
  return ratios[index]!;
}

/** Extra calendar days after the planned end. A fraction under a day stays a fraction. */
export function overrunDays(estimateMinutes: number, ratio: number): number {
  return (estimateMinutes * (ratio - 1)) / SCHOOL_DAY_MINUTES;
}

export function milestoneTailDays(ratio: number): number {
  return (ratio - 1) * MILESTONE_WEEK_DAYS;
}
