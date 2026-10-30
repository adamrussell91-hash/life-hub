import { ORIGIN_KINDS, type Origin, type OriginKind } from "../domain/page";

export const ORIGIN_KIND_LABELS: Record<OriginKind, string> = {
  degree: "Degree",
  unit: "Unit",
  notebook: "Notebook",
  book: "Book",
  pd: "PD",
};

export function isOriginKind(value: string): value is OriginKind {
  return (ORIGIN_KINDS as readonly string[]).includes(value);
}

export function normalizeOriginLabel(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

const BASE_DROPPED_ORIGIN_LABELS = [
  "csp-eligible postgraduate degree",
  "trimester 1 2027 entry",
  "notebook cover",
];

let DROPPED_ORIGIN_LABELS = new Set(BASE_DROPPED_ORIGIN_LABELS);
let ORIGIN_LABEL_ALIASES: Record<string, string> = {};

/**
 * Personal label rules: old degree names that now read as another title, and programmes whose
 * pills are dropped. They live with the university source in the private data repo and are
 * installed at runtime; until then labels pass through unchanged.
 */
export function installOriginLabelRules(rules: { aliases?: Record<string, string>; dropped?: string[] } = {}) {
  const aliases: Record<string, string> = {};
  for (const [from, to] of Object.entries(rules.aliases ?? {})) {
    if (typeof to === "string" && to.trim()) aliases[normalizeOriginLabel(from).toLowerCase()] = to;
  }
  ORIGIN_LABEL_ALIASES = aliases;
  DROPPED_ORIGIN_LABELS = new Set([
    ...BASE_DROPPED_ORIGIN_LABELS,
    ...(rules.dropped ?? []).map(label => normalizeOriginLabel(label).toLowerCase()),
  ]);
}

export function isDroppedOriginLabel(label: string) {
  return DROPPED_ORIGIN_LABELS.has(normalizeOriginLabel(label).toLowerCase());
}

function canonicalOriginLabel(label: string) {
  const trimmed = normalizeOriginLabel(label);
  return ORIGIN_LABEL_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function originKey(origin: Origin) {
  return `${origin.kind}:${canonicalOriginLabel(origin.label).toLowerCase()}`;
}

export function pageOrigins(page: { origins?: Origin[] }) {
  return page.origins ?? [];
}

export function normalizeOrigins(origins: Origin[]) {
  const seen = new Set<string>();
  const out: Origin[] = [];
  for (const origin of origins) {
    const label = canonicalOriginLabel(origin.label);
    if (!label || !isOriginKind(origin.kind) || isDroppedOriginLabel(label)) continue;
    const key = `${origin.kind}:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: origin.kind, label });
  }
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
}

export function addOrigin(existing: Origin[], next: Origin) {
  return normalizeOrigins([...existing, next]);
}

export function removeOrigin(existing: Origin[], target: Origin) {
  const key = originKey(target);
  return existing.filter(item => originKey(item) !== key);
}

export function mergeOrigins(...groups: Origin[][]) {
  return normalizeOrigins(groups.flat());
}

export function originSearchText(origins: Origin[] | undefined) {
  return pageOrigins({ origins }).flatMap(origin => [ORIGIN_KIND_LABELS[origin.kind], origin.label]);
}

export function pageMatchesOrigins(page: { origins?: Origin[] }, required: Origin[]) {
  const have = new Set(normalizeOrigins(pageOrigins(page)).map(originKey));
  return required.every(want => have.has(originKey(want)));
}
