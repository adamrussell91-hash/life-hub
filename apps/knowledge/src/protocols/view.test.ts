/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { applySession, backgroundAsset, detectForks, lightingStage, postProtocolAction, sessionView, speakerName, statusLabel, thinkingStatus } from "./view";

const definition = {
  id: "fates",
  name: "The Three Fates",
  description: "",
  motif: "Greek threads",
  defaultMode: "sprint",
  modes: [{ id: "sprint", label: "Sprint" }],
  intake: [],
  voices: [
    { id: "lachesis", name: "Lachesis", role: "Strategist and measurer" },
    { id: "clotho", name: "Clotho", role: "Generative spinner" },
    { id: "atropos", name: "Atropos", role: "Critical cutter" },
    { id: "weave", name: "The Weave", role: "Witness and mapper" }
  ]
};

function session(partial: Partial<Parameters<typeof sessionView>[0]> = {}) {
  return {
    id: "sess-1",
    status: "waiting",
    stage: "briefing",
    speaker: "lachesis",
    revision: 1,
    transcript: [{ id: "t1", role: "voice", speaker: "lachesis", stage: "briefing", text: "What is prompting this now?" }],
    checkpoint: { kind: "answer", question: "What is prompting this now?" },
    allowedActions: ["answer", "cancel"],
    error: null,
    ...partial
  };
}

describe("protocol conversation view", () => {
  it("keeps the speaking persona's portrait and role in front of the reply", () => {
    const html = sessionView(session(), definition);
    expect(html).toContain("protocol-portrait");
    expect(html).toContain("fates-lachesis-measurer.png");
    expect(html).toContain("Strategist and measurer");
    expect(html).toContain("Reply to Lachesis");
    expect(speakerName(session(), definition)).toBe("Lachesis");
    expect(statusLabel(session({ status: "queued" }))).toBe("thinking");
  });

  it("gives each thinking persona an in-world status line", () => {
    const horizon = {
      ...definition,
      id: "horizon",
      name: "The Horizon Council",
      voices: [{ id: "ketill", name: "Ketill the Hearthkeeper", role: "Near horizon" }],
    };
    expect(thinkingStatus(horizon, "ketill", "Ketill the Hearthkeeper")).toContain("Odin");
    expect(sessionView(session({ status: "running", speaker: "ketill", transcript: [], checkpoint: null }), horizon)).toContain("consulting Odin");
  });

  it("shows one turn card at a time with a scrubber dot per turn", () => {
    const twoTurns = session({
      status: "waiting",
      checkpoint: null,
      transcript: [
        { id: "t1", role: "voice", speaker: "lachesis", stage: "briefing", text: "What is prompting this now?" },
        { id: "t2", role: "user", speaker: "you", stage: "briefing", text: "I am tired" }
      ]
    });
    const latest = sessionView(twoTurns, definition);
    expect(latest).toContain("data-turn-id=\"t2\"");
    expect(latest).not.toContain("data-turn-id=\"t1\"");
    expect((latest.match(/protocol-dot/g) ?? []).length).toBeGreaterThan(0);
    expect(latest).toContain("Turn 2 of 2");

    const historical = sessionView(twoTurns, definition, 0);
    expect(historical).toContain("data-turn-id=\"t1\"");
    expect(historical).not.toContain("data-turn-id=\"t2\"");
    expect(historical).toContain("New reply ↓");
  });

  it("reflects updated session state on re-render", () => {
    const root = document.createElement("div");
    applySession(root, session(), definition);
    expect(root.querySelector(".protocol-portrait img")?.getAttribute("src")).toContain("fates-lachesis-measurer.png");
    applySession(root, session({
      speaker: "clotho",
      revision: 2,
      checkpoint: null,
      transcript: [
        { id: "t1", role: "voice", speaker: "lachesis", stage: "briefing", text: "What is prompting this now?" },
        { id: "t2", role: "user", speaker: "you", stage: "briefing", text: "I am tired" }
      ]
    }), definition);
    expect(root.querySelector("[data-turn-id=\"t2\"]")?.textContent).toContain("I am tired");
  });

  it("skips a re-render when nothing the current view depends on has changed", () => {
    const root = document.createElement("div");
    applySession(root, session(), definition);
    const before = root.innerHTML;
    applySession(root, session(), definition);
    expect(root.innerHTML).toBe(before);
  });
});

