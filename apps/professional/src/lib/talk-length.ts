/**
 * Reads how long a talk or activity ran, as typed: "0.2", "0.2h", "20m",
 * "20 min", "1h 30m", "1:30", "90 mins". Returns hours (2 dp), null for an
 * empty box, or undefined when the text can't be read.
 */
export function parseTalkLength(raw: string): number | null | undefined {
  const text = raw.trim().toLowerCase().replace(',', '.');
  if (!text) return null;
  let hours: number | undefined;
  const clock = text.match(/^(\d{1,2}):(\d{1,2})$/);
  const parts = text.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:ins?|inutes?)?)?$/);
  if (clock) {
    hours = Number(clock[1]) + Number(clock[2]) / 60;
  } else if (/^\d*\.?\d+$/.test(text)) {
    hours = Number(text);
  } else if (parts && (parts[1] || parts[2])) {
    hours = Number(parts[1] ?? 0) + Number(parts[2] ?? 0) / 60;
  }
  if (hours === undefined || !Number.isFinite(hours) || hours < 0 || hours > 24) return undefined;
  return Math.round(hours * 100) / 100;
}

/** Shows a talk length: under an hour in minutes ("20 min"), else hours ("1.5 h"). */
export function formatTalkLength(hours: number): string {
  if (hours > 0 && hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours} h`;
}

/** What goes back in the box when editing: minutes under an hour, else hours. */
export function talkLengthInputValue(hours: number | null): string {
  if (hours == null) return '';
  return formatTalkLength(hours).replace(' min', 'm').replace(' h', 'h');
}
