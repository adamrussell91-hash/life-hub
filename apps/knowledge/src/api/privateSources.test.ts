import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ getPrivateSources: vi.fn() }));
import { getPrivateSources } from "./client";
import { installOriginLabelRules, normalizeOrigins } from "../origin/normalize";
import { installNotesPlace, originsFromNotesPlace } from "../origin/notesPlace";
import { applyUnitDegreeMap, installUnitDegreeMap } from "../origin/unitDegrees";
import { loadPrivateSources, resetPrivateSources } from "./privateSources";

const HEX = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  resetPrivateSources();
  installUnitDegreeMap({});
  installOriginLabelRules();
  installNotesPlace(null);
  vi.mocked(getPrivateSources).mockReset();
});

describe("loadPrivateSources", () => {
  it("returns the catalogue once and installs the maps", async () => {
    vi.mocked(getPrivateSources).mockResolvedValue({
      catalogue: { generated: "test", degrees: [] },
      unitDegrees: { smpl5805: "Master of Sample Studies" },
      originLabels: { aliases: { "Old Sample": "Master of Sample Studies" } },
      notesPlace: { notebook: { "Sample Notebook": [HEX] }, book: {}, pd: {} },
      status: "ready",
    });
    expect(await loadPrivateSources()).toEqual({ generated: "test", degrees: [] });
    await loadPrivateSources();
    expect(getPrivateSources).toHaveBeenCalledTimes(1);
    expect(applyUnitDegreeMap([{ kind: "unit", label: "SMPL5805" }])).toContainEqual({ kind: "degree", label: "Master of Sample Studies" });
    expect(normalizeOrigins([{ kind: "degree", label: "Old Sample" }])).toEqual([{ kind: "degree", label: "Master of Sample Studies" }]);
    expect(originsFromNotesPlace(HEX)).toEqual([{ kind: "notebook", label: "Sample Notebook" }]);
  });

  it("resolves null when unavailable and tries again next time", async () => {
    vi.mocked(getPrivateSources).mockRejectedValueOnce(new Error("offline"));
    expect(await loadPrivateSources()).toBe(null);
    vi.mocked(getPrivateSources).mockResolvedValueOnce({ catalogue: null, unitDegrees: {}, notesPlace: null, status: "unavailable" });
    expect(await loadPrivateSources()).toBe(null);
    expect(getPrivateSources).toHaveBeenCalledTimes(2);
    expect(applyUnitDegreeMap([{ kind: "unit", label: "SMPL5805" }])).toEqual([{ kind: "unit", label: "SMPL5805" }]);
    expect(originsFromNotesPlace(HEX)).toEqual([]);
  });
});