describe("postProtocolAction", () => {
  it("refreshes a stale session and retries the same reply once", async () => {
    const latest = session({ revision: 4 });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("?sessionId=")) {
        return new Response(JSON.stringify({ data: { session: latest } }), { status: 200 });
      }
      const revision = JSON.parse(String(init?.body)).revision;
      if (revision === 3) {
        return new Response(JSON.stringify({ error: { message: "Session changed. Refresh before continuing." } }), { status: 409 });
      }
      return new Response(JSON.stringify({ data: { session: latest } }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(postProtocolAction({
      sessionId: latest.id,
      revision: 3,
      requestId: "request-1",
      action: "answer",
      text: "I can picture us growing further apart.",
    }, fetchImpl)).resolves.toEqual(latest);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({ revision: 3, requestId: "request-1" });
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toMatchObject({ revision: 4, requestId: "request-1" });
  });

  it("adopts a session that another request has already advanced", async () => {
    const latest = session({ status: "running", revision: 4, checkpoint: null });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("?sessionId=")) {
        return new Response(JSON.stringify({ data: { session: latest } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "Session changed. Refresh before continuing." } }), { status: 409 });
    }) as unknown as typeof fetch;

    await expect(postProtocolAction({ sessionId: latest.id, revision: 3, requestId: "request-2", action: "answer", text: "My reply" }, fetchImpl)).resolves.toEqual(latest);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps a backend error message when a reply cannot be retried", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "The session has ended." } }), { status: 410 })) as unknown as typeof fetch;

    await expect(postProtocolAction({ sessionId: "sess-1", revision: 3, requestId: "request-3", action: "answer", text: "My reply" }, fetchImpl)).rejects.toThrow("The session has ended.");
  });
});

describe("lightingStage", () => {
  it("stays at the opening stage for a single-turn or empty transcript", () => {
    expect(lightingStage(0, 0)).toBe("sunrise");
    expect(lightingStage(0, 1)).toBe("sunrise");
  });

  it("spans sunrise to just-after-dusk across a longer transcript", () => {
    expect(lightingStage(0, 10)).toBe("sunrise");
    expect(lightingStage(9, 10)).toBe("just-after-dusk");
    expect(lightingStage(4, 10)).toBe("golden-hour");
  });

  it("uses six dawn-to-night stages for Cartographers", () => {
    expect(lightingStage(0, 12, "cartographers")).toBe("dawn");
    expect(lightingStage(2, 12, "cartographers")).toBe("sunrise");
    expect(lightingStage(4, 12, "cartographers")).toBe("midday");
    expect(lightingStage(11, 12, "cartographers")).toBe("night");
  });

  it("uses three day-to-blue-hour stages for Tribunal", () => {
    expect(lightingStage(0, 9, "tribunal")).toBe("midday");
    expect(lightingStage(3, 9, "tribunal")).toBe("golden-hour");
    expect(lightingStage(8, 9, "tribunal")).toBe("blue-hour");
  });

  it("uses six sunrise-to-night stages for Consilium", () => {
    expect(lightingStage(0, 12, "consilium")).toBe("sunrise");
    expect(lightingStage(4, 12, "consilium")).toBe("midday");
    expect(lightingStage(11, 12, "consilium")).toBe("night");
  });

  it("uses five sunrise-to-night stages for Witness", () => {
    expect(lightingStage(0, 10, "witness")).toBe("sunrise");
    expect(lightingStage(2, 10, "witness")).toBe("morning");
    expect(lightingStage(4, 10, "witness")).toBe("midday");
    expect(lightingStage(6, 10, "witness")).toBe("golden-hour");
    expect(lightingStage(9, 10, "witness")).toBe("night");
  });

  it("uses six sunrise-to-night stages for Mirror", () => {
    expect(lightingStage(0, 12, "mirror")).toBe("sunrise");
    expect(lightingStage(2, 12, "mirror")).toBe("morning");
    expect(lightingStage(4, 12, "mirror")).toBe("midday");
    expect(lightingStage(6, 12, "mirror")).toBe("golden-hour");
    expect(lightingStage(8, 12, "mirror")).toBe("twilight");
    expect(lightingStage(11, 12, "mirror")).toBe("night");
  });
});

describe("backgroundAsset", () => {
  it("builds the default filename with no stage", () => {
    expect(backgroundAsset("horizon")).toMatch(/horizon-background\.png$/);
  });

  it("builds a named staged filename when a stage is given", () => {
    expect(backgroundAsset("horizon", "golden-hour")).toMatch(/horizon-background-golden-hour\.png$/);
  });
});

describe("detectForks", () => {
  it("returns null when the text has no fork pattern", () => {
    expect(detectForks("Just a plain reply with no branches.")).toBeNull();
  });

  it("returns null for a single fork marker (not actually a branch)", () => {
    expect(detectForks("Fork one: this is the only option.")).toBeNull();
  });

  it("splits leading text and each numbered fork into its own branch", () => {
    const text = "Right, let's see what's here.\n\nFork one: take the job. Closes off academia.\n\nFork two: pursue a PhD. Opens research paths.";
    const result = detectForks(text);
    expect(result).not.toBeNull();
    expect(result?.leading).toBe("Right, let's see what's here.");
    expect(result?.branches).toHaveLength(2);
    expect(result?.branches[0]).toEqual({ label: "Fork 1", body: "take the job. Closes off academia." });
    expect(result?.branches[1]).toEqual({ label: "Fork 2", body: "pursue a PhD. Opens research paths." });
  });
});
