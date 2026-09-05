/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runChat, savePage } from "../api/client";
import { ANN_WAIT_LINES, CLEMENTINE_WAIT_LINES, STATUS_ROTATE_MS } from "./ticker";
import { ensureChatOverlay, hideChatOverlay, openChatOverlay } from "./overlay";

vi.mock("../api/client", () => ({
  USE_LOCAL_DATA: false,
  ChatWriteDroppedError: class ChatWriteDroppedError extends Error {},
  getPage: vi.fn(),
  runChat: vi.fn(),
  savePage: vi.fn(),
  tidyPage: vi.fn(),
}));

const runChatMock = vi.mocked(runChat);
const savePageMock = vi.mocked(savePage);

describe("chat overlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("uses a chat icon on the FAB and portraits in the picker", () => {
    ensureChatOverlay({ visible: true });
    const fab = document.querySelector<HTMLButtonElement>(".floating-chat-button")!;
    expect(fab).toBeTruthy();
    expect(fab.querySelector("svg")).toBeTruthy();
    expect(fab.querySelector("img")).toBeNull();
    fab.click();
    const portraits = [...document.querySelectorAll<HTMLImageElement>(".agent-picker__avatar img")].map(img => img.getAttribute("src"));
    expect(portraits).toEqual(["/assets/agents/clementine.png", "/assets/agents/ann.png"]);
    expect(document.querySelector(".chat-overlay")).toBeTruthy();
    const hide = document.querySelector("[data-hub-scroll-hide]");
    expect(hide?.contains(document.querySelector(".agent-picker"))).toBe(true);
    expect(hide?.getAttribute("data-hub-scroll-scroller")).toBe(".chat-messages");
  });

  it("renders protocol bubbles for the active agent", () => {
    ensureChatOverlay({ visible: true });
    openChatOverlay();
    expect(document.body.textContent).toContain("Clementine can");
    expect(document.querySelector('[data-protocol="fromBook"]')).toBeTruthy();
    expect(document.querySelector('[data-protocol="synthesis"]')).toBeTruthy();
    expect(document.querySelector('[data-protocol="evidence"]')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('[data-personality="ann"]')!.click();
    expect(document.body.textContent).toContain("Ann can");
    expect(document.querySelector('[data-protocol="close-read"]')).toBeTruthy();
    expect(document.querySelector('[data-protocol="synthesis"]')).toBeNull();
  });

  it("pins a graph note as a chip and hides on sign-in", () => {
    ensureChatOverlay({ visible: true });
    openChatOverlay({ note: { pageId: "p1", title: "Retrieval practice and spacing" } });
    expect(document.body.textContent).toContain("Retrieval practice and spacing");
    hideChatOverlay();
    expect(document.querySelector(".floating-chat-button")).toBeNull();
  });

  it("turns a raw page id in the reply into a live note link", () => {
    const pageId = "page_notion_1aaf794f84768020a2aec3db6939dedc";
    const opened: string[] = [];
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
        input: "",
        turns: [
          {
            role: "assistant",
            content: `Motivation is a catalyst (${pageId}).`,
            findings: [{ pageId, title: "Gagné DMGT 2.0", excerpt: "catalyst", stance: "supports", analysis: "" }],
          },
        ],
      }),
    );
    ensureChatOverlay({
      visible: true,
      onOpenPage: id => {
        opened.push(id);
      },
    });
    const link = document.querySelector<HTMLAnchorElement>(".note-link");
    expect(link?.textContent).toBe("Gagné DMGT 2.0");
    expect(link?.dataset.openPage).toBe(pageId);
    expect(document.body.textContent).not.toContain(pageId);
    link?.click();
    expect(opened).toEqual([pageId]);
  });

  it("rewrites a mistyped citation id to the real archive note", () => {
    const realId = "page_notion_ac75845b67ab4b91b110a416d8eca9bb";
    const mistyped = "page_notion_ac75845b67ab4b91b110a416d8aca9bb";
    const opened: string[] = [];
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
        input: "",
        turns: [
          {
            role: "assistant",
            content: `[Four quarters marking](${mistyped}) captures Wiliam's position.`,
          },
        ],
      }),
    );
    ensureChatOverlay({
      visible: true,
      archiveNotes: [{ pageId: realId, title: "Four quarters marking" }],
      onOpenPage: id => {
        opened.push(id);
      },
    });
    const link = document.querySelector<HTMLAnchorElement>(".note-link");
    expect(link?.dataset.openPage).toBe(realId);
    expect(document.body.textContent).not.toContain(mistyped);
    link?.click();
    expect(opened).toEqual([realId]);
  });

  it("starts a new overlay sitting from New chat", () => {
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
        input: "",
        turns: [
          { role: "user", content: "How do these notes connect?" },
          { role: "assistant", content: "They share a retrieval thread." },
        ],
        notes: [{ pageId: "p1", title: "Retrieval practice" }],
      }),
    );
    ensureChatOverlay({ visible: true });
    expect(document.body.textContent).toContain("How do these notes connect?");
    expect(document.body.textContent).toContain("Retrieval practice");
    document.querySelector<HTMLButtonElement>("[data-new-chat]")!.click();
    expect(document.body.textContent).not.toContain("How do these notes connect?");
    expect(document.body.textContent).not.toContain("They share a retrieval thread.");
    expect(document.body.textContent).not.toContain("Retrieval practice");
    expect(document.querySelector("[data-new-chat]")).toBeTruthy();
  });

  it("uses a textarea composer and offers save on a developed reply", () => {
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
        input: "",
        turns: [
          {
            role: "assistant",
            content: `## Desirable difficulties

Effortful retrieval is the load-bearing claim. The archive supports Bjork here and turns that back onto the book. The notes that earn a citation are the ones that change what a careful reader would believe.`,
          },
        ],
      }),
    );
    ensureChatOverlay({ visible: true });
    expect(document.querySelector("textarea#overlay-chat-input")).toBeTruthy();
    expect(document.querySelector("[data-save-brief]")?.textContent).toBe("Save as new page");
  });

  it("asks for the book before researching a From a book sitting", () => {
    ensureChatOverlay({
      visible: true,
      bookLabels: ["Make It Stick"],
    });
    openChatOverlay({ protocolId: "fromBook" });
    expect(document.body.textContent).toContain("Pick a title from the archive");
    expect(document.querySelector<HTMLInputElement>("#overlay-chat-book")?.placeholder).toBe("Book title");
    expect(document.body.textContent).toContain("Note from the page");
    expect(document.querySelector<HTMLButtonElement>("[type=submit]")?.textContent).toBe("Make note");
    const field = document.querySelector<HTMLTextAreaElement>("#overlay-chat-input")!;
    field.value = "desirable difficulties";
    field.dispatchEvent(new Event("input"));
    document.querySelector<HTMLFormElement>(".chat-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(document.body.textContent).toContain("Pick the book first.");
    expect(runChatMock).not.toHaveBeenCalled();
  });

  it("keeps the overlay book after Use this book", () => {
    ensureChatOverlay({
      visible: true,
      bookLabels: ["Make It Stick"],
    });
    openChatOverlay({ protocolId: "fromBook" });
    const field = document.querySelector<HTMLInputElement>("#overlay-chat-book")!;
    field.value = "Make It Stick";
    field.dispatchEvent(new Event("input"));
    document.querySelector<HTMLButtonElement>("[data-set-book]")!.click();
    expect(document.body.textContent).toContain("Reading: Make It Stick");
    expect(document.querySelector("#overlay-chat-locus")).toBeTruthy();
    expect(document.querySelector("[data-set-book]")).toBeNull();
  });

  it("files a researched overlay page under the book", async () => {
    savePageMock.mockResolvedValue({
      id: "page_hub_saved",
      title: "Desirable difficulties",
      area: "notes",
      tags: [],
      origins: [{ kind: "book", label: "Make It Stick" }],
      body: "x",
      connected: [],
      attachments: [],
      source: "hub",
      created_at: "2026-08-27T00:00:00.000Z",
      updated_at: "2026-08-27T00:00:00.000Z",
      schema_version: 1,
    });
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        selectedProtocolId: "fromBook",
        bookContext: { label: "Make It Stick", locus: "p. 142" },
        open: true,
        input: "",
        turns: [
          { role: "user", content: "desirable difficulties" },
          {
            role: "assistant",
            content: `## Desirable difficulties

Effortful retrieval is the load-bearing claim. The archive supports Bjork here and turns that back onto Make It Stick. The notes that earn a citation are the ones that change what a careful reader would believe.`,
          },
        ],
      }),
    );
    ensureChatOverlay({ visible: true, bookLabels: ["Make It Stick"] });
    expect(document.body.textContent).toContain("Reading: Make It Stick (p. 142)");
    expect(document.body.textContent).toContain("Add to archive");
    expect(document.body.textContent).toContain("stamped under Make It Stick");
    document.querySelector<HTMLButtonElement>("[data-save-brief]")!.click();
    await vi.waitFor(() => expect(savePageMock).toHaveBeenCalled());
    expect(savePageMock.mock.calls[0]?.[0]?.origins).toEqual([{ kind: "book", label: "Make It Stick" }]);
  });

  it("hides agent chrome when the transcript scrolls down and shows it on the way up", async () => {
    const { resetHubMotionForTests, startHubMotion } = await import("../../design-kit/js/hub-motion.js");
    resetHubMotionForTests();
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
        input: "",
        turns: Array.from({ length: 8 }, (_, i) => ({
          role: i % 2 ? "assistant" : "user",
          content: `Turn ${i + 1}. ${"Enough copy to make the thread tall. ".repeat(4)}`,
        })),
      }),
    );
    ensureChatOverlay({ visible: true });
    startHubMotion(document);

    const hide = document.querySelector<HTMLElement>("[data-hub-scroll-hide]");
    const list = document.querySelector<HTMLElement>(".chat-messages");
    expect(hide).toBeTruthy();
    expect(list).toBeTruthy();

    Object.defineProperty(list!, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(list!, "clientHeight", { configurable: true, value: 200 });

    list!.scrollTop = 0;
    list!.dispatchEvent(new Event("scroll"));
    expect(hide!.classList.contains("is-hidden")).toBe(false);

    list!.scrollTop = 220;
    list!.dispatchEvent(new Event("scroll"));
    expect(hide!.classList.contains("is-hidden")).toBe(true);

    list!.scrollTop = 40;
    list!.dispatchEvent(new Event("scroll"));
    expect(hide!.classList.contains("is-hidden")).toBe(false);
  });
});

