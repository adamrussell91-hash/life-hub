import type { DayMeta, IsoDate } from '@/types';

/** Upsert or clear a day's subtitle / Penelope prompt in `trip.days`. */
export function upsertDayMeta(
  days: DayMeta[],
  cityId: string,
  date: IsoDate,
  patch: { subtitle?: string | null; penelope_prompt?: string | null }
): DayMeta[] {
  const index = days.findIndex((d) => d.city_id === cityId && d.date === date);
  const prev = index >= 0 ? days[index]! : { city_id: cityId, date };
  const subtitle =
    patch.subtitle === undefined
      ? prev.subtitle
      : patch.subtitle === null || !patch.subtitle.trim()
        ? undefined
        : patch.subtitle.trim();
  const penelope_prompt =
    patch.penelope_prompt === undefined
      ? prev.penelope_prompt
      : patch.penelope_prompt === null || !patch.penelope_prompt.trim()
        ? undefined
        : patch.penelope_prompt.trim();

  if (!subtitle && !penelope_prompt) {
    return index < 0 ? days : days.filter((_, i) => i !== index);
  }

  const next: DayMeta = { city_id: cityId, date, ...(subtitle ? { subtitle } : {}), ...(penelope_prompt ? { penelope_prompt } : {}) };
  if (index < 0) return [...days, next];
  return days.map((d, i) => (i === index ? next : d));
}
