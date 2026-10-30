import type { Origin } from "../domain/page";
import { mergeOrigins } from "./normalize";

/**
 * Unit code → degree title, for degree pills on unit-tagged pages. The real map is personal
 * and lives in the private data repo with the university timeline; it is installed at runtime
 * by `loadUniversityCatalogue()`. Until then the map is empty and pages show unit pills only.
 */
let unitDegreeLabels: Record<string, string> = {};

/** Replace the installed map. Codes are matched case-insensitively. */
export function installUnitDegreeMap(map: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [code, degree] of Object.entries(map ?? {})) {
    if (typeof degree === "string" && degree.trim()) next[code.toUpperCase()] = degree;
  }
  unitDegreeLabels = next;
}

export function unitDegreeMap(): Readonly<Record<string, string>> {
  return unitDegreeLabels;
}

export function applyUnitDegreeMap(
  origins: Origin[],
  unitDegreeMap: Record<string, string> = unitDegreeLabels,
): Origin[] {
  const extra: Origin[] = [];
  for (const origin of origins) {
    if (origin.kind !== "unit") continue;
    const degree = unitDegreeMap[origin.label.toUpperCase()];
    if (degree) extra.push({ kind: "degree", label: degree });
  }
  return mergeOrigins(origins, extra);
}
