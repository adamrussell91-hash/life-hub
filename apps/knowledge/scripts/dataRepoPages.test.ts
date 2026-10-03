import { describe, expect, it } from "vitest";
import { listDataRepoPages } from "./dataRepoPages";

function file(value: unknown) {
  const text = JSON.stringify(value);
  return new Response(JSON.stringify({ sha: "s", encoding: "base64", content: btoa(text), size: text.length }));
}

describe("listDataRepoPages", () => {
  it("reads the manifest then every page file from the data repo", async () => {
    const files: Record<string, unknown> = {
      "manifest.json": [{ id: "a", path: "pages/a.json" }, { id: "b" }],
      "pages/a.json": { id: "a", title: "A" },
      "pages/b.json": { id: "b", title: "B" },
    };
    const seen: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer t");
      const name = decodeURIComponent(String(url).split("/contents/")[1]);
      seen.push(name);
      return name in files ? file(files[name]) : new Response("", { status: 404 });
    }) as typeof fetch;

    const pages = await listDataRepoPages({ GITHUB_DATA_REPO: "o/r", GITHUB_DATA_REPO_TOKEN: "t" }, fetchImpl);

    expect(pages.map(page => page.id)).toEqual(["a", "b"]);
    expect(seen).toEqual(["manifest.json", "pages/a.json", "pages/b.json"]);
  });

  it("falls back to the seed fixtures without data repo credentials", async () => {
    const pages = await listDataRepoPages({}, (() => {
      throw new Error("no network");
    }) as typeof fetch);
    expect(pages.length).toBeGreaterThan(0);
  });
});
