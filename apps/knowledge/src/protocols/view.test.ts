/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { applySession, backgroundAsset, detectForks, lightingStage, sessionView, speakerName, statusLabel } from "./view";

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

describe("lightingStage", () => {
  it("stays at stage 1 for a single-turn or empty transcript", () => {
    expect(lightingStage(0, 0)).toBe(1);
    expect(lightingStage(0, 1)).toBe(1);
  });

  it("spans 1 to 5 across a longer transcript", () => {
    expect(lightingStage(0, 10)).toBe(1);
    expect(lightingStage(9, 10)).toBe(5);
    expect(lightingStage(4, 10)).toBe(3);
  });
});

describe("backgroundAsset", () => {
  it("builds the default filename with no stage", () => {
    expect(backgroundAsset("horizon")).toMatch(/horizon-background\.png$/);
  });

  it("builds a numbered staged filename when a stage is given", () => {
    expect(backgroundAsset("horizon", 3)).toMatch(/horizon-background-3\.png$/);
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
