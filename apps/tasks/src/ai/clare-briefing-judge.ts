import { CLARE_PROPOSAL_MODEL } from '@/ai/models';
import { createAnthropicMessage } from '@/ai/anthropic';
import type { ClareBriefing } from '@/domain/clare-desk';
import type { ClareProtocolId } from '@/domain/clare-protocols';

export const CLARE_BRIEFING_SYSTEM = `You are Clare DeMind on Tasks Hub, writing a briefing.

Voice: fast, warm, Australian English, competent core. Chaotic surface, competent core. No guilt lectures, no exclamation marks, no motivational language. If a deadline was yesterday: "So that was due yesterday. Moving on."

You are given "facts" — a briefing already computed correctly from Adam's real tasks (lead, sections of real task lines, flags, closer). The facts are ground truth: never invent a task, date, or number that is not already in them, and never drop a section. Your only job is to write better prose for lead, flags, and closer than the mechanical default — sharper, more specific to what's actually there, less like a template. Leave sections exactly as given; do not rewrite the task lines themselves.

Use life_context (energy, mood, upcoming events, active goals) when present to make the lead or a flag sharper — e.g. don't just say "busy day", notice why. Never invent life_context content that was not given to you. Do not mention life_context unless it actually changes what you'd say.

Stay under 300 words total across lead + flags + closer. End a morning-sweep lead/closer pair with the sense of "that is your day, dump away" — keep the existing closer unless you have a genuinely better one that fits the same job.

Return JSON only:
{"lead":"...","flags":["..."],"closer":"..."}
The flags array must have exactly the same number of entries as the facts' flags, in the same order — you are rewriting their text, not changing how many there are.`;

export type ClareBriefingJudgment = {
  lead: string | null;
  flags: string[] | null;
  closer: string | null;
  ok: boolean;
};

export type ClareBriefingJudge = (input: {
  protocol_id: ClareProtocolId;
  facts: ClareBriefing;
  life_context: string | null;
}) => Promise<ClareBriefingJudgment>;

function cleanLine(value: unknown, max: number): string | null {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 4) return null;
  return text.slice(0, max);
}

export function parseClareBriefingJudgment(
  text: string,
  expectedFlagCount: number
): ClareBriefingJudgment {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced?.[1]?.trim() ?? trimmed;
  const start = payload.indexOf('{');
  const end = payload.lastIndexOf('}');
  if (start < 0 || end <= start) return { lead: null, flags: null, closer: null, ok: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.slice(start, end + 1));
  } catch {
    return { lead: null, flags: null, closer: null, ok: false };
  }

  const body = parsed as { lead?: unknown; flags?: unknown; closer?: unknown };
  const lead = cleanLine(body.lead, 400);
  const closer = cleanLine(body.closer, 200);
  const flagsRaw = Array.isArray(body.flags) ? body.flags : [];
  const flags =
    flagsRaw.length === expectedFlagCount
      ? flagsRaw.map((f) => cleanLine(f, 240)).filter((f): f is string => f !== null)
      : null;

  return {
    lead,
    flags: flags && flags.length === expectedFlagCount ? flags : null,
    closer,
    ok: true
  };
}

export function createClareBriefingJudge(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): ClareBriefingJudge {
  const model = options.model ?? CLARE_PROPOSAL_MODEL;
  return async ({ protocol_id, facts, life_context }) => {
    const text = await createAnthropicMessage({
      apiKey: options.apiKey,
      model,
      system: CLARE_BRIEFING_SYSTEM,
      user: JSON.stringify({
        protocol_id,
        life_context,
        facts: {
          lead: facts.lead,
          sections: facts.sections,
          flags: facts.flags.map((f) => f.text),
          closer: facts.closer
        }
      }),
      maxTokens: 700,
      fetchImpl: options.fetchImpl
    });
    return parseClareBriefingJudgment(text, facts.flags.length);
  };
}

export function defaultClareBriefingJudge(
  env: NodeJS.ProcessEnv = process.env
): ClareBriefingJudge | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return createClareBriefingJudge({
    apiKey,
    model: env.CLARE_PROPOSAL_MODEL?.trim() || undefined
  });
}
