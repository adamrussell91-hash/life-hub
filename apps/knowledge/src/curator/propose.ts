import type { Page } from "../domain/page";
import type { VectorHit } from "./candidates";
import { parseConfidence, RELATIONS, type Relation } from "./schema";

export const DEFAULT_JUDGE_MODEL = "claude-sonnet-4-6";

export type JudgedLink = {
  pageId: string;
  related: boolean;
  relation: Relation;
  rationale: string;
  confidence?: number;
  confidenceExplicit?: boolean;
};

export function buildProposePrompt(note: Page, candidates: VectorHit[]) {
  const list = candidates
    .map((hit, index) => {
      const book = hit.book ? ` book:${hit.book}` : "";
      return `[${index + 1}] id:${hit.pageId} title:${hit.title}${book}\n${hit.excerpt}`;
    })
    .join("\n\n");
  const crossBook = candidates.some(hit => hit.book)
    ? "\nCandidates marked with a book are notes from another book. Link across books only when the ideas genuinely connect.\n"
    : "";
  return `You are proposing links in a personal knowledge archive. Return JSON only.

Source note id:${note.id} title:${note.title}
${note.body.slice(0, 4000)}

Candidates:
${list || "(none)"}
${crossBook}
Return only JSON:
{
  "proposals": [
    {
      "pageId": "one of the candidate ids",
      "related": true,
      "relation": "related" | "builds-on" | "contrasts-with",
      "rationale": "one short sentence",
      "confidence": 0.0
    }
  ]
}

Score confidence from 0 to 1:
- 0.9+: same specific claim, mechanism, study or person; a reader of one note would clearly want the other.
- 0.8–0.9: one note directly builds on, applies or contradicts the other's specific point.
- 0.6–0.8: same topic, plausible but loose.
- below 0.6: weak or shared-vocabulary overlap.

related:false only when there is no connection. A low confidence is still a proposal: Adam reviews every score under 0.80, so do not omit a link because it is uncertain. Do not invent page ids.`;
}

export function parseJudgements(raw: string, allowedIds: Set<string>): JudgedLink[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as { proposals?: unknown };
    if (!Array.isArray(parsed.proposals)) return [];
    return parsed.proposals.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const row = item as { pageId?: unknown; related?: unknown; relation?: unknown; rationale?: unknown; confidence?: unknown };
      if (typeof row.pageId !== "string" || !allowedIds.has(row.pageId)) return [];
      if (row.related !== true) return [];
      const relation = RELATIONS.includes(row.relation as Relation) ? (row.relation as Relation) : "related";
      const rationale = typeof row.rationale === "string" ? row.rationale : "";
      const score = parseConfidence(row.confidence);
      return [{
        pageId: row.pageId,
        related: true,
        relation,
        rationale,
        ...(score.explicit ? { confidence: score.confidence, confidenceExplicit: true } : { confidenceExplicit: false }),
      }];
    });
  } catch {
    return [];
  }
}

export async function judgeLinks(input: {
  note: Page;
  candidates: VectorHit[];
  apiKey: string;
  fetchImpl?: typeof fetch;
  model?: string;
}): Promise<JudgedLink[]> {
  return (await judgeLinksDetailed(input)).links;
}

export async function judgeLinksDetailed(input: {
  note: Page;
  candidates: VectorHit[];
  apiKey: string;
  fetchImpl?: typeof fetch;
  model?: string;
}): Promise<{ links: JudgedLink[]; model: string; usage: { input_tokens: number; output_tokens: number } }> {
  const model = input.model ?? DEFAULT_JUDGE_MODEL;
  if (!input.candidates.length) return { links: [], model, usage: { input_tokens: 0, output_tokens: 0 } };
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: "user", content: buildProposePrompt(input.note, input.candidates) }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = (await response.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = payload.content?.find(block => block.type === "text")?.text ?? "";
  return {
    links: parseJudgements(text, new Set(input.candidates.map(hit => hit.pageId))),
    model,
    usage: {
      input_tokens: payload.usage?.input_tokens ?? 0,
      output_tokens: payload.usage?.output_tokens ?? 0,
    },
  };
}
