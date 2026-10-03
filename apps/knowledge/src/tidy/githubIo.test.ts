import { describe, expect, it, vi } from "vitest";
import type { Page } from "../domain/page";
import { tidyPageDirect } from "./githubIo";
import { getContent, putContent } from "./githubContent";

vi.mock("./githubContent", async importOriginal => ({
  ...(await importOriginal<typeof import("./githubContent")>()),
  getContent: vi.fn(),
  putContent: vi.fn(),
}));

const page: Page = {
  id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  title: "Caesar",
  area: "notes",
  tags: ["Philosophy Knowledge and Society"],
  body: "Messy\n\n\n\ntext",
  connected: [],
  attachments: [],
  source: "hub",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
  schema_version: 1,
};

describe("tidyPageDirect", () => {
  it("rewrites the note and saves it like Edit", async () => {
    vi.mocked(getContent).mockImplementation(async (repo, token, file) => {
      expect(repo).toBe("owner/repo");
      expect(token).toBe("tok");
      if (file === `pages/${page.id}.json`) return { sha: "p1", text: JSON.stringify(page) };
      if (file === "manifest.json") return { sha: "m1", text: "[]" };
      return null;
    });
    vi.mocked(putContent).mockResolvedValue(undefined);
    const saved = await tidyPageDirect({
      id: page.id,
      repo: "owner/repo",
      token: "tok",
      apiKey: "key",
      prompt: "tidy",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: '```json\n{"tags":["Philosophy Knowledge and Society"],"body":"Cleaned body","title":null}\n```',
              },
            ],
          }),
        ),
    });
    expect(saved.body).toBe("Cleaned body");
    expect(vi.mocked(putContent).mock.calls.map(call => call[2])).toEqual([
      `pages/${page.id}.json`,
      "manifest.json",
    ]);
    const manifest = JSON.parse(vi.mocked(putContent).mock.calls[1]?.[3] as string) as Array<{ tags: string[] }>;
    expect(manifest[0]?.tags).toEqual(["Philosophy Knowledge and Society"]);
  });

  it("fails clearly when Claude does not return tidy JSON", async () => {
    vi.mocked(getContent).mockResolvedValue({ sha: "p1", text: JSON.stringify(page) });
    await expect(
      tidyPageDirect({
        id: page.id,
        repo: "owner/repo",
        token: "tok",
        apiKey: "key",
        prompt: "tidy",
        fetchImpl: async () => new Response(JSON.stringify({ content: [{ type: "text", text: "nope" }] })),
      }),
    ).rejects.toThrow("Claude didn’t return a usable tidy");
  });
});

describe("savePageRecord", () => {
  it("refuses to overwrite a manifest it cannot read", async () => {
    const { savePageRecord } = await vi.importActual<typeof import("./githubContent")>("./githubContent");
    const put = vi.fn(async () => undefined);
    await expect(
      savePageRecord(page, {
        getContent: async file => (file === "manifest.json" ? { sha: "m", text: "{not json" } : null),
        putContent: put,
      }),
    ).rejects.toThrow(/unreadable/);
    expect(put.mock.calls.map(call => (call as unknown[])[0])).toEqual([`pages/${page.id}.json`]);
  });
});
