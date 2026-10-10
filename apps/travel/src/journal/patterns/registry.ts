import kulHref from './kul.svg?url';
import istHref from './ist.svg?url';

export interface JournalPattern {
  href: string;
  label: string;
}

const PATTERNS: Record<string, JournalPattern> = {
  kul: {
    href: kulHref,
    label: 'Kuala Lumpur — batik botanical',
  },
  ist: {
    href: istHref,
    label: 'Istanbul — Iznik tulip and carnation',
  },
};

/** Resolves bundled leg pattern artwork; unknown ids return null (use neutral / pattern-off). */
export function getPattern(patternId: string): JournalPattern | null {
  return PATTERNS[patternId] ?? null;
}
