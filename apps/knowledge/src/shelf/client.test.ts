import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../api/config";
import { getShelf, savePlacements } from "./client";

describe("shelf client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the shelf endpoint once under the knowledge API base", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { books: [], placements: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getShelf();
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toBe(`${API_BASE}/shelf`);
    expect(url).not.toMatch(/\/api\/knowledge\/api\//);
  });

  it("surfaces the server's validation message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: "validation_error", message: "Page must be a whole number from 1 to 5000." } }), { status: 400 })));
    await expect(savePlacements([{ pageId: "p1", page: 1 }])).rejects.toThrow(/whole number/);
  });
});
