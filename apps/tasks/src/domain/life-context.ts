/**
 * Turns Life Hub's central-node.md into the operational slice Clare is
 * allowed to reason over: energy, mood, upcoming events, active goals,
 * and anything routed directly to Clare. Medical/mental-health detail in
 * "Current Constraints & Priorities" and the health parts of "Long-Term
 * Trends" never leaves this parser — by design, not by prompt instruction.
 */

export type LifeContextDigest = {
  today_status: string | null;
  this_week: string | null;
  this_month: string | null;
  clare_directives: string[];
  as_of: string | null;
};

const ALLOWED_HEADINGS: Record<
  string,
  keyof Pick<LifeContextDigest, 'today_status' | 'this_week' | 'this_month'>
> = {
  "today's status": 'today_status',
  'this week': 'this_week',
  'this month': 'this_month'
};

function normalizeHeading(heading: string): string {
  return heading
    .replace(/^[^\w(]+/, '')
    .replace(/\s*\([^()]*\)\s*$/, '')
    .trim()
    .toLowerCase();
}

function splitSections(markdown: string): Array<{ heading: string; body: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      current = { heading: heading[1]!.trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return sections.map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }));
}

/**
 * Today's Status is a compact per-agent dashboard, and by the doc's own
 * writing rules its Health line is a one-line clinical flag, not the full
 * Constraints detail — but Clare doesn't need clinical detail to plan
 * tasks, so it's dropped here too. Energy/mood/exercise/flags stay.
 */
function stripHealthLine(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\*\*health:?\*\*/i.test(line.trim()))
    .join('\n')
    .trim();
}

function firstHeadingDate(heading: string): string | null {
  const match = /\(([^()]+)\)\s*$/.exec(heading);
  return match ? match[1]!.trim() : null;
}

/** Cross-Agent Coordination lines routed to or from Clare — the only part of that section she is allowed to see. */
function extractClareDirectives(markdown: string): string[] {
  const section = splitSections(markdown).find(
    (s) => normalizeHeading(s.heading) === 'cross-agent coordination'
  );
  if (!section) return [];
  const routedToOrFromClare = /\bclare\b\s*(?:→|->)|(?:→|->)\s*\bclare\b/i;
  return section.body
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0 && routedToOrFromClare.test(line))
    .slice(0, 10);
}

/** Extract only the operational digest — never the Constraints or health-trajectory sections. */
export function buildLifeContextDigest(markdown: string): LifeContextDigest {
  const sections = splitSections(markdown);
  const digest: LifeContextDigest = {
    today_status: null,
    this_week: null,
    this_month: null,
    clare_directives: extractClareDirectives(markdown),
    as_of: null
  };

  for (const section of sections) {
    const key = ALLOWED_HEADINGS[normalizeHeading(section.heading)];
    if (!key || !section.body) continue;
    digest[key] = key === 'today_status' ? stripHealthLine(section.body) : section.body;
    if (key === 'today_status' && !digest.as_of) {
      digest.as_of = firstHeadingDate(section.heading);
    }
  }

  return digest;
}

export function lifeContextToPromptBlock(digest: LifeContextDigest | null): string | null {
  if (!digest) return null;
  const parts: string[] = [];
  if (digest.today_status) {
    parts.push(`Today's status (${digest.as_of ?? 'date unknown'}):\n${digest.today_status}`);
  }
  if (digest.this_week) parts.push(`This week:\n${digest.this_week}`);
  if (digest.this_month) parts.push(`This month:\n${digest.this_month}`);
  if (digest.clare_directives.length) {
    parts.push(
      `Routed to/from Clare on the network:\n${digest.clare_directives.map((l) => `- ${l}`).join('\n')}`
    );
  }
  return parts.length ? parts.join('\n\n') : null;
}
