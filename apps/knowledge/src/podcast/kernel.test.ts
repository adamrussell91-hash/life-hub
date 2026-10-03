import { afterEach, describe, expect, it, vi } from "vitest";
import { ANTHROPIC_TIMEOUT_MS, completePrompt, parseEpisodeCommission } from "./kernel";

const env = {
  ARCHIVE: { get: async () => null, put: async () => undefined },
  ANTHROPIC_API_KEY: "sk-test",
};

describe("completePrompt", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("aborts a hanging Anthropic call instead of waiting forever", async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completePrompt(env, "hello")).rejects.toThrow(/timed out after 90s/);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(ANTHROPIC_TIMEOUT_MS).toBe(90_000);
  });

  it("reports a non-ok response as an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(completePrompt(env, "hello")).rejects.toThrow("Anthropic error 404");
  });

  it("returns the first text block on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "done" }] }),
      }),
    );
    await expect(completePrompt(env, "hello")).resolves.toBe("done");
  });
});

describe("parseEpisodeCommission", () => {
  it("keeps a broadcast's source pages, deduped and trimmed of junk", () => {
    const commission = parseEpisodeCommission({
      mode: "broadcast",
      modeDial: { book: "The Enigma of Reason" },
      sourcePageIds: ["a", "b", "a", "", 4],
    });
    expect(commission.mode).toBe("broadcast");
    expect(commission.sourcePageIds).toEqual(["a", "b"]);
  });

  it("leaves sourcePageIds off ordinary commissions", () => {
    expect(parseEpisodeCommission({ mode: "recap" })).not.toHaveProperty("sourcePageIds");
  });
});
