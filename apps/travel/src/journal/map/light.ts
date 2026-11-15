/**
 * The light on the map for a time of day: clear in the day, warm towards
 * sunset, deep blue at night. It is a tint laid over the map, so the map's
 * own style is never rebuilt.
 */

export type LightName = 'night' | 'dawn' | 'day' | 'golden' | 'dusk';

export interface MapLight {
  name: LightName;
  /** An rgba() colour, ready for CSS. */
  tint: string;
}

const LIGHTS: Record<LightName, string> = {
  night: 'rgba(12, 22, 64, 0.5)',
  dawn: 'rgba(255, 196, 150, 0.2)',
  day: 'rgba(255, 255, 255, 0)',
  golden: 'rgba(255, 168, 76, 0.24)',
  dusk: 'rgba(92, 62, 140, 0.34)',
};

const minutes = (hhmm: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const value = Number(m[1]) * 60 + Number(m[2]);
  return value >= 0 && value < 24 * 60 ? value : null;
};

/**
 * @param localTime the moment's time, "HH:mm". Unknown reads as day.
 * @param sunset that day's sunset where the moment is, "HH:mm". Defaults to 18:30.
 */
export function lightFor(localTime: string | null | undefined, sunset?: string | null): MapLight {
  const at = minutes(localTime);
  if (at === null) return { name: 'day', tint: LIGHTS.day };
  const set = minutes(sunset) ?? 18 * 60 + 30;
  let name: LightName;
  if (at < 5 * 60) name = 'night';
  else if (at < 7 * 60 + 30) name = 'dawn';
  else if (at < set - 75) name = 'day';
  else if (at < set + 10) name = 'golden';
  else if (at < set + 60) name = 'dusk';
  else name = 'night';
  return { name, tint: LIGHTS[name] };
}
