import { describe, expect, it } from "vitest";
import { urlWatchHtml } from "./urlWatchHtml";

describe("urlWatchHtml", () => {
  it("returns nothing when the page has no watched URLs", () => {
    expect(urlWatchHtml([], "ready")).toBe("");
    expect(urlWatchHtml(undefined, "ready")).toBe("");
  });

  it("shows changed, unchanged, and unavailable without guessing", () => {
    const html = urlWatchHtml(
      [
        { url: "https://example.com/a", status: "changed" },
        { url: "https://example.com/b", status: "unchanged" },
        { url: "https://example.com/c", status: "unavailable" },
      ],
      "ready",
    );
    expect(html).toContain("External URL watch");
    expect(html).toContain("Changed");
    expect(html).toContain("Unchanged");
    expect(html).toContain("Unavailable");
    expect(html).toContain('data-watch-status="changed"');
  });

  it("is fail-visible when the poll itself cannot run", () => {
    const html = urlWatchHtml([], "unavailable");
    expect(html).toContain("URL watch is unavailable.");
    expect(html).not.toContain("<ul>");
  });
});