function openFreshOverlay(personality: "clementine" | "ann" = "clementine") {
  sessionStorage.setItem(
    "knowledge-hub-overlay-chat-v1",
    JSON.stringify({
      personality,
      open: true,
      input: "",
      turns: [],
    }),
  );
  ensureChatOverlay({ visible: true });
}

function storedTurns() {
  const raw = sessionStorage.getItem("knowledge-hub-overlay-chat-v1");
  return raw ? (JSON.parse(raw) as { turns?: Array<{ role: string; content: string }> }).turns ?? [] : [];
}

function statusNodes() {
  return [...document.querySelectorAll(".chat-message--status")];
}

function submitOverlay(text: string) {
  const field = document.querySelector<HTMLTextAreaElement>("#overlay-chat-input")!;
  field.value = text;
  field.dispatchEvent(new Event("input"));
  document.querySelector<HTMLFormElement>(".chat-form")!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}

const sampleResearch = {
  query: "desirable difficulties",
  round: 2,
  status: "running" as const,
  findings: [
    {
      pageId: "page_1",
      title: "Make It Stick",
      sourceUrl: "https://example.com",
      excerpt: "retrieval",
      stance: "supports" as const,
      analysis: "",
    },
  ],
  gaps: [],
  followUpQueries: ["spacing"],
};

