import { describe, expect, it } from "vitest";
import {
  renderChatMarkdown,
  resolveArchivePageId,
  rewriteBareArchiveIds,
  titlesFromNotes,
} from "./noteLinks";

const dmgt = "page_notion_1aaf794f84768020a2aec3db6939dedc";
const motivation = "page_notion_225f794f847681fd8720fa557e6d8d4b";
const quarters = "page_notion_ac75845b67ab4b91b110a416d8eca9bb";
const mistypedQuarters = "page_notion_ac75845b67ab4b91b110a416d8aca9bb";

describe("rewriteBareArchiveIds", () => {
  it("turns parenthetical page ids into titled markdown links", () => {
    const titles = titlesFromNotes([
      { pageId: dmgt, title: "Gagné DMGT 2.0" },
      { pageId: motivation, title: "Motivation in giftedness and talent" },
    ]);
    const rewritten = rewriteBareArchiveIds(
      `Motivation is a catalyst (${dmgt}). The wellbeing note (${motivation}) makes the connection.`,
      titles,
    );
    expect(rewritten).toContain(`[Gagné DMGT 2.0](${dmgt})`);
    expect(rewritten).toContain(`[Motivation in giftedness and talent](${motivation})`);
    expect(rewritten).not.toContain(`catalyst (${dmgt})`);
  });

  it("leaves existing markdown links alone when the id is already known", () => {
    const rewritten = rewriteBareArchiveIds(`[Gagné DMGT 2.0](${dmgt}) already linked.`, [
      { pageId: dmgt, title: "Different title" },
    ]);
    expect(rewritten).toBe(`[Gagné DMGT 2.0](${dmgt}) already linked.`);
  });

  it("rewrites a mistyped page id when the title uniquely matches the archive", () => {
    const rewritten = rewriteBareArchiveIds(
      `[Four quarters marking](${mistypedQuarters}) captures Wiliam's position.`,
      [{ pageId: quarters, title: "Four quarters marking" }],
    );
    expect(rewritten).toBe(`[Four quarters marking](${quarters}) captures Wiliam's position.`);
  });
});

describe("resolveArchivePageId", () => {
  it("keeps a known id even when the label differs", () => {
    expect(resolveArchivePageId(dmgt, "Different title", [{ pageId: dmgt, title: "Gagné DMGT 2.0" }])).toBe(dmgt);
  });

  it("does not guess when two notes share a title", () => {
    expect(
      resolveArchivePageId(mistypedQuarters, "Feedback", [
        { pageId: "page_notion_a", title: "Feedback" },
        { pageId: "page_notion_b", title: "Feedback" },
      ]),
    ).toBe(mistypedQuarters);
  });
});

describe("renderChatMarkdown", () => {
  it("renders a live note link instead of a raw page id", () => {
    const html = renderChatMarkdown(`developed talent (${dmgt}).`, [
      { pageId: dmgt, title: "Gagné DMGT 2.0" },
    ]);
    expect(html).toContain('class="note-link"');
    expect(html).toContain(`data-open-page="${dmgt}"`);
    expect(html).toContain(`href="#page/${encodeURIComponent(dmgt)}"`);
    expect(html).toContain("Gagné DMGT 2.0");
    expect(html).not.toContain(`(${dmgt})`);
  });

  it("opens the real archive id when Clementine mistypes one hex digit", () => {
    const html = renderChatMarkdown(`[Four quarters marking](${mistypedQuarters})`, [
      { pageId: quarters, title: "Four quarters marking" },
    ]);
    expect(html).toContain(`data-open-page="${quarters}"`);
    expect(html).not.toContain(mistypedQuarters);
  });
});

describe("renderChatMarkdown link safety", () => {
  const payload = "#page/x%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert%281%29%3E";

  it("does not render an encoded #page/ attribute breakout from a model reply", () => {
    const html = renderChatMarkdown(`Read [this](${payload}) next.`);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("note-link");
    expect(html).toContain('<span class="md-link">this</span>');
  });

  it("escapes a hostile note title used as a bare-id label", () => {
    const html = renderChatMarkdown(`See (${dmgt}).`, [
      { pageId: dmgt, title: `<img src=x onerror=alert(1)> x](${payload}` },
    ]);
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/data-open-page="[^"]*[<>]/);
  });
});
