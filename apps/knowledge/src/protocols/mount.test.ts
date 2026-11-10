/** @vitest-environment jsdom */
// The shared protocol screen's embeddable mounts (used by the Tasks thread view) and the
// "From thread" tag in Past runs. Invented situations only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountProtocolIntake, mountProtocolSession, pastRunsHtml, renderProtocols } from "./view";

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });

afterEach(() => vi.unstubAllGlobals());

describe("pastRunsHtml thread tag", () => {
  const run = { id: "r1", protocolId: "fates", mode: "sprint", status: "completed", title: "Garden plots", origin: { threadId: "thr 1", sessionId: "s", stepId: null } };
  it("links a thread-started run to its Tasks thread with the thread title", () => {
    const html = pastRunsHtml([run], "", [], {}, {}, { "thr 1": "Choosing two plots" });
    expect(html).toContain('href="/tasks/#/think/thr%201"');
    expect(html).toContain("From thread: Choosing two plots");
  });
  it("keeps the link when the thread title is unknown, and shows no tag for other runs", () => {
    expect(pastRunsHtml([run], "", [])).toContain("From thread: a thinking thread");
    expect(pastRunsHtml([{ ...run, origin: null }], "", [])).not.toContain("From thread");
  });
});

describe("Knowledge library still mounts", () => {
  it("renders the cards and Past runs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const host = document.createElement("div");
    const view = renderProtocols({ host });
    await flush();
    expect(host.querySelector(".protocol-library")).not.toBeNull();
    expect(host.querySelectorAll("[data-protocol-card]").length).toBeGreaterThan(0);
    view.teardown();
  });
});

describe("mountProtocolIntake", () => {
  it("pre-fills the fields, shows the estimate and run label, and starts through submit()", async () => {
    const catalog = await import("../../../../config/knowledge/cognitive/definitions.mjs");
    vi.stubGlobal("fetch", vi.fn(async () => json({ catalog: catalog.catalog })));
    const el = document.createElement("div");
    const started = vi.fn();
    const submit = vi.fn(async () => ({ id: "run-1" }));
    mountProtocolIntake(el, { protocolId: "fates", mode: "sprint", intake: { task: "Pick a garden plot" }, onStarted: started, submit, runLabel: "Run (≈ A$0.40)", estimate: "About 6 minutes" });
    await flush();
    expect(el.querySelector<HTMLTextAreaElement>('textarea[name="task"]')?.value).toBe("Pick a garden plot");
    expect(el.querySelector<HTMLSelectElement>('select[name="mode"]')?.value).toBe("sprint");
    expect(el.querySelector("[data-protocol-run]")?.textContent).toBe("Run (≈ A$0.40)");
    expect(el.querySelector("[data-protocol-estimate]")?.textContent).toBe("About 6 minutes");
    el.querySelector<HTMLFormElement>("[data-protocol-form]")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ protocolId: "fates", mode: "sprint", intake: expect.objectContaining({ task: "Pick a garden plot" }) }));
    expect(started).toHaveBeenCalledWith({ id: "run-1" });
  });

  it("posts the origin with the create when it runs by itself", async () => {
    const catalog = await import("../../../../config/knowledge/cognitive/definitions.mjs");
    const origin = { threadId: "thr-1", sessionId: "home-1", stepId: "a" };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? json({ session: { id: "run-2", status: "queued" } }, 202) : json({ catalog: catalog.catalog }));
    vi.stubGlobal("fetch", fetchMock);
    const el = document.createElement("div");
    const started = vi.fn();
    mountProtocolIntake(el, { protocolId: "witness", intake: { instance: "Comparing two venues" }, origin, onStarted: started });
    await flush();
    el.querySelector<HTMLFormElement>("[data-protocol-form]")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ protocolId: "witness", origin, intake: { instance: "Comparing two venues" } });
    expect(started).toHaveBeenCalled();
  });
});

describe("mountProtocolSession", () => {
  it("shows a running run, relabels the back button, and calls onDone once when it completes", async () => {
    const catalog = await import("../../../../config/knowledge/cognitive/definitions.mjs");
    let status = "running";
    const session = () => ({ id: "run-1", protocolId: "fates", mode: "sprint", status, stage: "briefing", speaker: "lachesis", revision: 1, transcript: [{ id: "t1", role: "voice", speaker: "lachesis", stage: "briefing", text: "What matters most here?" }], checkpoint: null, allowedActions: ["cancel"], error: null });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("sessionId") ? json({ session: session() }) : json({ catalog: catalog.catalog })));
    const el = document.createElement("div");
    const done = vi.fn();
    const mounted = mountProtocolSession(el, { sessionId: "run-1", onDone: done });
    await flush();
    await flush();
    expect(el.querySelector(".protocol-session")).not.toBeNull();
    expect(el.querySelector("[data-protocol-close]")?.textContent).toBe("← Back to thread");
    expect(done).not.toHaveBeenCalled();
    status = "completed";
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(done).toHaveBeenCalledTimes(1);
    mounted.teardown();
  });
});
