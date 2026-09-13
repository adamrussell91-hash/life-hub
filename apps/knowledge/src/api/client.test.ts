import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatWriteDroppedError,
  fetchSession,
  getPage,
  KnowledgeApiError,
  listPages,
  login,
  replacePageRelationships,
  runChat,
  runCoach,
  savePage,
  signAttachment,
  startTidyIntake,
  tidyEndpoint,
  tidyPage,
} from "./client";
import { API_BASE } from "./config";

describe("api client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts login with credentials and does not cache the response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(login("secret")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth-login"),
      expect.objectContaining({ method: "POST", credentials: "include", cache: "no-store" }),
    );
  });

  it("treats a 401 login as an invalid passphrase", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(login("nope")).resolves.toBe(false);
  });

  it("confirms the session cookie was stored", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true }) }));
    await expect(fetchSession()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth-session"),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
  });

  it("lists pages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "p" }] }));
    await expect(listPages()).resolves.toEqual([{ id: "p" }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pages"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("unwraps a Life coach envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, data: { reply: "State the claim.", research: { findings: [] } } }),
      }),
    );
    await expect(
      runCoach({ messages: [{ role: "user", content: "Help" }], workingThesis: "A claim" }),
    ).resolves.toMatchObject({ reply: "State the claim." });
  });

  it("unwraps Life { ok, data } page lists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [{ id: "p" }] }) }),
    );
    await expect(listPages()).resolves.toEqual([{ id: "p" }]);
  });

  it("reads a Life session envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, data: { authenticated: true, expiresAt: "2026-09-01T00:00:00Z" } }),
      }),
    );
    await expect(fetchSession()).resolves.toBe(true);
  });

  it("gets a page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "p" }) }));
    await expect(getPage("p")).resolves.toEqual({ id: "p" });
  });

  it("posts coach turns to the session API without a kernel secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ reply: "State the claim.", research: { findings: [] } }),
      }),
    );
    await expect(
      runCoach({
        messages: [{ role: "user", content: "Help" }],
        workingThesis: "A claim",
        draft: "Draft text",
      }),
    ).resolves.toMatchObject({ reply: "State the claim." });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/clementine-coach"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(String(init.body)).toContain("A claim");
    expect(String(init.body)).not.toMatch(/kernel/i);
    expect(JSON.stringify(init.headers)).not.toMatch(/x-research-kernel-secret/i);
  });

  it("posts chat turns to the session API without a kernel secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "done", reply: "Three clusters." }),
      }),
    );
    await expect(
      runChat({
        hat: "scoping",
        messages: [{ role: "user", content: "Gagne" }],
      }),
    ).resolves.toMatchObject({ status: "done", reply: "Three clusters." });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/clementine-chat"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(String(init.body)).toContain("scoping");
    expect(JSON.stringify(init.headers)).not.toMatch(/x-research-kernel-secret/i);
  });

  it("does not announce a new archive search when a sitting library is already attached", async () => {
    const phases: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "writing", writeSessionId: "w-lib" }),
      }),
    );
    await runChat(
      {
        hat: "scoping",
        messages: [
          { role: "user", content: "self determination theory" },
          { role: "assistant", content: "A brief." },
          { role: "user", content: "Say more" },
        ],
        sittingLibrary: { findings: [{ pageId: "p1" }], gaps: [] } as never,
      },
      phase => {
        phases.push(phase.status);
      },
    );
    expect(phases).not.toContain("searching");
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(String(init.body)).toContain("sittingLibrary");
  });

  it("reports search then write phases when the Worker clock takes the reply", async () => {
    const research = { findings: [{ pageId: "p1" }], gaps: [] };
    const phases: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "writing", writeSessionId: "w-1", research }),
      }),
    );
    await expect(
      runChat({ hat: "scoping", messages: [{ role: "user", content: "Gagne" }] }, phase => {
        phases.push(phase.status);
      }),
    ).resolves.toMatchObject({ status: "writing", writeSessionId: "w-1" });
    expect(phases).toEqual(["searching", "writing"]);
  });

  it("follows a compose status with a second chat post so archive and Claude stay on separate requests", async () => {
    const research = { findings: [{ pageId: "p1" }], gaps: [] };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "compose", research, archiveFailed: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "done", reply: "Three clusters.", research }),
        }),
    );
    await expect(
      runChat({
        hat: "scoping",
        messages: [{ role: "user", content: "Gagne" }],
      }),
    ).resolves.toMatchObject({ status: "done", reply: "Three clusters." });
    expect(fetch).toHaveBeenCalledTimes(2);
    const second = vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit;
    expect(String(second.body)).toContain("\"compose\":true");
    expect(String(second.body)).toContain("p1");
  });

  it("says the chat timed out when Safari drops the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Load failed")));
    await expect(
      runChat({
        hat: "scoping",
        messages: [{ role: "user", content: "Gagne" }],
      }),
    ).rejects.toThrow(/timed out/i);
  });

  it("surfaces API failures instead of calling them a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: "Anthropic error 400: web search is not enabled" }),
      }),
    );
    await expect(
      runChat({
        hat: "fromBook",
        messages: [{ role: "user", content: "weak absolutism" }],
      }),
    ).rejects.toThrow(/web search is not enabled/i);
  });

  it("retries the write once when Safari drops it after archive findings land", async () => {
    const research = { findings: [{ pageId: "p1", title: "SDT" }], gaps: [] };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "compose", research, archiveFailed: false }),
        })
        .mockRejectedValueOnce(new TypeError("Load failed"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "done", reply: "Three clusters.", research }),
        }),
    );
    await expect(
      runChat({
        hat: "scoping",
        messages: [{ role: "user", content: "self determination theory" }],
      }),
    ).resolves.toMatchObject({ status: "done", reply: "Three clusters." });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps the archive notes when the write drops twice", async () => {
    const research = { findings: [{ pageId: "p1", title: "SDT" }], gaps: [] };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "compose", research, archiveFailed: false }),
        })
        .mockRejectedValue(new TypeError("Load failed")),
    );
    let dropped: unknown;
    await runChat({
      hat: "scoping",
      messages: [{ role: "user", content: "self determination theory" }],
    }).catch(error => {
      dropped = error;
    });
    expect(dropped).toBeInstanceOf(ChatWriteDroppedError);
    expect((dropped as ChatWriteDroppedError).research?.findings[0]?.pageId).toBe("p1");
  });

  it("posts page saves with credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "page_hub_x" }) }));
    await expect(savePage({ id: "page_hub_x" } as never)).resolves.toMatchObject({ id: "page_hub_x" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pages-save"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("omits connected and relationship fields on ordinary page saves", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { id: "page_alpha", title: "Alpha" } }),
    });
    vi.stubGlobal("fetch", fetchImpl);
    await savePage({
      id: "page_alpha",
      title: "Alpha",
      area: "notes",
      tags: [],
      body: "body",
      connected: ["page_should_stay"],
      relationships: [{ legacy_hub_ref: "page_should_stay" }],
      relationships_status: "ready",
      attachments: [],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      schema_version: 1,
    } as never);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body).toMatchObject({ id: "page_alpha", title: "Alpha", body: "body" });
    expect(Object.prototype.hasOwnProperty.call(body, "connected")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body, "relationships")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body, "relationships_status")).toBe(false);
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain("replace-relationships");
  });

  it("posts explicit relationship replaces and surfaces retryable failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { page: { id: "page_alpha" }, relationships_replaced: true },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          ok: false,
          error: {
            code: "knowledge_relationship_operation_incomplete",
            message: "incomplete",
            retryable: true,
          },
          data: { page_saved: false, retryable: true },
        }),
      });
    vi.stubGlobal("fetch", fetchImpl);

    await expect(replacePageRelationships("page_alpha", ["page_beta"])).resolves.toMatchObject({
      relationships_replaced: true,
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("replace-relationships");
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      id: "page_alpha",
      related_to: ["page_beta"],
    });

    await expect(replacePageRelationships("page_alpha", ["page_beta"])).rejects.toMatchObject({
      name: "KnowledgeApiError",
      code: "knowledge_relationship_operation_incomplete",
      retryable: true,
    });
    expect(KnowledgeApiError).toBeTruthy();
  });

  it("posts attachment sign requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ put_url: "https://r2", attachment: { id: "a" } }),
      }),
    );
    await expect(
      signAttachment({
        filename: "a.pdf",
        content_type: "application/pdf",
        byte_size: 10,
        page_id: "page_hub_x",
        area: "notes",
      }),
    ).resolves.toMatchObject({ put_url: "https://r2" });
  });

  it("posts production tidy to the API host that already has the session cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "p" }) }));
    await expect(tidyPage("p", "t0")).resolves.toEqual({ id: "p" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/tidy",
      expect.objectContaining({ credentials: "include", method: "POST", body: JSON.stringify({ id: "p", apply: true }) }),
    );
  });

  it("uses a saved note when the tidy request drops after GitHub already wrote", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "p", updated_at: "t2", title: "Tidied" }) });
    vi.stubGlobal("fetch", fetchImpl);
    await expect(tidyPage("p", "t1")).resolves.toMatchObject({ title: "Tidied", updated_at: "t2" });
  });

  it("tells you to refresh if the request drops and the note has not changed yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Load failed")));
    await expect(tidyPage("p", "t1")).rejects.toThrow("Refresh the note");
  });

  it("uses the local-data route in local mode", () => {
    expect(tidyEndpoint(true)).toBe("/local-data/tidy");
  });

  it("starts a tidy intake job without applying the write", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        ok: true,
        data: { id: "ai_job_1", kind: "knowledge_intake", phase: "awaiting_review", page_id: "p" }
      })
    }));
    await expect(startTidyIntake("p")).resolves.toMatchObject({ id: "ai_job_1", phase: "awaiting_review" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/tidy",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "p" }) }),
    );
  });
});

it("uses the same-origin API route by default", () => expect(API_BASE).toBe("/api"));
