/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Avatar tint for a set of initials: one of five pastel pairs (the mockups' avatar colours). */
export function avatarTone(initials: string): number {
  return ([...initials].reduce((a, c) => a + c.charCodeAt(0), 0) % 5) + 1;
}

/** m:ss */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
