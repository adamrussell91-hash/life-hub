/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applySession, sessionView, speakerName, statusLabel } from "./view";

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
  it("keeps the speaking person prominent in the stage", () => {
    const html = sessionView(session(), definition);
    expect(html).toContain("protocol-speaker is-active");
    expect(html).toContain("data-voice=\"lachesis\"");
    expect(html).toContain("fates-lachesis-measurer.png");
    expect(html).toContain("Reply to Lachesis");
    expect(speakerName(session(), definition)).toBe("Lachesis");
    expect(statusLabel(session({ status: "queued" }))).toBe("thinking");
  });

  it("updates the active speaker without replacing the portrait node", () => {
    const root = document.createElement("div");
    applySession(root, session(), definition);
    const first = root.querySelector<HTMLImageElement>('[data-voice="lachesis"] img');
    expect(first).toBeTruthy();
    applySession(root, session({
      speaker: "clotho",
      transcript: [
        { id: "t1", role: "voice", speaker: "lachesis", stage: "briefing", text: "What is prompting this now?" },
        { id: "t2", role: "user", speaker: "you", stage: "briefing", text: "I am tired" }
      ]
    }), definition);
    const again = root.querySelector<HTMLImageElement>('[data-voice="lachesis"] img');
    expect(again).toBe(first);
    expect(root.querySelector('[data-voice="clotho"]')?.classList.contains("is-active")).toBe(true);
    expect(root.querySelector('[data-voice="lachesis"]')?.classList.contains("is-active")).toBe(false);
    expect(root.querySelector("[data-turn-id=\"t2\"]")?.textContent).toContain("I am tired");
    expect(root.querySelectorAll(".protocol-speaker img")).toHaveLength(4);
  });

  it("lets the session fill the canvas instead of a centred reading column", () => {
    const css = readFileSync(join(process.cwd(), "src/protocols/style.css"), "utf8");
    expect(css).toMatch(/\.protocol-session \{ width:100%/);
    expect(css).toMatch(/\.protocol-session > header[\s\S]*?width:100%; max-width:none/);
    expect(css).not.toMatch(/protocol-session > header[\s\S]{0,80}42rem/);
  });
});
