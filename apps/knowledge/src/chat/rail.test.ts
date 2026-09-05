import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const rail = readFileSync(join(dir, "rail.ts"), "utf8");
const css = readFileSync(join(dir, "../style.css"), "utf8");

describe("Chat rail layout", () => {
  it("stacks the composer above the thread and renders replies as markdown", () => {
    expect(css).toContain(".coach.chat");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain(".coach.chat .coach__thread");
    expect(css).toContain("order: -1");
    expect(css).toContain("bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px))");
    expect(css).toMatch(/\.coach\.chat \.chat__composer\s*\{[^}]*position:\s*fixed/);
    expect(css).toContain(".coach.chat::after");
    expect(rail).toContain("renderChatMarkdown(turn.content, turn.findings, opts.archiveNotes)");
    expect(rail).toContain("thinkingHistoryHtml");
    expect(rail).toContain("searchedNotesHtml");
    expect(rail).toContain("sittingLibrary");
    expect(rail).toContain("data-hub-scroll-hide");
    expect(rail).toContain("data-new-chat");
    expect(rail).toContain("New chat");
    expect(rail).not.toContain("data-open-visualiser");
    expect(rail).not.toContain("Portrait ideas");
    expect(rail).toContain("coach-msg--with-portrait");
    expect(rail).toContain("portraitSrc: CLEMENTINE.avatarSrc");
    expect(rail).toContain("CLEMENTINE.avatarSrc");
    expect(rail).toContain("chat-message__avatar");
    expect(rail).not.toContain("host.findingCards");
    expect(rail).not.toContain("<p class=\"coach-msg__body\">${escapeHtml(turn.content)}</p>");
  });
});
