import { describe, expect, it } from "vitest";
import { catalogueNoticeHtml } from "./rail";

describe("catalogueNoticeHtml", () => {
  it("stays quiet while the catalogue is current", () => {
    expect(catalogueNoticeHtml(undefined)).toBe("");
    expect(catalogueNoticeHtml({ stale: false, pending: 0, caughtUpAt: "2026-10-03T10:00:00Z" })).toBe("");
  });

  it("warns, with the backlog, when the catalogue has fallen behind", () => {
    const html = catalogueNoticeHtml({ stale: true, pending: 613, caughtUpAt: "2026-08-15T02:52:00Z" });
    expect(html).toContain('role="status"');
    expect(html).toContain("613 notes waiting");
    expect(html).toContain("last up to date");
  });

  it("says when it has never synced", () => {
    expect(catalogueNoticeHtml({ stale: true, pending: 0 })).toContain("not synced yet");
  });
});
