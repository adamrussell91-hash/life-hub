import { escapeHtml } from "../lib/dom";

export type DecisionTraceStep = {
  dateKey?: string | null;
  chosen?: string | null;
  reasoning?: string | null;
  body?: string | null;
};

export type DecisionTrace = {
  title?: string;
  decisionId?: string | null;
  steps?: DecisionTraceStep[];
};

export function decisionTraceHtml(
  traces: DecisionTrace[] | undefined,
  status?: string | null,
): string {
  if (status === "unavailable") {
    return `<section class="wiki-links decision-traces" aria-label="How this changed">
              <h3>How this changed</h3>
              <p class="decision-traces__unavailable">Decision history is unavailable.</p>
            </section>`;
  }
  const list = Array.isArray(traces) ? traces.filter(trace => Array.isArray(trace.steps) && trace.steps.length) : [];
  if (!list.length) return "";
  return `<section class="wiki-links decision-traces" aria-label="How this changed">
              <h3>How this changed</h3>
              ${list.map(trace => {
                const heading = escapeHtml(trace.title || trace.decisionId || "Decision");
                const steps = (trace.steps ?? []).map(step => {
                  const bit = [step.dateKey, step.chosen || step.reasoning || step.body].filter(Boolean).join(" — ");
                  return `<li>${escapeHtml(bit)}</li>`;
                }).join("");
                return `<article class="decision-trace"><p class="decision-trace__title">${heading}</p><ol>${steps}</ol></article>`;
              }).join("")}
            </section>`;
}
