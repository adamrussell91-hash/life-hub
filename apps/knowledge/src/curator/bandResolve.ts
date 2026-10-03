import { RELATIONS, type Relation } from "./schema";

/** One-time cuts on the scored queue. 80% and above is already written. */
export function confidenceBand(confidence: number): "reject" | "rescan" | "approve" | "written" {
  if (confidence < 0.6) return "reject";
  if (confidence < 0.7) return "rescan";
  if (confidence < 0.8) return "approve";
  return "written";
}

/** A rescan links only when the model commits and the score clears 70%. */
export function rescanLinks(decision: { link?: boolean; confidence?: number }) {
  return decision.link === true && typeof decision.confidence === "number" && decision.confidence >= 0.7;
}

export type RescanDecision = {
  id: string;
  link: boolean;
  relation: Relation;
  rationale: string;
  confidence?: number;
};

export function parseRescanDecisions(raw: string, allowedIds: Set<string>): RescanDecision[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as { decisions?: unknown };
    if (!Array.isArray(parsed.decisions)) return [];
    const best = new Map<string, RescanDecision>();
    for (const item of parsed.decisions) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: unknown; link?: unknown; relation?: unknown; rationale?: unknown; confidence?: unknown };
      if (typeof row.id !== "string" || !allowedIds.has(row.id)) continue;
      const relation = RELATIONS.includes(row.relation as Relation) ? (row.relation as Relation) : "related";
      const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : undefined;
      const decision: RescanDecision = {
        id: row.id,
        link: row.link === true,
        relation,
        rationale: typeof row.rationale === "string" ? row.rationale : "",
        ...(confidence === undefined ? {} : { confidence }),
      };
      const previous = best.get(row.id);
      if (!previous || (decision.confidence ?? -1) > (previous.confidence ?? -1)) best.set(row.id, decision);
    }
    return [...best.values()];
  } catch {
    return [];
  }
}
