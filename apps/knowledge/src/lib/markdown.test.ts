// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings, emphasis, and lists", () => {
    const html = renderMarkdown(`# Title

A **bold** and *italic* line.

- one
- two
`);
    expect(html).toContain("<h3>Title</h3>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<li>one</li>");
  });

  it("renders level four to six Markdown headings instead of exposing their hashes", () => {
    const html = renderMarkdown(`### What it means

#### 1. What cerebrosides are

##### Supporting detail

###### Final detail
`);
    expect(html).toContain("<h5>What it means</h5>");
    expect(html).toContain("<h6>1. What cerebrosides are</h6>");
    expect(html).toContain("<h6>Supporting detail</h6>");
    expect(html).toContain("<h6>Final detail</h6>");
    expect(html).not.toContain("####");
  });

  it("renders pipe tables", () => {
    const html = renderMarkdown(`## What the archive holds

| ID | Focus |
|---|---|
| page_notion_1 | **four dedicated SDT notes** |
`);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>ID</th>");
    expect(html).toContain("<td>page_notion_1</td>");
    expect(html).toContain("<strong>four dedicated SDT notes</strong>");
    expect(html).not.toContain("| ID | Focus |");
  });

  it("keeps external links clickable and softens local ones", () => {
    const html = renderMarkdown(`[Paper](https://example.com/a.pdf) and [Local](folder/file.pdf)`);
    expect(html).toContain('href="https://example.com/a.pdf"');
    expect(html).toContain('<span class="md-link">Local</span>');
  });

  it("turns archive page markdown into a live note link", () => {
    const html = renderMarkdown(`[Gagné DMGT 2.0](page_notion_1aaf794f84768020a2aec3db6939dedc)`);
    expect(html).toContain('class="note-link"');
    expect(html).toContain('data-open-page="page_notion_1aaf794f84768020a2aec3db6939dedc"');
    expect(html).toContain("Gagné DMGT 2.0");
    expect(html).not.toContain('class="md-link"');
  });
});

describe("renderMarkdown link safety", () => {
  const parse = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host;
  };
  const noInjectedNodes = (host: HTMLElement) => {
    expect(host.querySelector("img, script, iframe, svg, [onerror], [onload], [onclick]")).toBeNull();
  };

  it("does not let an encoded #page/ id break out of data-open-page", () => {
    const html = renderMarkdown("see [note](#page/x%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert%281%29%3E)");
    const host = parse(html);
    noInjectedNodes(host);
    expect(host.querySelector("a.note-link")).toBeNull();
    expect(host.querySelector("span.md-link")?.textContent).toBe("note");
  });

  it("rejects page ids that fail the server's safe-id pattern", () => {
    for (const target of ["#page/a%27b", "#page/%3Cb%3E", "#page/.hidden", "#page/a%20b", "#page/x%26quot%3B"]) {
      const host = parse(renderMarkdown(`[note](${target})`));
      noInjectedNodes(host);
      expect(host.querySelector("a.note-link"), target).toBeNull();
    }
  });

  it("still links safe #page/ ids and escapes them in both attributes", () => {
    const host = parse(renderMarkdown("[note](#page/page_hub_abc123)"));
    const link = host.querySelector<HTMLAnchorElement>("a.note-link")!;
    expect(link.dataset.openPage).toBe("page_hub_abc123");
    expect(link.getAttribute("href")).toBe("#page/page_hub_abc123");
  });

  it("escapes HTML in link labels", () => {
    const host = parse(renderMarkdown('[<img src=x onerror=alert(1)>"](page_hub_abc)'));
    noInjectedNodes(host);
    expect(host.querySelector("a.note-link")?.textContent).toBe('<img src=x onerror=alert(1)>"');
  });

  it("keeps quotes and tags out of external hrefs", () => {
    const host = parse(renderMarkdown('[x](https://example.test/"onmouseover="alert(1)) [y](https://example.test/<script>)'));
    noInjectedNodes(host);
    for (const a of host.querySelectorAll("a")) {
      expect(a.getAttributeNames().sort()).toEqual(["href", "rel", "target"]);
    }
  });

  it("does not turn non-http schemes into links", () => {
    const host = parse(renderMarkdown("[x](javascript:alert(1)) [y](data:text/html,hi)"));
    expect(host.querySelector("a")).toBeNull();
  });

  it("escapes code spans and archive targets built from code spans", () => {
    const host = parse(renderMarkdown("`<img src=x onerror=alert(1)>` [n](page_hub_`x`)"));
    noInjectedNodes(host);
    expect(host.querySelector("code")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(host.querySelector("a.note-link")).toBeNull();
  });
});
