import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(dir, "main.ts"), "utf8");
const intakeView = readFileSync(join(dir, "tidy/intakeView.ts"), "utf8");
const css = readFileSync(join(dir, "style.css"), "utf8");
const mobile = readFileSync(join(dir, "mobile-chrome.ts"), "utf8");

describe("Knowledge Hub rail", () => {
  it("does not expose an Alchemist workplace", () => {
    expect(main).not.toContain('data-nav="alchemist"');
    expect(main).not.toContain("renderAlchemist");
    expect(main).not.toContain("runAlchemist");
  });

  it("still renders coach archive citations after the Alchemist rail is gone", () => {
    expect(main).toContain("function findingCards");
  });

  it("replaces Coach and Wiki with Chat", () => {
    expect(main).toContain('data-nav="chat"');
    expect(main).toContain("<span>Chat</span>");
    expect(main).not.toContain('data-nav="wiki"');
    expect(main).not.toContain('data-nav="coach"');
    expect(main).toContain("data-open-chat");
  });

  it("adds a university study Timeline next to Graph", () => {
    expect(main).toContain('data-nav="timeline"');
    expect(main).toContain("<span>Timeline</span>");
    expect(main).toContain("renderTimeline");
    expect(main).toContain("mountUniversityTimeline");
    expect(css).toContain(".uni-tl");
    expect(css).toContain(".gpa-chip");
    expect(css).not.toContain(".uni-tl__labels");
    expect(css).toContain("overflow-y: auto");
  });

  it("adds a Notebooks gallery with equal cover cards", () => {
    expect(main).toContain('data-nav="notebooks"');
    expect(main).toContain("<span>Notebooks</span>");
    expect(main).toContain("renderNotebooks");
    expect(main).toContain("notebooksGridHtml");
    expect(main).toContain('id: "notebooks", label: "Notebooks"');
    expect(css).toContain(".nb-grid");
    expect(css).toContain("aspect-ratio: 3 / 2");
    expect(css).toContain(".nb-card__media");
    expect(css).toContain("repeat(4, minmax(0, 1fr))");
    expect(css).toContain(".nb-open__notes");
    expect(mobile).toContain('id: "notebooks"');
    expect(mobile).toContain("goNotebooks");
  });

  it("opens on Notebooks after boot, not the archive list", () => {
    expect(main).toMatch(/let view: View = "notebooks"/);
    expect(main).toMatch(/await refreshVisible\(\);\s*view = "notebooks"/);
  });

  it("offers a quiet Clean up control beside Edit in the reader", () => {
    expect(main).toContain('class="btn btn--ghost reader__tidy" data-tidy type="button"');
    expect(main).toContain("Clean up");
    expect(intakeView).toContain("Cleaning up…");
    expect(main).toContain("readerTopicPillsHtml");
    expect(main).toContain("cardSupportingText");
    expect(main).not.toMatch(/hub-utilities[\s\S]*data-tidy/);
    expect(main).not.toContain('class="chip"');
  });

  it("keeps reader header actions as ghost buttons and leaves the title row as h1 only", () => {
    expect(main).toContain('class="btn btn--ghost reader__back" data-back type="button"');
    expect(main).toContain('class="btn btn--ghost" data-edit type="button"');
    expect(main).toContain('class="btn btn--ghost" data-open-chat type="button"');
    expect(main).toContain("page-header__title-row");
    expect(main).not.toMatch(/page-header__title-row[\s\S]*?hub-mark/);
    expect(main).toContain("icons/knowledge.svg");
    expect(main).toContain("sign-in__mark");
    expect(intakeView).toContain("confirm-card");
    expect(intakeView).toContain("data-tidy-confirm");
    expect(main).toContain("startTidyIntake");
    expect(main).toContain("intakeReviewHtml");
    expect(css).toContain("grid-template-areas:");
    expect(css).toContain('"title title"');
    expect(css).not.toMatch(/\.reader__tidy\s*\{[^}]*font-size:/);
  });

  it("puts Ask Clementine, From a book, and Write it yourself under one New note menu", () => {
    expect(main).toContain("function newNoteMenuHtml");
    expect(main).toContain("function bindNewNoteMenu");
    expect(main).toContain("data-new-note-menu");
    expect(main).toContain("data-from-book");
    expect(main).toContain("data-make-note");
    expect(main).toContain("data-blank-note");
    expect(main).toContain("New note");
    expect(main).toContain("Ask Clementine");
    expect(main).toContain("Write it yourself");
    expect(main).toContain("function openBookNote");
    expect(main).toContain("function openMakeNote");
    expect(main).toContain("function openCompose");
    expect(main).toContain('hat: "makeNote"');
    expect(main).toContain("compose__savebar");
    expect(main).toContain("positionHubFloating");
    expect(main).toContain("autoUpdateHubFloating");
    expect(css).toContain(".new-note");
    expect(css).toContain(".new-note__menu");
    expect(css).not.toMatch(/\.new-note__menu\s*\{[^}]*\btop\s*:/);
    expect(css).not.toMatch(/\.new-note__menu\s*\{[^}]*\bright\s*:/);
    expect(css).toContain(".chat__composer");
    expect(css).toContain("--keyboard-inset");
    expect(css).toContain(".chat__hats");
  });

  it("filters the archive by origin pills already on notes", () => {
    expect(main).toContain("originFilterHtml");
    expect(main).toContain("pageMatchesOriginFilter");
    expect(main).toContain("topicTagPickerHtml");
    expect(css).toContain(".origin-filters");
    expect(css).toContain(".tag-pill");
    expect(css).toContain(".option-picker");
    expect(css).not.toContain(".filter-chip");
    expect(main).not.toContain("filter-chip");
    expect(main).not.toContain("TOPIC_VOCABULARY.map");
  });

  it("has no University / Notes split in the rail, filters, or compose", () => {
    expect(main).not.toContain('data-nav="university"');
    expect(main).not.toContain('data-nav="notes"');
    expect(main).not.toContain('data-filter="university"');
    expect(main).not.toContain('data-filter="notes"');
    expect(main).not.toContain("compose-area");
    expect(main).not.toContain("University pages stay in the archive");
  });

  it("keeps graph note previews and a portrait chat overlay", () => {
    expect(main).toContain("openPageInNewTab");
    expect(main).toContain("ensureChatOverlay");
    expect(main).toContain("bookLabels: originLabelsForKind(entries, \"book\")");
    expect(main).toContain("pinChatOverlayNote");
    expect(main).toContain('querySelector<HTMLElement>(".graph-wrap")');
    expect(main).toContain("mountGraphPreview(wrap");
    expect(main).toContain("preview.el.querySelector");
    expect(main).not.toContain("mountGraphPreview(stage");
    expect(css).toContain(".floating-chat-button");
    expect(css).toContain(".floating-chat-button svg");
    expect(css).toContain(".agent-picker__avatar");
    expect(css).toContain(".agent-protocol-pills");
    expect(css).toContain(".hub-pills__btn");
    expect(css).toContain(".graph-preview__excerpt");
    expect(css).toMatch(/\.floating-chat-button\s*\{[^}]*background:\s*var\(--wave\)/);
    expect(css).toMatch(
      /\.floating-chat-button\s*\{[^}]*bottom:\s*calc\(5\.5rem \+ env\(safe-area-inset-bottom,\s*0px\)\)/
    );
    expect(css).toMatch(/\.chat-overlay\s*\{[^}]*width:\s*min\(24rem, calc\(100vw - 3rem\)\)/);
    expect(css).toMatch(/\.chat-overlay\s*\{[^}]*z-index:\s*50/);
    expect(css).toContain("--vv-height");
    expect(css).toContain("body:has(.chat-overlay) .hub-mobile-nav");
    expect(css).toMatch(/\.coach\.chat \.chat__composer\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.coach\.chat \.chat__composer\s*\{[^}]*bottom:\s*calc\(5\.5rem/);
    expect(css).toMatch(/\.graph-stage\s*\{[^}]*min-height:\s*560px/);
    expect(css).toContain(".universe-zoom");
    expect(css).toContain(".graph-wrap.is-universe-dark");
    expect(css).toContain(".graph-wrap.is-universe-fullscreen");
    expect(css).toContain("body.is-universe-fullscreen");
    expect(css).toContain(".universe-exit");
    expect(main).toContain("universeViewToolsHtml");
    expect(main).toContain("graphFullscreenToolsHtml");
    expect(main).toContain("universeExitHtml");
    expect(main).toContain("graphFullscreen");
    expect(main).toContain("shouldExitUniverseFullscreen");
    expect(main).toContain("applyUniverseViewState");
    expect(main).not.toContain('class="graph-wrap is-universe-dark"');
    expect(css).toContain("body:has(.chat-overlay) .floating-chat-button");
    expect(css).toContain("body:has(.coach.chat) #kh-chat-overlay");
    expect(css).toContain(".chat-presence__portrait");
    expect(main).toContain("portraitSrc");
    expect(main).not.toContain("openChatVisualiser");
    expect(main).not.toContain("onOpenVisualiser");
    expect(main).not.toContain("Portrait ideas");
  });

  it("stacks the universe key under the version label in fullscreen so it does not cover chat", () => {
    expect(main).toContain('class="graph-chrome"');
    expect(main).toMatch(/<div class="graph-chrome">[\s\S]*graph-toolbar[\s\S]*universeKeyHtml[\s\S]*<\/div>/);
    expect(css).toContain(".graph-chrome");
    expect(css).toContain("display: contents");
    expect(css).toContain(".graph-wrap.is-universe-fullscreen:has([data-universe-key]) .graph-chrome");
    expect(css).toContain(".graph-wrap.is-universe-fullscreen:has([data-universe-key]) .universe-key");
    expect(css).toContain(".graph-wrap.is-universe-fullscreen:has([data-universe-key]) .graph-toolbar__meta");
    expect(css).toMatch(
      /\.graph-wrap\.is-universe-fullscreen:has\(\[data-universe-key\]\) \.universe-key\s*\{[^}]*position:\s*relative/,
    );
    expect(css).toMatch(
      /\.graph-wrap\.is-universe-fullscreen:has\(\[data-universe-key\]\) \.graph-toolbar__meta\s*\{[^}]*order:\s*10/,
    );
    expect(css).toContain(".graph-wrap.is-universe-dark .graph-toolbar__meta");
  });

  it("makes Knowledge Hub a home control", () => {
    expect(main).toContain('class="hub-rail__brand" data-home');
    expect(main).toContain('href="#"');
    expect(main).toContain("function goToHome");
  });

  it("links out to the other umbrella hubs from the rail", () => {
    expect(main).toContain('hubSwitcherHtml("knowledge")');
  });
});

describe("note reader and editor fill the canvas", () => {
  it("does not cap compose or the reader body to a skinny column", () => {
    expect(css).toContain(".canvas:has(> .compose)");
    expect(css).toContain(".canvas:has(> .reader)");
    expect(css).not.toMatch(/\.compose\s*\{[^}]*max-width:\s*44rem/);
    expect(css).not.toMatch(/\.reader__body\s*\{[^}]*max-width:\s*var\(--measure\)/);
  });

  it("marks the body field so the editor can grow with the page", () => {
    expect(main).toContain("compose__field compose__field--body");
  });
});

describe("new-note voice capture", () => {
  it("keeps one recorder across compose re-renders so Stop can finish the take", () => {
    expect(main).toContain("createComposeVoiceWave");
    expect(main).toContain("adoptComposeVoiceWave");
    expect(main).toContain("const composeVoice = createVoiceCapture");
    expect(main.indexOf("const composeVoice = createVoiceCapture")).toBeLessThan(main.indexOf("function renderCompose"));
    expect(main).not.toMatch(/function renderCompose[\s\S]*createVoiceCapture\(/);
    expect(main).toContain("paintComposeCaptureChrome");
    expect(css).toContain(".compose__voice-wave");
  });
});
