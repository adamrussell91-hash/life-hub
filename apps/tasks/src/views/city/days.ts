/** Glance days the URL can ask for. Unseen days are not listed on the picker. */
export const KNOWN_GOLDEN_DAYS = [
  { key: 'sunday', label: 'Sunday 16:30' },
  { key: 'suspended', label: 'Suspended service' },
  { key: 'deleted', label: 'Deleted yesterday' },
  { key: 'no-checkin', label: 'No check-in morning' }
] as const;

const ALL_KEYS = new Set<string>([...KNOWN_GOLDEN_DAYS.map((day) => day.key), 'unseen-1', 'unseen-2']);

export type GoldenKey = 'sunday' | 'suspended' | 'deleted' | 'no-checkin' | 'unseen-1' | 'unseen-2';

export type GoldenRequest = { kind: 'list' } | { kind: 'unknown'; value: string } | { kind: 'day'; key: GoldenKey };

export function goldenRequest(params: URLSearchParams): GoldenRequest {
  if (!params.has('golden')) return { kind: 'list' };
  const value = params.get('golden') ?? '';
  if (value === '') return { kind: 'list' };
  if (ALL_KEYS.has(value)) return { kind: 'day', key: value as GoldenKey };
  return { kind: 'unknown', value };
}

export function cityNeedsWideScreen(width: number): boolean {
  return width < 768;
}

/** `&test=1`: the glance test screen, with neutral labels and no hub chrome (V10). */
export function isTestMode(params: URLSearchParams): boolean {
  return params.get('test') === '1';
}

/** Fixed shuffle, so the letter says nothing about the day or its place in the list. */
const TEST_LETTERS: Record<GoldenKey, string> = {
  'no-checkin': 'A',
  'unseen-2': 'B',
  sunday: 'C',
  'unseen-1': 'D',
  deleted: 'E',
  suspended: 'F'
};

export function testLetter(key: GoldenKey): string {
  return TEST_LETTERS[key];
}
