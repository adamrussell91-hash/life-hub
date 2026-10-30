import { installOriginLabelRules } from "../origin/normalize";
import { installNotesPlace } from "../origin/notesPlace";
import { installUnitDegreeMap } from "../origin/unitDegrees";
import type { UniversityCatalogue } from "../university/timeline/types";
import { getPrivateSources } from "./client";

let pending: Promise<UniversityCatalogue | null> | null = null;

/**
 * Fetch the Knowledge hub's private reference data once per session and install it: the
 * unit → degree map and degree-label rules (pills), and the notebook / book / PD place map.
 * Resolves to the university catalogue for the timeline, or null; a failure is tried again
 * on the next call.
 */
export function loadPrivateSources(): Promise<UniversityCatalogue | null> {
  pending ??= getPrivateSources()
    .then(response => {
      installUnitDegreeMap(response?.unitDegrees ?? {});
      installOriginLabelRules(response?.originLabels ?? {});
      if (response?.notesPlace) installNotesPlace(response.notesPlace);
      if (response?.status !== "ready" || !response.catalogue || !response.notesPlace) pending = null;
      return response?.catalogue ?? null;
    })
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}

/** The timeline's catalogue (same fetch as `loadPrivateSources`). */
export const loadUniversityCatalogue = loadPrivateSources;

/** Tests only. */
export function resetPrivateSources() {
  pending = null;
}
