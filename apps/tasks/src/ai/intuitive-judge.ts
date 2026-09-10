import { INTUITIVE_SCAN_MODEL } from '@/ai/models';
import { createAnthropicMessage } from '@/ai/anthropic';
import type { IntuitiveDigest } from '@/domain/intuitive-digest';
import type { StressPattern } from '@/domain/stress';

export const INTUITIVE_SCAN_SYSTEM = `You are Clare DeMind reviewing Adam’s upcoming work on Tasks Hub.

Your job is compound judgment, not the rules he already has. Do not flag “due tomorrow”, “this is urgent”, a single overdue card, or a day that merely has four dues — those detectors already ran and their hits are in already_detected.

Look at the whole picture. Flag early when something large, ambiguous, or deep-focus sits next to a crowded stretch; when several individually fine items will collide; when travel/teaching/admin stack; when the calendar implies more time than the work will actually take.

Voice: Australian English, specific texture, no guilt. Never say “things are busy”.
Authority: flags only. Do not change due dates, priorities, or suggest silent writes.

Return JSON only:
{"flags":[{"pattern_description":"specific texture","source_project_or_task_id":"id or null","fingerprint":"intuitive:stable-key"}]}

0–5 flags. Empty array if nothing compound. Fingerprints must start with intuitive: and stay stable for the same situation this week (use entity ids, not the clock).`;

export type IntuitiveJudgeFlag = {
  pattern_description: string;
  source_project_or_task_id: string | null;
  fingerprint: string;
};

export type IntuitiveJudgment = {
  flags: IntuitiveJudgeFlag[];
  model: string | null;
};

export type IntuitiveJudge = (digest: IntuitiveDigest) => Promise<IntuitiveJudgment>;

const GENERIC =
  /^(things are busy|you('re| are) busy|heavy week|lots to do|busy week ahead)\.?$/i;

function normalizeFingerprint(
  raw: string | undefined,
  sourceId: string | null,
  description: string
): string {
  const cleaned = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_+-]+/g, '')
    .slice(0, 96);
  if (cleaned.startsWith('intuitive:') && cleaned.length > 12) return cleaned;
  const fallback = (sourceId ?? description.replace(/\s+/g, '-').slice(0, 40)).toLowerCase();
  return `intuitive:${fallback}`;
}

function readSourceId(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === 'null' || text === 'undefined') return null;
  return text;
}

/** Pull a flags array out of model text (raw JSON or fenced). */
export function parseIntuitiveJudgment(text: string): IntuitiveJudgeFlag[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced?.[1]?.trim() ?? trimmed;
  const start = payload.indexOf('{');
  const end = payload.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.slice(start, end + 1));
  } catch {
    return [];
  }
  const rows = (parsed as { flags?: unknown }).flags;
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const flags: IntuitiveJudgeFlag[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const body = row as Record<string, unknown>;
    const description = String(body.pattern_description ?? '').replace(/\s+/g, ' ').trim();
    if (description.length < 24 || GENERIC.test(description)) continue;
    const source = readSourceId(body.source_project_or_task_id);
    const fingerprint = normalizeFingerprint(
      typeof body.fingerprint === 'string' ? body.fingerprint : undefined,
      source,
      description
    );
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    flags.push({
      pattern_description: description,
      source_project_or_task_id: source,
      fingerprint
    });
    if (flags.length >= 5) break;
  }
  return flags;
}

export function judgmentToPatterns(judgment: IntuitiveJudgment): StressPattern[] {
  return judgment.flags.map((flag) => ({
    pattern_kind: 'intuitive' as const,
    pattern_description: flag.pattern_description,
    source_project_or_task_id: flag.source_project_or_task_id,
    fingerprint: flag.fingerprint
  }));
}

export function createHaikuJudge(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): IntuitiveJudge {
  const model = options.model ?? INTUITIVE_SCAN_MODEL;
  return async (digest) => {
    const text = await createAnthropicMessage({
      apiKey: options.apiKey,
      model,
      system: INTUITIVE_SCAN_SYSTEM,
      user: JSON.stringify(digest),
      maxTokens: 800,
      fetchImpl: options.fetchImpl
    });
    return { flags: parseIntuitiveJudgment(text), model };
  };
}

/**
 * Dev-only stand-in when no API key is set. Looks for compound pressure
 * (large piece + crowded stretch) so local Network can be exercised.
 * Production Netlify skips the AI pass instead of using this.
 */
export const localStubJudge: IntuitiveJudge = async (digest) => {
  const crowdedDays = digest.load.filter((day) => day.tasks >= 4 || day.minutes >= 240);
  const huge = [...digest.tasks]
    .filter((task) => (task.minutes ?? 0) >= 90)
    .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))[0];
  const upcoming = digest.week.tasks;
  const flags: IntuitiveJudgeFlag[] = [];

  if (huge && (upcoming >= 5 || crowdedDays.length > 0)) {
    const crowd = crowdedDays[0];
    const stretch = crowd
      ? `${crowd.display} already packs ${crowd.tasks} items`
      : `the next week already has ${upcoming} open dues`;
    flags.push({
      pattern_description: `“${huge.title}” looks like a ${huge.minutes}-minute lift, and ${stretch} — flag it before the week swallows the start.`,
      source_project_or_task_id: huge.id,
      fingerprint: `intuitive:${huge.id}:crowded-week`
    });
  }

  const deep = digest.projects.filter((project) => project.energy === 'deep_focus');
  if (deep.length >= 2) {
    const [left, right] = deep;
    flags.push({
      pattern_description: `${left!.title} and ${right!.title} both need deep-focus time while other work is already stacked — start protecting one of them now, not the night before.`,
      source_project_or_task_id: left!.id,
      fingerprint: `intuitive:${[left!.id, right!.id].sort().join('+')}:deep-stack`
    });
  }

  return { flags: flags.slice(0, 5), model: 'local-stub' };
};

export function defaultIntuitiveJudge(env: NodeJS.ProcessEnv = process.env): IntuitiveJudge | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return createHaikuJudge({ apiKey, model: env.INTUITIVE_SCAN_MODEL?.trim() || undefined });
}