describe("overlay working status", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    hideChatOverlay();
  });

  afterEach(() => {
    hideChatOverlay();
    vi.useRealTimers();
  });

  it("shows a temporary Clementine status immediately after send and keeps it out of turns", async () => {
    runChatMock.mockImplementation(() => new Promise(() => undefined));
    openFreshOverlay();
    submitOverlay("How do these notes connect?");
    await vi.advanceTimersByTimeAsync(0);

    expect(statusNodes()).toHaveLength(1);
    const line = statusNodes()[0]?.textContent ?? "";
    expect(CLEMENTINE_WAIT_LINES.some(item => line.includes(item))).toBe(true);
    expect(document.querySelector("[type=submit]")?.textContent).toBe("Send");
    expect(document.querySelectorAll(".chat-message--status")).toHaveLength(1);

    const turns = storedTurns();
    expect(turns).toEqual([{ role: "user", content: "How do these notes connect?" }]);
    expect(turns.some(turn => CLEMENTINE_WAIT_LINES.includes(turn.content))).toBe(false);
  });

  it("uses Ann's local status vocabulary after switching personality", async () => {
    runChatMock.mockImplementation(() => new Promise(() => undefined));
    openFreshOverlay("ann");
    submitOverlay("Where is the hinge?");
    await vi.advanceTimersByTimeAsync(0);

    const line = statusNodes()[0]?.textContent ?? "";
    expect(ANN_WAIT_LINES.some(item => line.includes(item))).toBe(true);
    expect(CLEMENTINE_WAIT_LINES.some(item => line.includes(item))).toBe(false);
  });

  it("updates the same temporary status for researching and writing", async () => {
    runChatMock
      .mockResolvedValueOnce({
        status: "researching",
        researchSessionId: "res_1",
        research: sampleResearch,
      })
      .mockResolvedValueOnce({
        status: "writing",
        writeSessionId: "write_1",
        research: sampleResearch,
      });
    openFreshOverlay();
    submitOverlay("Map the argument");
    await vi.advanceTimersByTimeAsync(0);

    expect(statusNodes()).toHaveLength(1);
    expect(statusNodes()[0]?.textContent).toMatch(/round 2/);
    expect(storedTurns()).toEqual([{ role: "user", content: "Map the argument" }]);

    await vi.advanceTimersByTimeAsync(2000);
    expect(statusNodes()).toHaveLength(1);
    expect(statusNodes()[0]?.textContent).toMatch(/archive note/);
    expect(storedTurns().filter(turn => turn.role === "assistant")).toHaveLength(0);
  });

  it("does not churn the visible line on a two-second poll of the same phase", async () => {
    runChatMock.mockResolvedValue({
      status: "researching",
      researchSessionId: "res_1",
      research: sampleResearch,
    });
    openFreshOverlay();
    submitOverlay("Keep looking");
    await vi.advanceTimersByTimeAsync(0);
    const first = statusNodes()[0]?.textContent;

    await vi.advanceTimersByTimeAsync(2000);
    expect(statusNodes()).toHaveLength(1);
    expect(statusNodes()[0]?.textContent).toBe(first);
  });

  it("rotates the personality line after a prolonged unchanged phase", async () => {
    runChatMock.mockResolvedValue({
      status: "researching",
      researchSessionId: "res_1",
      research: sampleResearch,
    });
    openFreshOverlay();
    submitOverlay("Keep looking");
    await vi.advanceTimersByTimeAsync(0);
    const first = statusNodes()[0]?.textContent;

    await vi.advanceTimersByTimeAsync(STATUS_ROTATE_MS);
    expect(statusNodes()).toHaveLength(1);
    expect(statusNodes()[0]?.textContent).not.toBe(first);
    expect(CLEMENTINE_WAIT_LINES.some(item => (statusNodes()[0]?.textContent ?? "").includes(item))).toBe(true);
  });

  it("clears temporary status on done and error", async () => {
    runChatMock.mockResolvedValueOnce({
      status: "done",
      reply: "The hinge is retrieval practice.",
    });
    openFreshOverlay();
    submitOverlay("What is the hinge?");
    await vi.advanceTimersByTimeAsync(0);
    expect(statusNodes()).toHaveLength(0);
    expect(document.body.textContent).toContain("The hinge is retrieval practice.");
    expect(storedTurns().some(turn => turn.role === "assistant")).toBe(true);

    runChatMock.mockRejectedValueOnce(new Error("Chat failed"));
    submitOverlay("Try again");
    await vi.advanceTimersByTimeAsync(0);
    expect(statusNodes()).toHaveLength(0);
    expect(document.body.textContent).toContain("Chat failed");
  });

  it("clears temporary status and timers on personality change and new chat", async () => {
    runChatMock.mockImplementation(() => new Promise(() => undefined));
    openFreshOverlay();
    submitOverlay("Still working");
    await vi.advanceTimersByTimeAsync(0);
    expect(statusNodes()).toHaveLength(1);

    document.querySelector<HTMLButtonElement>('[data-personality="ann"]')!.click();
    expect(statusNodes()).toHaveLength(0);
    expect(storedTurns()).toEqual([]);

    runChatMock.mockResolvedValueOnce({ status: "done", reply: "A finished note." });
    submitOverlay("Finish");
    await vi.advanceTimersByTimeAsync(0);
    expect(statusNodes()).toHaveLength(0);
    expect(document.body.textContent).toContain("A finished note.");
    document.querySelector<HTMLButtonElement>("[data-new-chat]")!.click();
    expect(statusNodes()).toHaveLength(0);
    expect(storedTurns()).toEqual([]);
  });
});
