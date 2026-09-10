/** ISO weekday: 1=Mon … 7=Sun. v1 callers use 1–5 only. */
export function utcIsoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return day === 0 ? 7 : day;
}

export function generateScheduleDates(input: {
  startDate: string;
  meetingDays: number[];
  lessonCount: number;
}): string[] {
  const days = [...new Set(input.meetingDays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (days.length === 0 || input.lessonCount < 1) {
    throw new Error('Invalid meetingDays or lessonCount');
  }

  const out: string[] = [];
  let [y, m, d] = input.startDate.split('-').map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d));

  while (out.length < input.lessonCount) {
    const ymd = formatYmd(cursor);
    if (days.includes(utcIsoWeekday(ymd))) {
      out.push(ymd);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
