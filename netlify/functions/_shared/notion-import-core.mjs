// Generated from apps/teaching/src/notion-import/server-entry.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/notion-import/block-factory.ts
var DEFAULT_VARIANT = {
  image: "large",
  video: "large",
  embed: "large",
  table: "large",
  html_app: "large",
  heading: "section"
};
function makeBlock(blockType, id, content, now, variant) {
  return {
    id,
    type: "block",
    block_type: blockType,
    variant: variant ?? DEFAULT_VARIANT[blockType] ?? "medium",
    visibility: "student_teacher",
    content,
    layout: {},
    print: {},
    settings: {},
    created_at: now,
    updated_at: now,
    schema_version: 1
  };
}
var BlockIds = class {
  used = /* @__PURE__ */ new Map();
  from(notionId) {
    const base2 = `blk_${notionId.replace(/-/g, "")}`;
    const count = (this.used.get(base2) ?? 0) + 1;
    this.used.set(base2, count);
    return count === 1 ? base2 : `${base2}_${count}`;
  }
};

// apps/teaching/src/blocks/video-url.ts
var YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
var VIMEO_ID = /^\d+$/;
var VIDEO_FILE = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i;
function parseStartTime(raw) {
  const value = raw?.trim().toLowerCase();
  if (!value) return void 0;
  if (/^\d+$/.test(value)) return Number(value) || void 0;
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return void 0;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds || void 0;
}
function withStart(parsed, start) {
  return start ? { ...parsed, start_seconds: start } : parsed;
}
function parseVideoInput(raw) {
  const input = raw.trim();
  if (!input) return null;
  if (YOUTUBE_ID.test(input)) {
    return { provider: "youtube", external_id: input };
  }
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    const youtubeStart = parseStartTime(url.searchParams.get("t") ?? url.searchParams.get("start"));
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      if (YOUTUBE_ID.test(id)) return withStart({ provider: "youtube", external_id: id }, youtubeStart);
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const v = url.searchParams.get("v");
      if (v && YOUTUBE_ID.test(v)) return withStart({ provider: "youtube", external_id: v }, youtubeStart);
      const path = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (path) return withStart({ provider: "youtube", external_id: path[1] }, youtubeStart);
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean).find((part) => VIMEO_ID.test(part)) ?? "";
      const hashStart = parseStartTime(url.hash.match(/t=([0-9hms]+)/i)?.[1]);
      if (id) return withStart({ provider: "vimeo", external_id: id }, hashStart);
    }
    if (url.protocol === "https:" && VIDEO_FILE.test(url.pathname)) {
      return { provider: "file", external_id: url.toString() };
    }
  } catch {
  }
  return null;
}

// apps/teaching/src/blocks/url-safety.ts
function isHttpUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// apps/teaching/src/blocks/embed-url.ts
function slidesEmbedFromPath(pathname) {
  const published = pathname.match(/\/presentation\/d\/e\/([^/]+)/);
  if (published) {
    return `https://docs.google.com/presentation/d/e/${published[1]}/embed`;
  }
  const match = pathname.match(/\/presentation\/d\/([^/]+)/);
  if (!match || match[1] === "e") return void 0;
  return `https://docs.google.com/presentation/d/${match[1]}/embed`;
}
function docsPreviewFromPath(pathname) {
  const published = pathname.match(/\/document\/d\/e\/([^/]+)/);
  if (published) {
    return `https://docs.google.com/document/d/e/${published[1]}/pub?embedded=true`;
  }
  const match = pathname.match(/\/document\/d\/([^/]+)/);
  if (!match || match[1] === "e") return void 0;
  return `https://docs.google.com/document/d/${match[1]}/preview`;
}
function sheetsPreviewFromPath(pathname) {
  const published = pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  if (published) {
    return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pubhtml?widget=true&headers=false`;
  }
  const match = pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match || match[1] === "e") return void 0;
  return `https://docs.google.com/spreadsheets/d/${match[1]}/preview`;
}
function driveFileId(url) {
  const fromPath = url.pathname.match(/\/file\/d\/([^/]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = url.searchParams.get("id")?.trim();
  return fromQuery || void 0;
}
function isGoogleMapsUrl(host, pathname) {
  if (host === "maps.google.com") return true;
  if (host === "goo.gl" && pathname.startsWith("/maps")) return true;
  if ((host === "google.com" || host.endsWith(".google.com")) && pathname.startsWith("/maps")) {
    return true;
  }
  return false;
}
function parseEmbedInput(raw) {
  const input = raw.trim();
  if (!input || !isHttpUrl(input)) return null;
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "docs.google.com" && url.pathname.includes("/presentation/")) {
    if (url.pathname.includes("/embed")) {
      return { provider: "google_slides", embed_url: url.toString() };
    }
    const embed_url = slidesEmbedFromPath(url.pathname);
    return { provider: "google_slides", ...embed_url ? { embed_url } : {} };
  }
  if (host === "docs.google.com" && url.pathname.includes("/document/")) {
    const embed_url = docsPreviewFromPath(url.pathname);
    return { provider: "google_docs", ...embed_url ? { embed_url } : {} };
  }
  if (host === "docs.google.com" && url.pathname.includes("/spreadsheets/")) {
    const embed_url = sheetsPreviewFromPath(url.pathname);
    return { provider: "generic", ...embed_url ? { embed_url } : {} };
  }
  if (host === "drive.google.com") {
    const fileId = driveFileId(url);
    if (fileId) {
      return {
        provider: "pdf",
        embed_url: `https://drive.google.com/file/d/${fileId}/preview`
      };
    }
  }
  if (url.pathname.toLowerCase().endsWith(".pdf")) {
    return { provider: "pdf" };
  }
  if (isGoogleMapsUrl(host, url.pathname)) {
    if (url.pathname.includes("/embed") || url.searchParams.get("output") === "embed") {
      return { provider: "google_maps", embed_url: url.toString() };
    }
    const at = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (at) {
      return {
        provider: "google_maps",
        embed_url: `https://maps.google.com/maps?q=${at[1]},${at[2]}&z=15&output=embed`
      };
    }
    return {
      provider: "google_maps",
      embed_url: `https://maps.google.com/maps?q=${encodeURIComponent(url.href)}&output=embed`
    };
  }
  return { provider: "generic" };
}

// apps/teaching/src/notion-import/columns.ts
var PRESETS = {
  "6,6": "50-50",
  "4,8": "33-67",
  "8,4": "67-33",
  "4,4,4": "33-33-33"
};
function columnWidths(ratios) {
  const n = ratios.length;
  const raw = ratios.map((r) => typeof r === "number" && r > 0 ? r : 1 / n);
  const total = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((r) => r / total * 12);
  const widths = scaled.map((s) => Math.max(1, Math.floor(s)));
  let diff = 12 - widths.reduce((a, b) => a + b, 0);
  const byFraction = scaled.map((s, i) => ({ i, frac: s - Math.floor(s) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; diff > 0; k += 1, diff -= 1) widths[byFraction[k % n].i] += 1;
  while (diff < 0) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] -= 1;
    diff += 1;
  }
  return widths;
}
function columnPreset(widths) {
  return PRESETS[widths.join(",")] ?? "custom";
}

// apps/teaching/src/notion-import/rich-text.ts
function escapeHtml(text2) {
  return text2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, /^\/(?!\/)/.test(href) ? "https://www.notion.so" : void 0);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function plainText(rich) {
  return (rich ?? []).map((span) => span.plain_text ?? "").join("");
}
function richTextHtml(rich) {
  return (rich ?? []).map((span) => {
    let html = escapeHtml(span.plain_text ?? "").replace(/\n/g, "<br>");
    if (!html) return "";
    const a = span.annotations ?? {};
    if (a.underline) html = `<u>${html}</u>`;
    if (a.italic) html = `<em>${html}</em>`;
    if (a.bold) html = `<strong>${html}</strong>`;
    const href = span.type === "text" ? safeHref(span.href) : null;
    if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
    return html;
  }).join("");
}

// apps/teaching/src/notion-import/types.ts
var MEDIA_PLACEHOLDER_PREFIX = "notion-media:";
var EMPTY_CHOICES = { excluded_page_ids: [], overrides: {}, html_as_code: [] };

// apps/teaching/src/notion-import/map-blocks.ts
function createBlockState(pageId, now, htmlAsCode) {
  return {
    page_id: pageId,
    now,
    ids: new BlockIds(),
    warnings: [],
    media: [],
    html_apps: [],
    html_as_code: new Set(htmlAsCode)
  };
}
function warn(st, node, rule, message) {
  st.warnings.push({ page_id: st.page_id, notion_block_id: node?.id ?? null, rule, message });
}
var LIST_TYPES = /* @__PURE__ */ new Set(["bulleted_list_item", "numbered_list_item", "to_do"]);
var TEXT_RUN_TYPES = /* @__PURE__ */ new Set(["paragraph", ...LIST_TYPES]);
var Run = class {
  parts = [];
  html = "";
  hoist(nodes) {
    if (this.html) this.parts.push({ html: this.html });
    this.html = "";
    this.parts.push({ nodes });
  }
  finish() {
    if (this.html) this.parts.push({ html: this.html });
    this.html = "";
    return this.parts;
  }
};
function listItemHtml(item, st, moved) {
  const prefix = item.type === "to_do" ? item.data.checked ? "\u2611 " : "\u2610 " : "";
  let inner = prefix + richTextHtml(item.data.rich_text);
  const nestedLists = item.children.filter((c) => LIST_TYPES.has(c.type));
  const rest = item.children.filter((c) => !LIST_TYPES.has(c.type));
  const textKids = rest.filter(isTextOnly);
  const blockKids = rest.filter((c) => !isTextOnly(c));
  if (nestedLists.length) inner += listsHtml(nestedLists, st, moved);
  if (textKids.length) {
    inner += textKids.map((c) => `<br>${escapeHtml(deepPlainText(c))}`).join("");
    warn(st, item, "flattened", "Content nested under a list item was flattened to text.");
  }
  if (blockKids.length) {
    warn(st, item, "flattened", "Blocks nested under a list item were moved after it.");
    moved.push(...blockKids);
  }
  return `<li>${inner}</li>`;
}
var listTag = (n) => n.type === "numbered_list_item" ? "ol" : "ul";
function listsHtml(items, st, moved) {
  let html = "";
  let i = 0;
  while (i < items.length) {
    const tag = listTag(items[i]);
    let run = "";
    while (i < items.length && listTag(items[i]) === tag) {
      run += listItemHtml(items[i], st, moved);
      i += 1;
    }
    html += `<${tag}>${run}</${tag}>`;
  }
  return html;
}
function listsInto(items, st, r) {
  let i = 0;
  while (i < items.length) {
    const tag = listTag(items[i]);
    let open = false;
    const runStart = i;
    while (i < items.length && listTag(items[i]) === tag) {
      const moved = [];
      const li = listItemHtml(items[i], st, moved);
      if (!open) {
        const n = i - runStart + 1;
        r.html += tag === "ol" && n > 1 ? `<ol start="${n}">` : `<${tag}>`;
        open = true;
      }
      r.html += li;
      i += 1;
      if (moved.length) {
        r.html += `</${tag}>`;
        open = false;
        r.hoist(moved);
      }
    }
    if (open) r.html += `</${tag}>`;
  }
}
function textRunInto(run, st, r) {
  let i = 0;
  while (i < run.length) {
    const n = run[i];
    if (n.type === "paragraph") {
      const text2 = richTextHtml(n.data.rich_text);
      if (text2) r.html += `<p>${text2}</p>`;
      let buffer = [];
      let warned = false;
      let k = 0;
      while (k < n.children.length) {
        const c = n.children[k];
        if (TEXT_RUN_TYPES.has(c.type)) {
          buffer.push(c);
          k += 1;
          continue;
        }
        if (buffer.length) textRunInto(buffer, st, r);
        buffer = [];
        const blocks = [];
        while (k < n.children.length && !TEXT_RUN_TYPES.has(n.children[k].type)) blocks.push(n.children[k++]);
        if (!warned) {
          warn(st, n, "flattened", "Blocks nested under a paragraph were moved after it.");
          warned = true;
        }
        r.hoist(blocks);
      }
      if (buffer.length) textRunInto(buffer, st, r);
      i += 1;
      continue;
    }
    const lists = [];
    while (i < run.length && LIST_TYPES.has(run[i].type)) lists.push(run[i++]);
    listsInto(lists, st, r);
  }
}
function deepPlainText(n) {
  const own = plainText(n.data?.rich_text ?? n.data?.caption);
  const kids = n.children.map(deepPlainText).filter(Boolean);
  return [own, ...kids].filter(Boolean).join("\n");
}
var typeLabel = (n) => n.type === "pdf" ? "PDF" : n.type.replace(/_/g, " ");
function plainParagraphsHtml(text2) {
  return text2.split("\n").filter((line) => line.trim()).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}
function fileUrl(data) {
  if (data.type === "file" && data.file?.url) return { url: data.file.url, hosted: true };
  if (data.type === "file_upload" && data.file_upload?.url) return { url: data.file_upload.url, hosted: true };
  if (data.type === "external" && data.external?.url) return { url: data.external.url, hosted: false };
  return null;
}
function fileName(data, url) {
  if (typeof data.name === "string" && data.name) return data.name;
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "file";
  } catch {
    return "file";
  }
}
function mediaUrl(st, ref, node, url, hosted, name, purpose) {
  if (!hosted) return url;
  st.media.push({ ref, page_id: st.page_id, notion_block_id: node?.id ?? null, url, name, purpose });
  return `${MEDIA_PLACEHOLDER_PREFIX}${ref}`;
}
function warnNoFile(n, st) {
  const label = typeLabel(n);
  warn(st, n, "skipped", `${label.charAt(0).toUpperCase()}${label.slice(1)} has no file; skipped.`);
}
function mediaFile(n, st, purpose) {
  const f = fileUrl(n.data ?? {});
  if (!f) {
    warnNoFile(n, st);
    return null;
  }
  const name = fileName(n.data, f.url);
  return { url: mediaUrl(st, n.id, n, f.url, f.hosted, name, purpose), name, hosted: f.hosted };
}
var FULL_HTML = /<(html|body|script)\b/i;
function mapLeaf(n, st) {
  const id = () => st.ids.from(n.id);
  const now = st.now;
  const d = n.data ?? {};
  switch (n.type) {
    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const variant = n.type === "heading_1" ? "page" : n.type === "heading_2" ? "section" : "subsection";
      return [makeBlock("heading", id(), { text: plainText(d.rich_text) }, now, variant)];
    }
    case "divider":
      return [makeBlock("divider", id(), { tools: true, timer_stack: [] }, now)];
    case "equation":
      return [makeBlock("equation", id(), { latex: String(d.expression ?? "") }, now)];
    case "code": {
      const code = plainText(d.rich_text);
      const language = typeof d.language === "string" ? d.language : void 0;
      if (language === "html" && FULL_HTML.test(code) && !st.html_as_code.has(n.id)) {
        st.html_apps.push({ page_id: st.page_id, notion_block_id: n.id, preview: code.slice(0, 120) });
        warn(st, n, "html_app", "HTML code block will run as an interactive.");
        return [makeBlock("html_app", id(), { html: code }, now)];
      }
      if (language === "mermaid") warn(st, n, "mermaid", "Mermaid diagram kept as code.");
      return [makeBlock("code", id(), { code, language }, now)];
    }
    case "table": {
      const rows = n.children.filter((r) => r.type === "table_row").map((r) => (r.data.cells ?? []).map((cell) => plainText(cell)));
      const headers = d.has_column_header && rows.length ? rows[0] : [];
      return [makeBlock("table", id(), { headers, rows: d.has_column_header ? rows.slice(1) : rows }, now)];
    }
    case "image": {
      const f = mediaFile(n, st, "image");
      if (!f) return [];
      const caption = plainText(d.caption);
      if (!caption) warn(st, n, "alt_text", "Image has no caption, so its alt text is empty.");
      return [makeBlock("image", id(), { url: f.url, alt_text: caption, caption: caption || void 0 }, now)];
    }
    case "video": {
      const raw = fileUrl(d);
      if (!raw) {
        warnNoFile(n, st);
        return [];
      }
      const caption = plainText(d.caption) || void 0;
      if (!raw.hosted) {
        const parsed = parseVideoInput(raw.url);
        if (parsed) return [makeBlock("video", id(), { ...parsed, url: raw.url, caption }, now)];
        warn(st, n, "flattened", "Video is not YouTube, Vimeo or a direct file; kept as a link embed.");
        return [makeBlock("embed", id(), { url: raw.url, provider: "generic" }, now)];
      }
      const f = mediaFile(n, st, "video");
      return [makeBlock("video", id(), { provider: "file", external_id: f.url, url: f.url, caption }, now)];
    }
    case "file": {
      const raw = fileUrl(d);
      const name = raw ? fileName(d, raw.url) : "";
      const isHtml = /\.html?$/i.test(name);
      if (raw && !raw.hosted && isHtml) {
        warn(st, n, "flattened", "External HTML file kept as a link embed; only uploaded files can run as an interactive.");
        return [makeBlock("embed", id(), { url: raw.url, provider: "generic", title: plainText(d.caption) || void 0 }, now)];
      }
      const f = mediaFile(n, st, isHtml ? "html" : "attachment");
      if (!f) return [];
      if (isHtml) {
        warn(st, n, "html_app", `${f.name} will run as an interactive.`);
        return [makeBlock("html_app", id(), { title: f.name, html: f.url }, now)];
      }
      return [makeBlock("attachment", id(), { url: f.url, title: plainText(d.caption) || f.name, filename: f.name }, now)];
    }
    case "pdf": {
      const f = mediaFile(n, st, "pdf");
      return f ? [makeBlock("embed", id(), { url: f.url, provider: "pdf", title: plainText(d.caption) || void 0 }, now)] : [];
    }
    case "audio": {
      const f = mediaFile(n, st, "audio");
      return f ? [makeBlock("audio", id(), { url: f.url, title: plainText(d.caption) || void 0 }, now)] : [];
    }
    case "embed":
    case "bookmark":
    case "link_preview": {
      const url = String(d.url ?? "");
      if (!url) return null;
      const parsed = n.type === "embed" ? parseEmbedInput(url) : null;
      return [makeBlock("embed", id(), {
        url,
        provider: parsed?.provider ?? "generic",
        embed_url: parsed?.embed_url,
        title: plainText(d.caption) || void 0
      }, now)];
    }
    case "child_database":
    case "link_to_page":
    case "table_of_contents":
    case "breadcrumb":
      warn(st, n, "skipped", `Notion ${typeLabel(n)} skipped.`);
      return [];
    default:
      return null;
  }
}
function unsupportedNode(n, st) {
  warn(st, n, "unsupported", `Notion ${typeLabel(n)} block is not supported; kept its text.`);
  const html = plainParagraphsHtml(deepPlainText(n));
  return html ? [makeBlock("rich_text", st.ids.from(n.id), { html }, st.now)] : [];
}
function warnUnreadable(nodes, st) {
  for (const n of nodes) {
    if (n.children_error) {
      warn(st, n, "skipped", `Notion would not return the contents of this ${typeLabel(n)} block (${n.children_error}); it was left out.`);
    }
    warnUnreadable(n.children, st);
  }
}
function mapBlocks(nodes, scope, st) {
  const out = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    if (TEXT_RUN_TYPES.has(n.type)) {
      const run = [];
      while (i < nodes.length && TEXT_RUN_TYPES.has(nodes[i].type)) run.push(nodes[i++]);
      const r = new Run();
      textRunInto(run, st, r);
      for (const part of r.finish()) {
        if ("html" in part) out.push(makeBlock("rich_text", st.ids.from(run[0].id), { html: part.html }, st.now));
        else out.push(...mapBlocks(part.nodes, scope, st));
      }
      continue;
    }
    const layout = mapLayout(nodes, i, scope, st);
    if (layout) {
      out.push(...layout.blocks);
      i = layout.next;
      continue;
    }
    out.push(...mapLeaf(n, st) ?? unsupportedNode(n, st));
    i += 1;
  }
  return out;
}
var CALLOUT_BY_COLOUR = {
  red: "warning",
  orange: "warning",
  yellow: "important",
  blue: "information",
  green: "remember",
  purple: "extension",
  pink: "extension"
};
var stripVs = (e) => e.replace(/\uFE0F/g, "");
var CALLOUT_BY_EMOJI_RAW = {
  "\u26A0\uFE0F": "warning",
  "\u2757": "warning",
  "\u2139\uFE0F": "information",
  "\u{1F4CB}": "information",
  "\u{1F4C5}": "information",
  "\u2705": "remember",
  "\u{1F680}": "extension"
};
var CALLOUT_BY_EMOJI = Object.fromEntries(
  Object.entries(CALLOUT_BY_EMOJI_RAW).map(([k, v]) => [stripVs(k), v])
);
function calloutStyle(data) {
  const colour = String(data.color ?? "").replace(/_background$/, "");
  if (CALLOUT_BY_COLOUR[colour]) return CALLOUT_BY_COLOUR[colour];
  const emoji = data.icon?.type === "emoji" ? data.icon.emoji : "";
  return CALLOUT_BY_EMOJI[stripVs(String(emoji))] ?? "information";
}
function isTextOnly(n) {
  return TEXT_RUN_TYPES.has(n.type) && n.children.every(isTextOnly);
}
function isTextOnlyToggle(n) {
  return n.type === "toggle" && n.children.every(isTextOnly);
}
function isToggleHeading(n) {
  return /^heading_[123]$/.test(n.type) && n.data?.is_toggleable === true;
}
function boldLine(text2, st, notionId) {
  return makeBlock("rich_text", st.ids.from(notionId), { html: `<p><strong>${escapeHtml(text2)}</strong></p>` }, st.now);
}
function titledGroup(title, children, scope, st, notionId, boldInColumn = true) {
  if (scope === "top") {
    return [makeBlock("section", st.ids.from(notionId), {
      title,
      collapsed_in_editor: true,
      blocks: mapBlocks(children, "section", st)
    }, st.now)];
  }
  const inner = mapBlocks(children, scope, st);
  if (scope === "column" && boldInColumn) return [boldLine(title, st, notionId), ...inner];
  return [makeBlock("heading", st.ids.from(notionId), { text: title }, st.now, "subsection"), ...inner];
}
function mapCallout(n, scope, st) {
  const textKids = n.children.filter(isTextOnly);
  const otherKids = n.children.filter((c) => !isTextOnly(c));
  const body = [plainText(n.data.rich_text), ...textKids.map(deepPlainText)].filter(Boolean).join("\n");
  const callout = makeBlock("callout", st.ids.from(n.id), { style: calloutStyle(n.data), body }, st.now);
  if (!otherKids.length) return [callout];
  warn(st, n, "flattened", "Images or other blocks inside a callout were placed after it.");
  return [callout, ...mapBlocks(otherKids, scope, st)];
}
function mapQuote(n, scope, st) {
  const textKids = n.children.filter(isTextOnly);
  const otherKids = n.children.filter((c) => !isTextOnly(c));
  const quote = [plainText(n.data.rich_text), ...textKids.map(deepPlainText)].filter(Boolean).join("\n");
  const block = makeBlock("quote", st.ids.from(n.id), { quote }, st.now);
  if (!otherKids.length) return [block];
  warn(st, n, "flattened", "Images or other blocks inside a quote were placed after it.");
  return [block, ...mapBlocks(otherKids, scope, st)];
}
function mapSynced(n, scope, st) {
  warn(st, n, "flattened", "Synced block copied as plain text; the sync link was dropped.");
  const textKids = n.children.filter(isTextOnly);
  const otherKids = n.children.filter((c) => !isTextOnly(c));
  const html = plainParagraphsHtml(textKids.map(deepPlainText).join("\n"));
  const out = html ? [makeBlock("rich_text", st.ids.from(n.id), { html }, st.now)] : [];
  return [...out, ...mapBlocks(otherKids, scope, st)];
}
function mapColumns(n, scope, st) {
  const cols = n.children.filter((c) => c.type === "column");
  if (scope === "column" || cols.length > 12) {
    warn(st, n, "flattened", cols.length > 12 ? "More than 12 columns; stacked." : "Columns inside a column were stacked.");
    return cols.flatMap((c) => mapBlocks(c.children, scope, st));
  }
  if (cols.length <= 1) return cols.flatMap((c) => mapBlocks(c.children, scope, st));
  const widths = columnWidths(cols.map((c) => c.data?.width_ratio));
  return [makeBlock("columns", st.ids.from(n.id), {
    preset: columnPreset(widths),
    columns: cols.map((c, k) => ({ width: widths[k], blocks: mapBlocks(c.children, "column", st) }))
  }, st.now)];
}
function mapTabs(n, scope, st) {
  const items = n.children.filter((c) => c.type === "tab");
  const label = (t, k) => String(t.data?.label ?? "").trim() || `Tab ${k + 1}`;
  const fits = items.length >= 2 && items.length <= 8;
  if (fits && (scope === "top" || scope === "section")) {
    return [makeBlock("tabs", st.ids.from(n.id), {
      tabs: items.map((t, k) => ({ id: `${st.ids.from(t.id)}`, label: label(t, k), blocks: mapBlocks(t.children, "tabs", st) }))
    }, st.now)];
  }
  if (scope !== "top" || !fits) {
    warn(st, n, "flattened", fits ? "Tabs inside tabs or columns became headings." : `${items.length} tab(s) cannot be a tabs block; each became its own group.`);
  }
  return items.flatMap((t, k) => titledGroup(label(t, k), t.children, scope, st, t.id, false));
}
function mapLayout(nodes, i, scope, st) {
  const n = nodes[i];
  if (isTextOnlyToggle(n)) {
    const run = [];
    let j = i;
    while (j < nodes.length && isTextOnlyToggle(nodes[j])) run.push(nodes[j++]);
    const items = run.map((t) => ({ title: plainText(t.data.rich_text), body: t.children.map(deepPlainText).join("\n") }));
    return { blocks: [makeBlock("accordion", st.ids.from(run[0].id), { items }, st.now)], next: j };
  }
  if (n.type === "toggle" || isToggleHeading(n)) {
    if (scope !== "top") warn(st, n, "flattened", "A toggle inside a layout was opened out.");
    return { blocks: titledGroup(plainText(n.data.rich_text), n.children, scope, st, n.id), next: i + 1 };
  }
  if (n.type === "quote") return { blocks: mapQuote(n, scope, st), next: i + 1 };
  if (n.type === "synced_block") return { blocks: mapSynced(n, scope, st), next: i + 1 };
  if (n.type === "callout") return { blocks: mapCallout(n, scope, st), next: i + 1 };
  if (n.type === "column_list") return { blocks: mapColumns(n, scope, st), next: i + 1 };
  if (n.type === "tabs") return { blocks: mapTabs(n, scope, st), next: i + 1 };
  if (n.type === "child_page") {
    warn(st, n, "flattened", `Sub-page \u201C${n.data.title ?? ""}\u201D was placed inline.`);
    const heading = makeBlock("heading", st.ids.from(n.id), { text: String(n.data.title ?? "Untitled") }, st.now, "section");
    return { blocks: [heading, ...mapBlocks(n.children, scope, st)], next: i + 1 };
  }
  return null;
}

// apps/teaching/src/notion-import/map-entities.ts
var MODE_CATEGORIES = {
  Lesson: "lesson",
  Session: "lesson",
  Lab: "lab",
  Workshop: "workshop",
  Lecture: "lecture",
  Tutorial: "tutorial",
  Seminar: "seminar",
  Project: "project",
  "Case Study": "case_study",
  Game: "game",
  "Station Rotation": "station_rotation",
  "Design Sprint": "design_sprint",
  Assessment: "assessment"
};
function categoryRule(category) {
  if (category === "Unit") return { kind: "unit", label: "Unit" };
  if (category === "Program" || category === "Enrichment Program") return { kind: "unit", label: "Program", program: true };
  if (category === "Class") return { kind: "class", label: "Class" };
  if (category === "Syllabus") return { kind: "document", label: "Syllabus" };
  if (category === "Curriculum Map" || category === "Scope and Sequence") return { skip: `${category} pages are not imported.` };
  if (category && MODE_CATEGORIES[category]) return { kind: "lesson", label: category, mode: MODE_CATEGORIES[category] };
  return { kind: "lesson", label: "Lesson", mode: "lesson" };
}
var ID_PREFIX = { unit: "unit", lesson: "lesson", class: "class", document: "document" };
function slug(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
}
function day(value) {
  return value ? value.slice(0, 10) : void 0;
}
function buildImportPlan(tree, ctx) {
  const plan = {
    root_page_id: tree.root_id,
    entities: [],
    skipped: [],
    new_subjects: [],
    media: [],
    warnings: [],
    html_apps: []
  };
  for (const u of tree.unreadable ?? []) {
    plan.warnings.push({ page_id: u.parent_id, notion_block_id: null, rule: "skipped", message: `A sub-page could not be read from Notion (${u.code}); share it with the integration or import it separately.` });
  }
  const excluded = new Set(ctx.choices.excluded_page_ids);
  const byPage = /* @__PURE__ */ new Map();
  const resolveYear = (pg) => {
    const levels = pg.years.map((y) => Number(y.match(/\d+/)?.[0])).filter(Number.isFinite).sort((a, b) => a - b);
    for (const level of levels) {
      const hit = ctx.years.find((y) => y.year_level === level);
      if (hit) return hit.id;
    }
    return void 0;
  };
  const resolveSubject = (pg) => {
    const wanted = pg.subjects[0];
    if (!wanted) return {};
    const hit = ctx.subjects.find((s) => s.title.trim().toLowerCase() === wanted.trim().toLowerCase());
    return hit ? { id: hit.id, title: hit.title } : { title: wanted };
  };
  const subjectFromCreate = (title) => {
    const id = `subject_n_${slug(title)}`;
    if (!plan.new_subjects.some((s) => s.id === id)) plan.new_subjects.push({ id, title });
    return id;
  };
  const visit = (pageId, parent, nearestUnit) => {
    const pg = tree.pages[pageId];
    if (!pg || excluded.has(pageId)) return;
    const displayTitle = pg.title.trim() || "Untitled";
    if (byPage.has(pageId)) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "skipped", message: `\u201C${displayTitle}\u201D appears more than once; imported only under its first parent.` });
      return;
    }
    const rule = categoryRule(pg.category);
    if ("skip" in rule) {
      plan.skipped.push({ page_id: pageId, parent_page_id: parent?.page_id ?? null, title: displayTitle, reason: rule.skip });
      return;
    }
    const st = createBlockState(pageId, ctx.now, ctx.choices.html_as_code);
    warnUnreadable(pg.blocks, st);
    const blocks = mapBlocks(pg.blocks, "top", st);
    pg.files.forEach((f, k) => {
      const ref = `file:${pageId}:${k}`;
      const url = mediaUrl(st, ref, null, f.url, f.source === "file", f.name, "attachment");
      blocks.push(makeBlock("attachment", st.ids.from(`${pageId}-file-${k}`), { url, title: f.name, filename: f.name }, ctx.now));
    });
    const cover = pg.cover ? { url: mediaUrl(st, `cover:${pageId}`, null, pg.cover.url, pg.cover.source === "file", pg.cover.name, "cover") } : void 0;
    const override = ctx.choices.overrides[pageId] ?? {};
    let existingId = ctx.source_map[pageId];
    if (existingId && !existingId.startsWith(`${ID_PREFIX[rule.kind]}_`)) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "limit", message: "This page changed type since it was last imported; it will import as a new item." });
      existingId = void 0;
    }
    const id = existingId ?? `${ID_PREFIX[rule.kind]}_n_${pageId.replace(/-/g, "")}`;
    const title = displayTitle;
    const needs = [];
    const inheritedYear = parent?.record.year_id;
    const inheritedSubject = parent?.record.subject_id;
    const year_id = override.year_id ?? resolveYear(pg) ?? inheritedYear;
    const subject = resolveSubject(pg);
    const subject_id = override.subject_id ?? (override.create_subject_title ? subjectFromCreate(override.create_subject_title) : void 0) ?? subject.id ?? inheritedSubject;
    if (subject_id && !override.subject_id && !override.create_subject_title && !subject.id && subject.title && subject_id === inheritedSubject) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "limit", message: `Subject \u201C${subject.title}\u201D isn't in the Teaching Hub; using the parent's subject.` });
    }
    if (pg.years.length && !override.year_id && !resolveYear(pg) && year_id && year_id === inheritedYear) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "limit", message: `Year \u201C${pg.years.join(", ")}\u201D isn't in the Teaching Hub; using the parent's year.` });
    }
    if (rule.kind === "unit" && parent?.record.kind === "program") {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "flattened", message: "Units inside a program import as separate units." });
    }
    const outcome_ids = [];
    const matchOutcomes = rule.kind === "unit" || rule.kind === "lesson";
    if (!matchOutcomes && pg.outcomes.length) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "skipped", message: `Outcomes on ${rule.label} pages are not imported.` });
    }
    for (const code of matchOutcomes ? pg.outcomes : []) {
      const hit = ctx.outcomes.find((o) => o.code.toLowerCase() === code.toLowerCase());
      if (hit) outcome_ids.push(hit.id);
      else plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "outcome_unmatched", message: `Outcome ${code} is not in the outcome catalogue.` });
    }
    if (outcome_ids.length > 24) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "limit", message: "Only the first 24 outcomes were kept." });
      outcome_ids.length = 24;
    }
    const common = {
      id,
      title,
      slug: slug(title),
      status: "active",
      created_at: ctx.now,
      updated_at: ctx.now,
      schema_version: 1,
      ...cover ? { cover } : {},
      source: { system: "notion", page_id: pageId, imported_at: ctx.now, last_edited_at: pg.last_edited_time }
    };
    let record;
    if (rule.kind === "lesson") {
      const unit_id = nearestUnit?.id ?? override.unit_id;
      if (!unit_id) needs.push("unit");
      const siblings = nearestUnit ? nearestUnit.record.lesson_ids : null;
      siblings?.push(id);
      record = {
        ...common,
        type: "lesson",
        unit_id: unit_id ?? "",
        sequence: siblings ? siblings.length : 1,
        blocks,
        pedagogical_mode: rule.mode,
        review_status: "needs_review",
        ...outcome_ids.length ? { outcome_ids } : {}
      };
    } else {
      if (!subject_id) needs.push("subject");
      if (rule.kind !== "document" && !year_id) needs.push("year");
      if (rule.kind === "unit") {
        record = {
          ...common,
          type: "unit",
          year_id: year_id ?? "",
          subject_id: subject_id ?? "",
          lesson_ids: [],
          blocks,
          ...rule.program ? { kind: "program" } : {},
          ...day(pg.date_start) ? { start_date: day(pg.date_start) } : {},
          ...day(pg.date_end) ? { end_date: day(pg.date_end) } : {},
          ...outcome_ids.length ? { outcome_ids } : {}
        };
      } else if (rule.kind === "class") {
        record = {
          ...common,
          type: "class",
          code: slug(title),
          display_name: title,
          academic_year: pg.date_start ? Number(pg.date_start.slice(0, 4)) : Number(ctx.now.slice(0, 4)),
          year_id: year_id ?? "",
          subject_id: subject_id ?? "",
          active_unit_ids: [],
          homepage: { announcements: [], resources: [], custom: blocks }
        };
      } else {
        record = { ...common, type: "document", kind: "syllabus", subject_id: subject_id ?? "", blocks };
      }
    }
    const entity = {
      page_id: pageId,
      parent_page_id: parent?.page_id ?? null,
      kind: rule.kind,
      label: rule.label,
      id,
      title,
      existing: Boolean(existingId),
      needs,
      suggested: { year_id: resolveYear(pg), subject_id: subject.id, subject_title: subject.title },
      record
    };
    plan.entities.push(entity);
    byPage.set(pageId, entity);
    plan.media.push(...st.media);
    plan.warnings.push(...st.warnings);
    plan.html_apps.push(...st.html_apps);
    for (const need of needs) {
      plan.warnings.push({ page_id: pageId, notion_block_id: null, rule: "needs_choice", message: `Choose a ${need} for \u201C${title}\u201D.` });
    }
    const childUnit = rule.kind === "unit" ? entity : rule.kind === "lesson" ? nearestUnit : null;
    for (const childId of pg.child_ids) {
      const before = plan.entities.length;
      visit(childId, entity, childUnit);
      const child = plan.entities[before];
      if (!child || child.parent_page_id !== pageId) continue;
      if (entity.kind === "class" && child.kind === "unit" && !child.record.kind) record.active_unit_ids.push(child.id);
    }
  };
  visit(tree.root_id, null, null);
  return plan;
}

// apps/teaching/src/schemas/lesson.ts
import { z as z14 } from "zod";

// apps/teaching/src/curriculum/pedagogical-mode.ts
import { z } from "zod";
var PEDAGOGICAL_MODES = [
  "lab",
  "workshop",
  "lesson",
  "lecture",
  "tutorial",
  "seminar",
  "project",
  "case_study",
  "game",
  "station_rotation",
  "design_sprint",
  "assessment",
  "quiz"
];
var PedagogicalModeSchema = z.enum(PEDAGOGICAL_MODES);

// apps/teaching/src/schemas/common.ts
import { z as z2 } from "zod";
var StatusSchema = z2.enum(["active", "archived", "trashed"]);
var IsoDateSchema = z2.string().datetime();
var CommonFields = {
  id: z2.string().min(1),
  title: z2.string().min(1),
  slug: z2.string().min(1),
  status: StatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z2.literal(1)
};
var TrashFieldsSchema = z2.object({
  trashed_at: IsoDateSchema.optional(),
  previous_status: z2.enum(["active", "archived"]).optional(),
  trash_reason: z2.string().min(1).optional()
});
var TrashFields = {
  trashed_at: IsoDateSchema.optional(),
  previous_status: z2.enum(["active", "archived"]).optional(),
  trash_reason: z2.string().min(1).optional()
};

// apps/teaching/src/schemas/block.ts
import { z as z11 } from "zod";

// apps/teaching/src/skills/schema.ts
import { z as z3 } from "zod";
var SKILL_STRANDS = ["reading", "arguing", "comparing", "valuing", "composing", "speaking", "language"];
var RUNG_IDS = ["capable", "skilled", "accomplished", "excellent"];
var SkillRefSchema = z3.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/);
var Short = z3.string().max(400);
var Long = z3.string().max(1500);
var SkillPartSchema = z3.object({ id: z3.string().min(1).max(40), name: Short, job: Long, language: z3.array(Short).max(8).default([]) });
var SkillBuildSchema = z3.object({
  formula: z3.array(Short).max(8),
  parts: z3.array(SkillPartSchema).min(1).max(8),
  example: z3.array(z3.tuple([Long, z3.string().max(40).nullable()])).min(1).max(20),
  why_here: Long,
  checks: z3.array(Short).max(8),
  next_move: Long,
  steps: z3.array(Long).max(8).optional(),
  technique: z3.object({ name: Short, how: Long, pairs: z3.array(z3.tuple([Long, Long])).max(8) }).optional()
});
var SkillIndicatorSchema = z3.object({ group: Short, text: Long, eg: Long.optional() });
var SkillRungSchema = z3.object({ i_can: Long, indicators: z3.array(SkillIndicatorSchema).max(12).default([]), build: SkillBuildSchema });
var SkillSubStrandSchema = z3.object({
  id: z3.string().regex(/^[a-z-]{2,40}$/),
  name: Short,
  in_hsc: Long,
  draws_on: Long,
  example_question: Long.optional(),
  example_claim: Long.optional(),
  example_note: Long.optional(),
  outcomes: z3.array(z3.number().int().min(1).max(12)).max(6).default([]),
  focus_areas: z3.array(z3.string().regex(/^[a-z0-9-]{2,40}$/)).max(8).default([]),
  /** The syllabus dot points it builds. Outcomes and focus areas follow from these; without any, they stand alone. */
  points: z3.array(z3.object({ area: z3.string().regex(/^[a-z0-9-]{2,40}$/), point: z3.string().regex(/^[UR]\d{1,2}$/), link: z3.enum(["shared", "related"]) })).max(40).default([]),
  rungs: z3.object({ capable: SkillRungSchema, skilled: SkillRungSchema, accomplished: SkillRungSchema, excellent: SkillRungSchema })
});
var SkillRungInfoSchema = z3.object({ id: z3.enum(RUNG_IDS), name: Short, marks: Short, marker_words: Short, meaning: Long });
var SkillStrandSchema = z3.object({
  schema: z3.literal("skills_strand_v1"),
  strand: z3.enum(SKILL_STRANDS),
  name: Short,
  summary: Long,
  rungs: z3.array(SkillRungInfoSchema).length(4),
  sub_strands: z3.array(SkillSubStrandSchema).min(1).max(12)
});
var SkillsContinuumSchema = z3.object({ strands: z3.array(SkillStrandSchema).min(1).max(SKILL_STRANDS.length), fetched_at: z3.string().optional() });

// apps/teaching/src/schemas/kaplan.ts
import { z as z4 } from "zod";
var KaplanLensSchema = z4.enum(["patterns", "multiple_perspectives", "ethics"]);
var ThreePromptsSchema = z4.tuple([
  z4.string().max(1200),
  z4.string().max(1200),
  z4.string().max(1200)
]);
var KaplanQualifierSchema = z4.object({
  lens: KaplanLensSchema,
  focus: z4.string().trim().max(200).default(""),
  mode: z4.enum(["notes", "discussion"]).default("notes"),
  prompts: ThreePromptsSchema.optional(),
  supports: z4.tuple([
    z4.string().max(1200).nullable(),
    z4.string().max(1200).nullable(),
    z4.string().max(1200).nullable()
  ]).optional()
});
var KaplanQualifiersSchema = z4.array(KaplanQualifierSchema).max(3).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.lens)).size !== items.length) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: "Use each Kaplan lens once per block." });
  }
});

// apps/teaching/src/schemas/discern.ts
import { z as z5 } from "zod";
var DiscernModeSchema = z5.enum(["own", "theirs"]);
var DiscernInitialTypeSchema = z5.enum(["scale", "choose", "write"]);
var DiscernScalePresetSchema = z5.enum(["agree", "extent", "effect", "verdict"]);
var DiscernQualifierSchema = z5.object({
  /** own: the student's answer. theirs: a character's or historical figure's choice. */
  mode: DiscernModeSchema.default("own"),
  who: z5.string().trim().max(80).default(""),
  /** What is being judged. Fills every default prompt. */
  focus: z5.string().trim().max(200).default(""),
  /** Optional evidence source, e.g. "the poems" or "Source B". */
  source: z5.string().trim().max(120).default(""),
  initial: z5.object({
    type: DiscernInitialTypeSchema.default("scale"),
    preset: DiscernScalePresetSchema.default("agree"),
    /** Scale points or choices. Empty scale points fall back to the preset. */
    options: z5.array(z5.string().trim().max(60)).max(5).default([])
  }).default({}),
  /** Teacher overrides for the five step prompts; an empty string keeps the default. */
  prompts: z5.array(z5.string().max(1200)).length(5).optional(),
  /** "Their choice" only: students also plot how settled the character is across key moments. */
  character_tail: z5.object({
    enabled: z5.boolean().default(false),
    moments: z5.array(z5.string().trim().max(80)).max(6).default([])
  }).optional()
});

// apps/teaching/src/schemas/lens.ts
import { z as z6 } from "zod";
var LensAttachmentSchema = z6.object({
  id: z6.string().min(1).max(60),
  config: z6.record(z6.unknown())
});
var LensAttachmentsSchema = z6.array(LensAttachmentSchema).max(6).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    ctx.addIssue({ code: z6.ZodIssueCode.custom, message: "Use each lens once per block." });
  }
});
var LensLevelSchema = z6.enum(["support", "core", "extend"]);
var StepTextSchema = z6.string().max(1200);
var WindowsMirrorsConfigSchema = z6.object({
  focus: z6.string().trim().max(200).default(""),
  answer_with: z6.enum(["window", "mirror", "both", "choice"]).default("both"),
  level: LensLevelSchema.default("core"),
  student_level: z6.boolean().default(true),
  mode: z6.enum(["notes", "discussion"]).default("notes"),
  /** Teacher overrides keyed `${level}.${stepId}`; empty keeps the default. */
  prompts: z6.record(StepTextSchema).optional(),
  supports: z6.record(StepTextSchema.nullable()).optional(),
  examples: z6.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});
var SteppedLensConfigSchema = WindowsMirrorsConfigSchema.omit({ answer_with: true });
var LogicSchema = z6.enum(["deductive", "inductive", "abductive", "all_three", "choice"]);
var ReasoningConfigSchema = z6.object({
  focus: z6.string().trim().max(200).default(""),
  logic: LogicSchema.default("choice"),
  level: LensLevelSchema.default("core"),
  student_level: z6.boolean().default(true),
  mode: z6.enum(["notes", "discussion"]).default("notes"),
  prompts: z6.record(StepTextSchema).optional(),
  supports: z6.record(StepTextSchema.nullable()).optional(),
  examples: z6.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});

// apps/teaching/src/tutorial/schema.ts
import { z as z7 } from "zod";
var GAP_TYPES = ["knowledge", "mix_up"];
var TutorialGroupIdSchema = z7.string().regex(/^[a-z0-9_-]{1,40}$/);
var TutorialGroupSchema = z7.object({
  id: TutorialGroupIdSchema,
  /** Teacher-facing: "Re-tells the plot". Students never see it. */
  name: z7.string().min(1).max(80),
  /** Teacher-facing: why this group gets it wrong. */
  why: z7.string().max(300),
  /** Student-facing goal, written as what they will do: "Today: explaining the effect". */
  goal: z7.string().max(140),
  gap_type: z7.enum(GAP_TYPES),
  students: z7.array(z7.string().min(1).max(64)).max(40),
  /** Ann's evidence for placing each student, from their recorded mistakes. */
  evidence: z7.array(z7.object({ student: z7.string().min(1).max(64), quote: z7.string().max(300) })).max(80).default([]),
  /** Teacher-facing: what to build for this group. Shown as a teacher note at the top of its tab. */
  notes: z7.string().max(1200).optional(),
  /** Students the teacher marked unsure; the exit check confirms the placement. */
  unsure: z7.array(z7.string().min(1).max(64)).max(40).optional()
});
var TutorialSettingsSchema = z7.object({
  class_id: z7.string().min(1).max(64),
  /** The evidence tag the tutorial works on, e.g. "tech:cyclical_structure". */
  tag: z7.string().max(80).optional(),
  /** The quiz whose evidence flagged these students. */
  source_lesson_id: z7.string().max(64).optional(),
  groups: z7.array(TutorialGroupSchema).max(8)
});

// apps/teaching/src/sprint/schema.ts
import { z as z8 } from "zod";
var SPRINT_PHASES = ["understand", "sketch", "decide", "prototype", "test"];
var SprintPhaseKeySchema = z8.enum(SPRINT_PHASES);
var LevelSchema = z8.union([z8.literal(1), z8.literal(2), z8.literal(3)]);
var SPRINT_LIMITS = { criteria: 5, requirements: 6, groups: 10, groupSize: 12, ideas: 5, parts: 6, files: 3, fileBytes: 5 * 1024 * 1024 };
var SprintIdSchema = z8.string().regex(/^[a-z0-9_-]{1,40}$/);
var Day = z8.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
var Time = z8.string().regex(/^(\d{2}:\d{2})?$/);
var text = (max) => z8.string().trim().max(max);
var SprintCriterionSchema = z8.object({
  id: SprintIdSchema,
  text: z8.string().trim().min(1).max(160),
  /** Markbook outcome catalogue id, from the lesson's dot points. */
  outcome: z8.string().min(1).max(64).optional()
});
var SprintRequirementSchema = z8.object({
  id: SprintIdSchema,
  text: z8.string().trim().min(1).max(160),
  phases: z8.array(SprintPhaseKeySchema).max(5).default(["sketch", "prototype"])
});
var IdeaGuideSchema = z8.object({
  checklist: z8.array(z8.string().trim().min(1).max(160)).min(1).max(8),
  model: z8.object({
    topic: text(80),
    text: text(800),
    /** "1 answers the question", one per marked part. */
    notes: z8.array(text(120)).max(6).default([])
  }),
  pair: z8.object({ developing: text(400), strong: text(400), note: text(200) }).optional()
});
var SprintPhaseSchema = z8.object({
  key: SprintPhaseKeySchema,
  where: z8.enum(["class", "home"]),
  due_date: Day.default(""),
  due_time: Time.default("15:00"),
  /** Class phases: when the class part ends on its own, "YYYY-MM-DDTHH:MM" Sydney time, or empty. */
  ends_at: z8.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/).default(""),
  instruction: text(600).default(""),
  /** Understand and Sketch: ideas each student writes. */
  ideas: z8.number().int().min(1).max(SPRINT_LIMITS.ideas).optional(),
  stretch: text(300).default("")
});
var SprintGroupSchema = z8.object({
  id: SprintIdSchema,
  name: z8.string().trim().min(1).max(40),
  students: z8.array(z8.string().min(1).max(64)).max(SPRINT_LIMITS.groupSize)
});
var UNDERSTAND_ALONE = ["spot", "audience", "dig", "say", "limits"];
var UNDERSTAND_GROUP = ["vote", "merge", "grid", "ask", "expert"];
var UNDERSTAND_STEPS = [...UNDERSTAND_ALONE, ...UNDERSTAND_GROUP];
var allSteps = () => Object.fromEntries(UNDERSTAND_STEPS.map((k) => [k, true]));
var UnderstandSettingsSchema = z8.object({
  layout: z8.enum(["slides", "vertical"]).default("slides"),
  steps: z8.record(z8.string(), z8.boolean()).default(allSteps).transform((v) => ({ ...allSteps(), ...Object.fromEntries(Object.entries(v).filter(([k]) => UNDERSTAND_STEPS.includes(k))) }))
});
var defaultUnderstand = () => ({ layout: "slides", steps: allSteps() });
var phasesInOrder = (phases) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);
var SprintSettingsSchema = z8.object({
  class_id: z8.string().min(1).max(64),
  decider: z8.enum(["top_vote", "teacher"]).default("teacher"),
  support: z8.enum(["guided", "standard", "open"]).default("standard"),
  lock_hours: z8.number().int().min(0).max(24).default(2),
  criteria: z8.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z8.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z8.array(text(200)).max(2).default([]),
  requirements: z8.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  phases: z8.array(SprintPhaseSchema).length(5).refine(phasesInOrder, "Phases must be in order: Understand, Sketch, Decide, Prototype, Test."),
  groups: z8.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  understand: UnderstandSettingsSchema.default(defaultUnderstand),
  /** Sketch's rapid ideas: minutes on the timer, 0 for no timer. */
  sketch_timer: z8.number().int().min(0).max(30).default(8),
  /** Decide's stand-out dots each student places on parts of any idea; 0 turns them off. */
  decide_dots: z8.number().int().min(0).max(5).default(3),
  /** Markbook assessment columns made for this sprint's marks. */
  columns: z8.object({ prototype: z8.string().optional(), reflection: z8.string().optional() }).default({})
});
var PublicSprintSchema = z8.object({
  support: z8.enum(["guided", "standard", "open"]),
  lock_hours: z8.number().int().min(0).max(24),
  criteria: z8.array(SprintCriterionSchema.omit({ outcome: true })).max(SPRINT_LIMITS.criteria),
  reflection_criteria: z8.array(SprintCriterionSchema.omit({ outcome: true })).max(3),
  reflection_prompts: z8.array(z8.string().max(200)).max(2),
  requirements: z8.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements),
  idea_guide: IdeaGuideSchema,
  phases: z8.array(SprintPhaseSchema).length(5),
  understand: UnderstandSettingsSchema.default(defaultUnderstand),
  sketch_timer: z8.number().int().min(0).max(30).default(8),
  decide_dots: z8.number().int().min(0).max(5).default(3)
});
var where = text(200);
var Wheres = z8.record(z8.string().max(40), where).default({});
var cards = z8.array(text(120)).max(8).default([]);
var UnderstandPayloadSchema = z8.object({
  /** Earlier sprints' "How might we" notes; still read, no longer written. */
  notes: z8.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's statements) this student starred. */
  star: z8.string().max(40).default(""),
  stretch: text(300).default(""),
  /** Words from the brief that stand out. */
  spot: z8.array(text(40)).max(30).default([]),
  audience: z8.object({ who: text(200).default(""), why: text(300).default("") }).default({ who: "", why: "" }),
  /** The surface problem, then each "why is that a problem?". */
  dig: z8.array(text(300)).max(6).default([]),
  /** The problem in their own words. */
  say: text(400).default(""),
  limits: z8.object({ can_known: cards, cant_known: cards, can_unknown: cards, cant_unknown: cards }).default({ can_known: [], cant_known: [], can_unknown: [], cant_unknown: [] })
});
var SketchCardSchema = z8.object({
  id: SprintIdSchema,
  /** The rapid idea it grew from. */
  seed: text(120).optional(),
  title: text(80),
  idea: text(600),
  answers: text(600),
  evidence: text(600),
  file: z8.string().max(40).optional(),
  /** Criterion id → the line that shows it. */
  criteria: Wheres,
  /** Requirement id → where it is. */
  requirements: Wheres,
  value_answer: text(300).default("")
});
var SketchPayloadSchema = z8.object({
  /** Examples worth borrowing from, and what to take from each. */
  inspiration: z8.array(z8.object({ from: text(120).default(""), borrow: text(200).default("") })).max(3).default([]),
  /** Rapid ideas: one line each, written against the timer. */
  rapid: z8.array(text(120)).max(40).default([]),
  /** When the student started the timer (ISO), or empty. */
  rapid_started_at: z8.string().max(40).default(""),
  /** Developed ideas, one per rapid idea picked (card id "r{index}"). These go to the group. */
  cards: z8.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z8.string().max(40).default(""),
  strongest_why: text(300).default("")
});
var IDEA_PARTS = ["idea", "answers", "evidence"];
var DotSchema = z8.object({ idea: z8.string().max(40), part: z8.enum(IDEA_PARTS), note: text(120).default("") });
var DecidePayloadSchema = z8.object({
  /** Stand-out dots: up to the Kit's number, on parts of any idea. */
  dots: z8.array(DotSchema).max(5).default([]),
  /** Criterion id → idea id. */
  votes: z8.record(z8.string().max(40), z8.string().max(40)).default({}),
  reasons: z8.record(z8.string().max(40), text(300)).default({}),
  opened: z8.array(z8.string().max(40)).max(40).default([]),
  stretch: text(300).default("")
});
var PrototypePayloadSchema = z8.object({
  text: text(4e3).default(""),
  link: z8.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, "Links start with https://").default(""),
  files: z8.array(z8.string().max(40)).max(SPRINT_LIMITS.files).default([]),
  requirements: Wheres,
  self: z8.record(z8.string().max(40), LevelSchema).default({}),
  self_why: z8.record(z8.string().max(40), text(300)).default({}),
  value_answer: text(300).default("")
});
var TestPayloadSchema = z8.object({
  reflection: z8.array(text(1e3)).max(2).default([]),
  quote: text(300).default(""),
  change_criterion: z8.string().max(40).default(""),
  value_answer: text(300).default("")
});
var PartSchema = z8.object({
  id: SprintIdSchema,
  text: z8.string().trim().min(1).max(80),
  shows: text(200).default(""),
  criterion: z8.string().max(40).default("")
});
var PartsSchema = z8.array(PartSchema).max(SPRINT_LIMITS.parts).refine((parts) => new Set(parts.map((p) => p.id)).size === parts.length, "Each part needs its own id.");
var FeedbackEntrySchema = z8.object({
  levels: z8.record(z8.string().max(40), LevelSchema).default({}),
  worked: text(300).default(""),
  next: text(300).default(""),
  /** The criterion the written lines are about. */
  about: z8.string().max(40).default("")
});

// apps/teaching/src/quiz/core.ts
import { z as z9 } from "zod";
var QUIZ_QUESTION_KINDS = [
  "multiple_choice",
  "multi_select",
  "true_false",
  "short_answer",
  "fill_gap",
  "odd_one_out",
  "matching",
  "ordering",
  "categorise",
  "quote_technique",
  "find_it",
  "spot_technique",
  "label_image",
  "extended_response",
  "explain_effect"
];
var QuizQuestionKindSchema = z9.enum(QUIZ_QUESTION_KINDS);
var QUIZ_LIMITS = {
  prompt: 1e3,
  option: 300,
  hint: 500,
  explanation: 1e3,
  passage: 4e3,
  answer: 200,
  model: 3e3,
  response: 6e3,
  marksMax: 20
};
var Id = z9.string().min(1).max(64);
var Text = (max) => z9.string().trim().min(1).max(max);
var OptionalText = (max) => z9.string().trim().max(max).optional();
var QuizImageSchema = z9.object({
  url: z9.string().min(1).max(2e3),
  alt: z9.string().max(300).default("")
});
var QuizChoiceSchema = z9.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z9.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z9.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z9.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizSpotTargetSchema = z9.object({
  id: Id,
  /** The words, copied exactly from the passage. */
  quote: Text(QUIZ_LIMITS.option),
  /** Every technique a fair marker would accept for these words. */
  correct: z9.array(Id).min(1).max(10)
});
var QuizPinSchema = z9.object({
  id: Id,
  x: z9.number().min(0).max(1),
  y: z9.number().min(0).max(1),
  label: Text(120)
});
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z9.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z9.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional(),
  /** Syllabus outcome ids for the markbook. None means the lesson's outcomes. Capped like a criterion's (MARKBOOK_LIMITS.outcomes). */
  outcomes: z9.array(z9.string().min(1).max(64)).max(8).optional(),
  /** Skills-continuum sub-strands, `strand.sub`, for insights. */
  skills: z9.array(z9.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/, "Pick a skill from the list.")).max(8).optional()
};
var QuizQuestionSchema = z9.discriminatedUnion("kind", [
  z9.object({ ...base, kind: z9.literal("multiple_choice"), options: z9.array(QuizChoiceSchema).min(2).max(6), correct: z9.array(Id).length(1) }),
  z9.object({ ...base, kind: z9.literal("multi_select"), options: z9.array(QuizChoiceSchema).min(2).max(8), correct: z9.array(Id).min(1).max(8) }),
  z9.object({ ...base, kind: z9.literal("true_false"), answer: z9.boolean() }),
  z9.object({
    ...base,
    kind: z9.literal("short_answer"),
    accepted: z9.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z9.boolean().optional()
  }),
  z9.object({ ...base, kind: z9.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z9.boolean().optional() }),
  z9.object({ ...base, kind: z9.literal("odd_one_out"), options: z9.array(QuizChoiceSchema).min(3).max(6), correct: z9.array(Id).length(1) }),
  z9.object({ ...base, kind: z9.literal("matching"), pairs: z9.array(QuizPairSchema).min(2).max(8) }),
  z9.object({ ...base, kind: z9.literal("ordering"), items: z9.array(QuizChoiceSchema).min(3).max(8) }),
  z9.object({
    ...base,
    kind: z9.literal("categorise"),
    groups: z9.array(QuizGroupSchema).min(2).max(4),
    items: z9.array(QuizSortItemSchema).min(2).max(16)
  }),
  z9.object({
    ...base,
    kind: z9.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z9.array(QuizChoiceSchema.extend({ technique_id: z9.string().max(64).optional() })).min(2).max(6),
    correct: z9.array(Id).length(1)
  }),
  z9.object({
    ...base,
    kind: z9.literal("find_it"),
    segments: z9.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z9.array(Id).min(1).max(40)
  }),
  z9.object({
    ...base,
    kind: z9.literal("spot_technique"),
    passage: Text(QUIZ_LIMITS.passage),
    options: z9.array(
      QuizChoiceSchema.extend({
        technique_id: z9.string().max(64).optional(),
        /** How many times students may name it: 2 for a passage with two similes. */
        uses: z9.number().int().min(1).max(12).optional()
      })
    ).min(2).max(10),
    targets: z9.array(QuizSpotTargetSchema).min(1).max(12),
    /** How many students must find. Fewer than the targets means any of them will do. */
    find: z9.number().int().min(1).max(12).optional()
  }),
  z9.object({ ...base, kind: z9.literal("label_image"), image: QuizImageSchema, pins: z9.array(QuizPinSchema).min(2).max(8) }),
  z9.object({
    ...base,
    kind: z9.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z9.object({
    ...base,
    kind: z9.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z9.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z9.custom(
  (value) => !!value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && QUIZ_QUESTION_KINDS.includes(value.kind),
  { message: "A quiz question needs an id and a known kind." }
);
function questionProblems(q) {
  const out = [];
  const needsPrompt = q.kind !== "fill_gap";
  if (needsPrompt && !q.prompt.trim()) out.push("Write the question.");
  const unique = (ids, what) => {
    if (new Set(ids).size !== ids.length) out.push(`Two ${what} share an id.`);
  };
  switch (q.kind) {
    case "multiple_choice":
    case "multi_select":
    case "odd_one_out":
    case "quote_technique": {
      unique(q.options.map((o) => o.id), "options");
      const ids = new Set(q.options.map((o) => o.id));
      if (!q.correct.length || q.correct.some((id) => !ids.has(id))) out.push("Tick the right answer.");
      if (new Set(q.options.map((o) => norm(o.text))).size !== q.options.length) out.push("Two options say the same thing.");
      break;
    }
    case "find_it": {
      unique(q.segments.map((s) => s.id), "lines");
      const ids = new Set(q.segments.map((s) => s.id));
      if (!q.correct.length || q.correct.some((id) => !ids.has(id))) out.push("Tap the line or lines that answer the question.");
      if (q.correct.length >= q.segments.length) out.push("Leave at least one line that isn\u2019t an answer.");
      break;
    }
    case "spot_technique": {
      unique(q.options.map((o) => o.id), "techniques");
      unique(q.targets.map((t) => t.id), "answers");
      if (new Set(q.options.map((o) => norm(o.text))).size !== q.options.length) out.push("Two techniques say the same thing.");
      const ids = new Set(q.options.map((o) => o.id));
      for (const target of q.targets) {
        if (!locateQuote(q.passage, target.quote)) out.push(`\u201C${target.quote}\u201D isn\u2019t in the passage. Copy the words exactly.`);
        if (!target.correct.length || target.correct.some((id) => !ids.has(id))) out.push("Name the technique for every answer.");
      }
      if ((q.find ?? q.targets.length) > q.targets.length) out.push("Students can\u2019t be asked to find more than there are answers.");
      if ((q.find ?? q.targets.length) > 1) {
        for (const option of q.options) {
          const needed = q.targets.filter((t) => t.correct.length === 1 && t.correct[0] === option.id).length;
          if (needed > (option.uses ?? 1)) out.push(`${option.text.trim() || "A technique"} is the answer ${needed} times. Set it to \xD7${needed}.`);
        }
      }
      break;
    }
    case "fill_gap":
      if (!parseGapPassage(q.passage).some((part) => part.type === "gap")) out.push("Blank out at least one word.");
      break;
    case "matching":
      unique(q.pairs.map((p) => p.id), "pairs");
      if (new Set(q.pairs.map((p) => norm(p.right))).size !== q.pairs.length) out.push("Two pairs have the same right-hand side.");
      break;
    case "ordering":
      unique(q.items.map((i) => i.id), "items");
      break;
    case "categorise": {
      unique(q.groups.map((g) => g.id), "groups");
      unique(q.items.map((i) => i.id), "items");
      const groups = new Set(q.groups.map((g) => g.id));
      if (q.items.some((i) => !groups.has(i.group))) out.push("Put every item in a group.");
      break;
    }
    case "label_image":
      unique(q.pins.map((p) => p.id), "pins");
      if (new Set(q.pins.map((p) => norm(p.label))).size !== q.pins.length) out.push("Two pins have the same label.");
      break;
    default:
      break;
  }
  return out;
}
function parseGapPassage(passage) {
  const parts = [];
  const re = /\[\[([^\]]*)\]\]/g;
  let last = 0;
  for (let m = re.exec(passage); m; m = re.exec(passage)) {
    if (m.index > last) parts.push({ type: "text", text: passage.slice(last, m.index) });
    const answers = (m[1] ?? "").split("|").map((a) => a.trim()).filter(Boolean);
    if (answers.length) parts.push({ type: "gap", answers });
    else parts.push({ type: "text", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < passage.length) parts.push({ type: "text", text: passage.slice(last) });
  return parts;
}
function passageWords(passage) {
  const words = [];
  const re = /\S+/g;
  let line = 0;
  let seen = 0;
  for (let m = re.exec(passage); m; m = re.exec(passage)) {
    line += (passage.slice(seen, m.index).match(/\n/g) ?? []).length;
    seen = m.index;
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length, line });
  }
  return words;
}
function wordKey(word) {
  return norm(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
function locateQuote(passage, quote) {
  const words = passageWords(passage);
  const keyed = words.map((w, i) => ({ i, key: wordKey(w.text) })).filter((w) => w.key);
  const wanted = passageWords(quote).map((w) => wordKey(w.text)).filter(Boolean);
  if (!wanted.length) return null;
  for (let s = 0; s + wanted.length <= keyed.length; s++) {
    if (wanted.every((key, j) => keyed[s + j].key === key)) return { from: keyed[s].i, to: keyed[s + wanted.length - 1].i };
  }
  return null;
}
var FILLER = new Set(
  "a an the and or but of to in on at by for with from as is are was were be been it its this that these those i you he she we they his her their our my your so then than".split(" ")
);
var QuizFeedbackSchema = z9.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z9.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z9.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z9.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z9.boolean().optional(),
  shuffle_questions: z9.boolean().optional(),
  shuffle_options: z9.boolean().optional(),
  attempts: z9.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z9.number().min(0).max(1).optional(),
  confidence: z9.boolean().optional(),
  closes_at: z9.string().datetime().optional(),
  /** Live quiz in focus view: a question revealed under this share right stops at a checkpoint. Blank means 80. */
  move_on: z9.number().int().min(1).max(100).optional(),
  /** A follow-up quiz: only these students (class-list ids) may sit it. */
  for_students: z9.array(z9.string().min(1).max(64)).max(60).optional(),
  /** The quiz this one follows up, and the flag that prompted it. */
  follow_up_of: z9.string().max(64).optional(),
  follow_up_flag: z9.string().max(160).optional(),
  /** Teacher only: an earlier quiz to show before-and-after against. */
  compare_with: z9.string().max(64).optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}
function checkQuestion(input) {
  const raw = input && typeof input === "object" ? input : {};
  if (raw.kind !== "fill_gap" && QUIZ_QUESTION_KINDS.includes(raw.kind) && !String(raw.prompt ?? "").trim()) {
    return { ok: false, message: "Write the question." };
  }
  const parsed = QuizQuestionSchema.safeParse(input);
  if (parsed.success) return { ok: true, question: parsed.data };
  const issue = parsed.error.issues[0];
  if (!issue) return { ok: false, message: "Check the question." };
  if (issue.code === "custom") return { ok: false, message: issue.message };
  const field = String(issue.path[0] ?? "");
  const messages = {
    prompt: "Write the question.",
    options: "Fill in every option.",
    correct: "Tick the right answer.",
    accepted: "Give at least one accepted answer.",
    passage: "Write the sentence or quote.",
    pairs: "Fill in both sides of every pair.",
    items: "Fill in every item.",
    groups: "Name every group.",
    quote: "Paste the quote.",
    segments: "Paste a passage of at least two lines.",
    targets: "Select the words for at least one answer and name its technique.",
    pins: "Add at least two pins, each with a label.",
    image: "Choose an image.",
    marks: `Marks must be between 1 and ${QUIZ_LIMITS.marksMax}.`
  };
  if (raw.kind === "spot_technique" && field === "passage") return { ok: false, message: "Paste the passage." };
  if (raw.kind === "spot_technique" && field === "options") return { ok: false, message: "Fill in every technique." };
  return { ok: false, message: messages[field] ?? "Check the question: something is missing or too long." };
}

// apps/teaching/src/schemas/toolkit.ts
import { z as z10 } from "zod";
var TkStepSchema = z10.object({
  id: z10.string().min(1),
  title: z10.string(),
  prompt: z10.string()
});
var TkRevealSchema = z10.object({
  id: z10.string().min(1),
  label: z10.string(),
  body: z10.string()
});
var TkTeacherNoteSchema = z10.object({
  what: z10.string().default(""),
  run: z10.array(z10.string()).default([]),
  say: z10.array(z10.string()).default([]),
  watch: z10.array(z10.string()).default([]),
  extra_label: z10.string().default(""),
  extra: z10.array(z10.string()).default([]),
  time: z10.string().default(""),
  source: z10.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z10.boolean().default(false)
});
var TkJotsSchema = z10.record(z10.string()).default({});
var TkItemListSchema = z10.array(z10.string().min(1)).default([]);
var ToolkitSkillContentSchema = z10.object({
  item: z10.string().min(1),
  label: z10.string(),
  definition: z10.string(),
  definition_source: z10.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z10.string().default(""),
  context: z10.string().default(""),
  steps: z10.array(TkStepSchema).max(8),
  show_test: z10.boolean().default(true),
  checks: z10.array(z10.string()).max(8).default([]),
  reveals: z10.array(TkRevealSchema).max(6).default([]),
  links: z10.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z10.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z10.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z10.preprocess(
  (value) => value === "level2" ? "none" : value,
  z10.enum(["none", "level1", "level3", "maths", "inquiry"])
);
var StressVerdictSchema = z10.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z10.object({
  kind: z10.string().default(""),
  marker: z10.string().default(""),
  a: z10.string().default(""),
  b: z10.string().default("")
});
var ToolkitToolContentSchema = z10.object({
  item: z10.string().min(1),
  label: z10.string(),
  definition: z10.string(),
  definition_source: z10.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z10.string().default(""),
  frame: ToolFrameSchema,
  sentence: z10.string().default(""),
  steps: z10.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z10.string().default(""),
  converters: z10.array(z10.object({ id: z10.string().min(1), closed: z10.string(), open: z10.string() })).max(10).default([]),
  statements: z10.array(
    z10.object({
      id: z10.string().min(1),
      text: z10.string(),
      verdict: StressVerdictSchema,
      reason: z10.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z10.array(TkRevealSchema).max(6).default([]),
  links: z10.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z10.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z10.object({
  item: z10.string().min(1),
  label: z10.string(),
  definition: z10.string(),
  definition_source: z10.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z10.string().default(""),
  claim: z10.string().default(""),
  options: z10.array(z10.object({ id: z10.string().min(1), text: z10.string() })).max(8).default([]),
  probes: z10.array(z10.object({ id: z10.string().min(1), question: z10.string(), asks: z10.string() })).max(8).default([]),
  instruction: z10.string().default(""),
  model: z10.object({ label: z10.string(), body: z10.string() }).default({ label: "", body: "" }),
  discussion: z10.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z10.object({
  id: z10.string().min(1),
  tool: z10.string().min(1),
  prompt: z10.string(),
  frame: z10.string(),
  example: z10.string()
});
var ThinkingMoveContentSchema = z10.object({
  skill: z10.string().min(1),
  tools: z10.array(z10.string().min(1)).min(1).max(5),
  value: z10.string().min(1),
  community: z10.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z10.string().default(""),
  stimulus: z10.string().default(""),
  steps: z10.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z10.array(z10.string()).max(8).default([]),
  why: z10.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z10.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z10.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z10.object({
  /** Student instruction shown at the top of the block. */
  guide: z10.string().default(""),
  stimulus: z10.string().default(""),
  procedure: z10.enum(["sort", "create"]).default("sort"),
  /** Students send their own questions and place them on the quadrant (live, published lesson). */
  collect_questions: z10.boolean().default(false),
  questions: z10.array(z10.object({ id: z10.string().min(1), text: z10.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z10.array(z10.object({ id: z10.string().min(1), closed: z10.string(), open: z10.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z10.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z10.object({
  /** Student instruction shown at the top of the block. */
  guide: z10.string().default(""),
  concepts: z10.array(
    z10.object({
      id: z10.string().min(1),
      label: z10.string(),
      central: z10.boolean(),
      contestable: z10.boolean(),
      common: z10.boolean()
    })
  ).max(8).default([]),
  analogy: z10.object({ stem: z10.string(), example: z10.string() }).default({ stem: "", example: "" }),
  game: z10.object({
    kind: ConceptGameKindSchema,
    left: z10.string(),
    middle: z10.string(),
    right: z10.string(),
    cards: z10.array(z10.object({ id: z10.string().min(1), text: z10.string(), prompt: z10.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z10.array(z10.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z10.object({
  content: z10.string().default(""),
  skills: z10.array(z10.string().min(1)).max(2).default([]),
  tools: z10.array(z10.string().min(1)).max(6).default([]),
  values: z10.array(z10.string().min(1)).max(4).default([]),
  community: z10.array(z10.string().min(1)).max(2).default([]),
  success: z10.array(z10.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z10.object({
  variant: z10.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z10.string().default(""),
  concept: z10.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z10.object({
  task: z10.string().default(""),
  steps: z10.array(TkStepSchema).max(6).default([]),
  example: z10.string().default("")
});
var FluidAnalogyContentSchema = z10.object({
  kind: z10.string().min(1),
  label: z10.string(),
  definition: z10.string(),
  /** The text, character or idea students work with. */
  focus: z10.string().default(""),
  /** The level students start at. */
  level: z10.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z10.boolean().default(true),
  tiers: z10.array(AnalogyTierSchema).length(3),
  show_check: z10.boolean().default(true),
  checks: z10.array(z10.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z10.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z10.object({
  key: z10.string().min(1),
  label: z10.string().default(""),
  frame: z10.string().default(""),
  example: z10.string().default("")
});
var AnalogyStageSchema = z10.object({
  task: z10.string().default(""),
  slots: z10.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z10.object({
  label: z10.string(),
  definition: z10.string(),
  /** The text, character or idea students work with. */
  focus: z10.string().default(""),
  /** The level students start at. */
  level: z10.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z10.boolean().default(true),
  levels: z10.array(AnalogyStageSchema).length(3),
  show_check: z10.boolean().default(true),
  checks: z10.array(z10.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z10.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z10.object({
  /** Student instruction shown at the top of the block. */
  guide: z10.string().default(""),
  focus: z10.string().default(""),
  /** Types marked "This lesson". */
  types: z10.array(z10.string().min(1)).max(7).default([]),
  show_contrast: z10.boolean().default(true),
  weak: z10.string().default(""),
  strong: z10.string().default(""),
  why: z10.string().default(""),
  process: z10.array(z10.string()).max(8).default([]),
  show_check: z10.boolean().default(true),
  checks: z10.array(z10.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z10.object({
  title: z10.string().default("Teacher note"),
  html: z10.string().default("")
});
var TOOLKIT_NOTE_BLOCK_TYPES = [
  "toolkit_skill",
  "toolkit_tool",
  "toolkit_value",
  "thinking_move",
  "question_quadrant",
  "concept_features",
  "thinking_reflection"
];
var TOOLKIT_BLOCK_TYPES = [
  ...TOOLKIT_NOTE_BLOCK_TYPES,
  "thinking_intentions"
];

// apps/teaching/src/schemas/block.ts
var VisibilitySchema = z11.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z11.enum([
  "rich_text",
  "heading",
  "callout",
  "image",
  "gallery",
  "video",
  "embed",
  "html",
  "html_app",
  "quote",
  "divider",
  "classroom_tools",
  "countdown",
  "definition",
  "code",
  "audio",
  "attachment",
  "accordion",
  "table",
  "peer_feedback",
  "question_drop",
  "brainstorm",
  "hinge_question",
  "continuum_line",
  "curriculum_lines",
  "quiz_question",
  "question_set",
  "discern_confirm",
  "flashcards",
  "cloze",
  "self_check",
  "note_cue",
  "with_teacher",
  "faded_example",
  "chart",
  "equation",
  "diagram",
  "mind_map",
  "concept_map",
  "whiteboard",
  "columns",
  "section",
  "spacer",
  "timeline",
  "card_stack",
  "tabs",
  "collection",
  "anthology",
  "outcomes",
  "annotation",
  "toolkit_skill",
  "toolkit_tool",
  "toolkit_value",
  "thinking_move",
  "question_quadrant",
  "concept_features",
  "thinking_intentions",
  "thinking_reflection",
  "fluid_analogy",
  "analogy_types",
  "analogy_close_reading",
  "analogy_pattern",
  "analogy_reverse",
  "analogy_problem",
  "analogy_metaphor",
  "analogy_transfer",
  "analogy_chains",
  "teacher_note"
]);
var ColumnPresetSchema = z11.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z11.enum(["small", "medium", "large"]);
var VideoProviderSchema = z11.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z11.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z11.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z11.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z11.enum([
  "cultural_warning",
  "information",
  "important",
  "warning",
  "extension",
  "scaffold",
  "example",
  "remember",
  "teacher"
]);
var QuestionKindSchema = z11.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z11.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z11.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  discern: DiscernQualifierSchema.optional(),
  lenses: LensAttachmentsSchema.optional(),
  layout: z11.record(z11.unknown()).default({}),
  print: z11.record(z11.unknown()).default({}),
  settings: z11.record(z11.unknown()).default({})
};
var RichTextBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("rich_text"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({ html: z11.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var NarrationSchema = z11.object({
  url: z11.string().min(1),
  duration_s: z11.number().min(0).max(900),
  transcript: z11.string().max(8e3).optional()
});
var RevealSchema = z11.enum(["all", "one"]);
var HeadingBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z11.object({
    text: z11.string(),
    narration: NarrationSchema.optional(),
    /** Lecture: what the teacher plans to say, e.g. imported speaker notes. Teacher-only. */
    script: z11.string().max(8e3).optional(),
    reveal: RevealSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("callout"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    style: CalloutStyleSchema,
    title: z11.string().optional(),
    body: z11.string(),
    related_to: z11.object({
      block_id: z11.string().min(1),
      question_id: z11.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z11.object({
    url: z11.string(),
    alt_text: z11.string(),
    caption: z11.string().optional(),
    annotations: z11.array(
      z11.object({
        id: z11.string().min(1),
        body: z11.string().min(1),
        selector: z11.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z11.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z11.object({
  id: z11.string().min(1),
  url: z11.string(),
  alt_text: z11.string(),
  caption: z11.string().optional()
});
var GalleryBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z11.object({
    layout: GalleryLayoutSchema,
    items: z11.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z11.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z11.object({
    provider: VideoProviderSchema,
    external_id: z11.string(),
    url: z11.string().optional(),
    start_seconds: z11.number().int().positive().optional(),
    title: z11.string().optional(),
    caption: z11.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("embed"),
  variant: z11.string().default("large"),
  visibility: VisibilitySchema,
  content: z11.object({
    url: z11.string(),
    title: z11.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z11.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("html"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({ html: z11.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z11.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z11.object({
  enabled: z11.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z11.string().min(1),
  system: z11.string(),
  max_tokens: z11.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("html_app"),
  variant: z11.string().default("large"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    html: z11.string(),
    height_px: z11.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("quote"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    quote: z11.string(),
    attribution: z11.string().optional(),
    source: z11.string().optional(),
    reference: z11.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimerSegmentSchema = z11.object({
  label: z11.string().max(60),
  minutes: z11.number().min(0.25).max(180)
});
var ClassroomToolIdSchema = z11.enum([
  "timer",
  "stopwatch",
  "names",
  "number",
  "groups",
  "technique",
  "scores",
  "coin",
  "dice"
]);
var DividerBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("divider"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    /** The faint gear at the end of the rule that slides out the classroom tools. */
    tools: z11.boolean().default(true),
    /** Timers saved with the lesson, ready when it opens. */
    timer_stack: z11.array(TimerSegmentSchema).max(8).default([])
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var ClassroomToolsBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("classroom_tools"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    timer_stack: z11.array(TimerSegmentSchema).max(8).default([]),
    /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
    start_tool: ClassroomToolIdSchema.optional()
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var CountdownBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("countdown"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().max(200).default(""),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z11.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z11.string().regex(/^(\d{2}:\d{2})?$/).default(""),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z11.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    note: z11.string().max(400).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("definition"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    term: z11.string(),
    definition: z11.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("code"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    code: z11.string(),
    language: z11.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("audio"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  /**
   * The Voice block. `listen` plays a clip (the original audio block); `respond`
   * and `viva` have students record a spoken answer and submit their best take.
   * Viva adds dot points the timer walks through. `url` is only used by listen.
   */
  content: z11.object({
    url: z11.string(),
    title: z11.string().optional(),
    mode: z11.enum(["listen", "respond", "viva"]).default("listen"),
    prompt: z11.string().max(4e3).optional(),
    time_limit_s: z11.number().int().min(30).max(300).optional(),
    student_chooses_time: z11.boolean().optional(),
    scaffold: z11.array(z11.object({ label: z11.string().max(80), weight: z11.number().min(0.5).max(3).default(1) })).max(8).optional(),
    code_groups: z11.array(z11.enum(["composition", "viva", "speaking"])).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("attachment"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    url: z11.string(),
    title: z11.string(),
    filename: z11.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z11.object({
  title: z11.string(),
  body: z11.string()
});
var AccordionBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("accordion"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    items: z11.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("table"),
  variant: z11.string().default("large"),
  visibility: VisibilitySchema,
  content: z11.object({
    headers: z11.array(z11.string()),
    rows: z11.array(z11.array(z11.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z11.object({
  id: z11.string().min(1),
  prompt: z11.string(),
  kind: QuestionKindSchema,
  options: z11.array(z11.string()).optional(),
  response_space: ResponseSpaceSchema.optional(),
  /** The 4 levels format's band; absent means guessed from the question's opening words. */
  level: z11.enum(["beginner", "detective", "judge", "inventor"]).optional(),
  /** Reasoning chart format: which logic this question walks. Absent means Student's choice. */
  logic: LogicSchema.optional()
});
var PeerFeedbackBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("peer_feedback"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    prompt: z11.string().max(4e3),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z11.enum(["comments", "annotate"]).default("comments"),
    strength_prompt: z11.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z11.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ContinuumStatementSchema = z11.object({
  id: z11.string().min(1),
  text: z11.string().max(300).default(""),
  snap: z11.boolean().default(false)
});
var ContinuumLineBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("continuum_line"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    stimulus: z11.object({
      kind: z11.enum(["text", "image", "video"]).default("text"),
      text: z11.string().max(2e3).default(""),
      url: z11.string().max(2e3).default(""),
      alt_text: z11.string().max(500).default("")
    }).default({ kind: "text", text: "", url: "", alt_text: "" }),
    scale: z11.object({
      left: z11.string().max(40).default("Implied"),
      right: z11.string().max(40).default("Not implied"),
      stops: z11.array(z11.string().max(40)).max(3).default([])
    }).default({ left: "Implied", right: "Not implied", stops: [] }),
    statements: z11.array(ContinuumStatementSchema).max(10).default([]),
    pace: z11.enum(["teacher", "student"]).default("teacher"),
    replace: z11.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var BrainstormBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("brainstorm"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    question: z11.string().max(500).default(""),
    safety: z11.enum(["instant", "approve", "reveal"]).default("approve"),
    per_student: z11.union([z11.literal(0), z11.literal(1), z11.literal(3), z11.literal(5)]).default(3),
    max_length: z11.number().int().min(20).max(280).default(140),
    layout: z11.enum(["grid", "cloud", "groups"]).default("grid")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HingeOptionSchema = z11.object({
  id: z11.string().min(1).max(40),
  text: z11.string().max(300).default(""),
  misconception: z11.string().max(300).default("")
});
var HingeBackupSchema = z11.object({
  prompt: z11.string().max(500).default(""),
  options: z11.array(HingeOptionSchema).max(5).default([]),
  correct_id: z11.string().max(40).default(""),
  source: z11.enum(["teacher", "ann"]).default("teacher")
});
var HingeQuestionBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("hinge_question"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    prompt: z11.string().max(500).default(""),
    options: z11.array(HingeOptionSchema).max(5).default([]),
    correct_id: z11.string().max(40).default(""),
    seconds: z11.union([z11.literal(0), z11.literal(30), z11.literal(60), z11.literal(90), z11.literal(120)]).default(60),
    move_on: z11.number().int().min(1).max(100).default(80),
    reteach: z11.number().int().min(0).max(99).default(50),
    /** A parallel question for the re-check after re-teaching. Teacher-written, or drafted by Ann in focus view. */
    backup: HingeBackupSchema.optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z11.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CurriculumLinesColourSchema = z11.enum([
  "wave",
  "wave_deep",
  "green",
  "green_deep",
  "amber",
  "amber_deep",
  "lilac",
  "lilac_deep",
  "navy",
  "navy_deep"
]);
var CurriculumLinesLevelSchema = z11.enum(["introduced", "reinforced", "mastered"]);
var CurriculumLinesStrandSchema = z11.object({
  id: z11.string().min(1).max(64),
  name: z11.string().max(60).default(""),
  colour: CurriculumLinesColourSchema.default("wave")
});
var CurriculumLinesStationSchema = z11.object({
  id: z11.string().min(1).max(64),
  strand_id: z11.string().min(1).max(64),
  week: z11.number().int().min(1).max(20),
  level: CurriculumLinesLevelSchema.default("reinforced"),
  label: z11.string().max(120).default(""),
  lesson_id: z11.string().min(1).max(64).optional()
});
var CurriculumLinesCheckpointSchema = z11.object({
  id: z11.string().min(1).max(64),
  week: z11.number().int().min(1).max(20),
  label: z11.string().max(80).default(""),
  lesson_id: z11.string().min(1).max(64).optional(),
  strand_ids: z11.array(z11.string().min(1).max(64)).min(1).max(8)
});
var CurriculumLinesTerminusSchema = z11.object({
  label: z11.string().max(80).default("Assessment task"),
  detail: z11.string().max(160).optional(),
  when: z11.string().max(24).optional(),
  lesson_id: z11.string().min(1).max(64).optional()
});
var CurriculumLinesV1ContentSchema = z11.object({
  title: z11.string().max(120).optional(),
  weeks: z11.number().int().min(1).max(20).default(8),
  strands: z11.array(CurriculumLinesStrandSchema).min(1).max(8),
  stations: z11.array(CurriculumLinesStationSchema).max(160).default([]),
  checkpoints: z11.array(CurriculumLinesCheckpointSchema).max(20).default([]),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var NetworkLineModeSchema = z11.enum(["train", "metro", "light_rail"]);
var LineAlignmentSchema = z11.discriminatedUnion("kind", [
  z11.object({ kind: z11.literal("points"), group: z11.enum(["U", "R"]) }),
  z11.object({ kind: z11.literal("concept"), key: z11.string().regex(/^[A-Z]{2,5}$/) }),
  z11.object({ kind: z11.literal("strand"), strand: z11.enum(SKILL_STRANDS) })
]);
var DotPointRefSchema = z11.string().regex(/^[a-z0-9-]{2,40}:[UR]\d{1,2}$/);
var NetworkLineSchema = z11.object({
  id: z11.string().min(1).max(64),
  mode: NetworkLineModeSchema,
  name: z11.string().max(60).default(""),
  short: z11.string().max(4).optional(),
  colour: CurriculumLinesColourSchema.default("wave"),
  alignment: LineAlignmentSchema.optional()
});
var AfterLessonIdsSchema = z11.array(z11.string().min(1).max(64)).max(6);
var LessonRouteRoleSchema = z11.enum(["core", "support", "extension", "optional"]);
var LessonSkipRuleSchema = z11.string().trim().max(80);
var LineStopSchema = z11.object({
  line_id: z11.string().min(1).max(64),
  level: CurriculumLinesLevelSchema.optional(),
  /** Set from the lesson's dot points; it follows them until the teacher takes it off. */
  auto: z11.literal(true).optional()
});
var LineOffSchema = z11.array(z11.string().min(1).max(64)).max(24);
var NetworkNudgesSchema = z11.record(
  z11.string().min(1).max(160),
  z11.object({ dx: z11.number().min(-2e3).max(2e3), dy: z11.number().min(-2e3).max(2e3) })
).refine((value) => Object.keys(value).length <= 120, { message: "At most 120 nudges" });
var CurriculumRailStopSchema = z11.object({
  id: z11.string().min(1).max(64),
  line_id: z11.string().min(1).max(64),
  after_lesson_id: z11.string().min(1).max(64).optional(),
  kind: z11.enum(["stop", "extension", "support"]).default("stop"),
  lesson_id: z11.string().min(1).max(64).optional(),
  block_id: z11.string().min(1).max(120).optional(),
  label: z11.string().max(120).default(""),
  /** Who may take the straight track past a support stop, e.g. "90%+ on the techniques quiz". */
  skip_rule: z11.string().max(80).optional()
});
var CurriculumGateSchema = z11.object({
  id: z11.string().min(1).max(64),
  after_lesson_id: z11.string().min(1).max(64).optional(),
  label: z11.string().max(80).default(""),
  lesson_id: z11.string().min(1).max(64).optional(),
  line_ids: z11.array(z11.string().min(1).max(64)).max(24).default([])
});
var CurriculumLinesV2ContentSchema = z11.object({
  version: z11.literal(2),
  title: z11.string().max(120).optional(),
  rail_stops: z11.array(CurriculumRailStopSchema).max(60).default([]),
  gates: z11.array(CurriculumGateSchema).max(12).default([]),
  nudges: NetworkNudgesSchema.default({}),
  /** Map-only station order; lessons not listed follow in unit order. */
  station_order: z11.array(z11.string().min(1).max(64)).max(200).optional(),
  /** Lessons left off this map (they stay in the unit). */
  hidden_lessons: z11.array(z11.string().min(1).max(64)).max(200).optional(),
  /** The syllabus focus area this unit covers; unset is worked out from the unit's title. */
  focus_area: z11.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  /** The metro lines (textual concepts) this unit shows; unset shows every one. The year network always shows them all. */
  concept_lines: z11.array(z11.string().min(1).max(64)).max(4).optional(),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var CurriculumLinesBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("curriculum_lines"),
  variant: z11.string().default("large"),
  visibility: VisibilitySchema,
  content: z11.union([CurriculumLinesV2ContentSchema, CurriculumLinesV1ContentSchema]),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionDropBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("question_drop"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    target_quiz_id: z11.string().max(64).default(""),
    prompt: z11.string().max(500).default(""),
    kinds: z11.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z11.number().int().min(1).max(20).default(1),
    marks_max: z11.number().int().min(1).max(20).default(3),
    per_student: z11.number().int().min(1).max(5).default(1),
    accepting: z11.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiscernConfirmBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("discern_confirm"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    target_block_id: z11.string().max(120).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("quiz_question"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z11.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("question_set"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    questions: z11.array(QuestionItemSchema),
    /** Shape of the set; absent means standard. See src/blocks/formats/registry.ts. */
    format: z11.enum(["standard", "human_experience_table", "anchor_bridge", "question_levels", "because_but_so", "reasoning_chart"]).optional(),
    /** Human experience table settings, kept when switching format away and back. */
    table: z11.object({
      rows: z11.number().int().min(3).max(5).default(3),
      example: z11.boolean().default(true)
    }).optional(),
    /** Reasoning chart settings, kept when switching format away and back. */
    reasoning: z11.object({
      level: LensLevelSchema.default("core"),
      student_level: z11.boolean().default(true)
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z11.object({
  block_id: z11.string().min(1),
  annotation_id: z11.string().min(1),
  lesson_id: z11.string().optional(),
  kind: z11.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z11.string().min(1)
});
var FlashcardItemSchema = z11.object({
  id: z11.string().min(1),
  front: z11.string(),
  back: z11.string(),
  image_url: z11.string().optional(),
  image_alt: z11.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("flashcards"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    cards: z11.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z11.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("cloze"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    text: z11.string(),
    case_sensitive: z11.boolean().optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z11.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z11.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z11.object({
  id: z11.string().min(1),
  label: z11.string()
});
var SelfCheckBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("self_check"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z11.string(),
    answer: z11.string().optional(),
    items: z11.array(SelfCheckItemSchema).max(12).optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z11.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var NOTE_CUE_KINDS = ["copy", "own_words", "draw", "question"];
var NoteCueKindSchema = z11.enum(NOTE_CUE_KINDS);
var NoteCueBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("note_cue"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    kind: NoteCueKindSchema,
    prompt: z11.string().max(500)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WithTeacherBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("with_teacher"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    talking_points: z11.array(z11.string().max(300)).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FadedExampleBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("faded_example"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    prompt: z11.string().max(300),
    extract: z11.string().max(2e3),
    parts: z11.array(z11.object({ label: z11.string().min(1).max(40), answer: z11.string().max(600) })).min(1).max(4),
    blanks: z11.array(z11.number().int().min(0).max(3)).max(4),
    /** A step with blanks is a gate unless switched off. */
    gate: z11.boolean().optional()
  }).refine((c) => c.blanks.every((i) => i < c.parts.length) && new Set(c.blanks).size === c.blanks.length, {
    message: "Each blank must name a different part of the example.",
    path: ["blanks"]
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z11.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z11.object({
  x: z11.union([z11.string(), z11.number()]),
  y: z11.number()
});
var ChartSeriesColorSchema = z11.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z11.object({
  id: z11.string().min(1),
  name: z11.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z11.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("chart"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    chart_type: ChartTypeSchema,
    title: z11.string().optional(),
    x_label: z11.string().optional(),
    y_label: z11.string().optional(),
    series: z11.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("equation"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    latex: z11.string(),
    caption: z11.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z11.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("diagram"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    source: DiagramSourceSchema,
    image_url: z11.string().optional(),
    image_alt: z11.string().optional(),
    svg_markup: z11.string().optional(),
    caption: z11.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z11.object({
  id: z11.string().min(1),
  label: z11.string(),
  parent_id: z11.string().nullable().optional(),
  color: z11.string().optional(),
  x: z11.number().optional(),
  y: z11.number().optional()
});
var GraphBuildModeSchema = z11.enum(["outline", "canvas"]);
var GraphEdgeSchema = z11.object({
  id: z11.string().min(1),
  from: z11.string().min(1),
  to: z11.string().min(1),
  label: z11.string().optional()
});
var MindMapBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("mind_map"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    nodes: z11.array(GraphNodeSchema).min(1).max(24),
    edges: z11.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("concept_map"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    nodes: z11.array(GraphNodeSchema).min(1).max(24),
    edges: z11.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("whiteboard"),
  variant: z11.string().default("large"),
  visibility: VisibilitySchema,
  content: z11.object({
    document_id: z11.string().min(1),
    seed_document_id: z11.string().min(1).optional(),
    title: z11.string().optional(),
    height_px: z11.number().int().min(360).max(1400).default(640),
    published_snapshot: z11.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z11.object({
  id: z11.string().min(1),
  when: z11.string(),
  label: z11.string(),
  description: z11.string(),
  image_url: z11.string().optional(),
  image_alt: z11.string().optional(),
  link_url: z11.string().optional(),
  link_label: z11.string().optional()
});
var TimelineLayoutSchema = z11.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("timeline"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    layout: TimelineLayoutSchema.optional(),
    events: z11.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z11.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z11.object({
  id: z11.string().min(1),
  number: z11.string().optional(),
  eyebrow: z11.string(),
  title: z11.string(),
  description: z11.string(),
  image_url: z11.string().optional(),
  image_alt: z11.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("card_stack"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    cards: z11.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z11.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("collection"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    source: CollectionSourceSchema,
    title: z11.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z11.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("anthology"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var OutcomesBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("outcomes"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z11.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z11.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z11.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z11.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z11.enum(["left", "center", "right"]);
var AnnotationLineSchema = z11.object({
  id: z11.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z11.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z11.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z11.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z11.object({
  id: z11.string().min(1),
  lines: z11.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z11.object({
  kind: z11.enum(["verse", "prose"]),
  stanzas: z11.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z11.object({
  id: z11.string().min(1),
  name: z11.string().min(1),
  subgroup: z11.string().optional()
});
var AnnotationLayerSchema = z11.object({
  id: z11.string().min(1),
  name: z11.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z11.string().optional(),
  sublayers: z11.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z11.object({
  exact: z11.string().min(1),
  prefix: z11.string().optional(),
  suffix: z11.string().optional()
});
var AnnotationAnchorSchema = z11.object({
  /** Required on every stop when the annotation is a thread. */
  id: z11.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z11.string().min(1),
  line: z11.string().optional(),
  start: z11.number().int().min(0).optional(),
  end: z11.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z11.string().optional()
});
var AnnotationTechniqueRefSchema = z11.object({
  id: z11.string().min(1),
  table_version: z11.string().min(1)
});
var AnnotationCodeRefSchema = z11.object({
  id: z11.string().min(1).max(40),
  code: z11.string().regex(/^[A-Z]{1,3}$/),
  label: z11.string().max(60),
  descriptor: z11.string().max(600).default(""),
  colour: z11.enum(["blue", "sage", "peach", "gold", "lilac"]).default("blue"),
  positive: z11.boolean().default(false)
});
var AnnotationAttachmentSchema = z11.discriminatedUnion("kind", [
  z11.object({
    kind: z11.literal("link"),
    url: z11.string(),
    label: z11.string().optional()
  }),
  z11.object({
    kind: z11.literal("video"),
    url: z11.string(),
    start_seconds: z11.number().int().min(0).optional()
  }),
  z11.object({
    kind: z11.literal("audio"),
    url: z11.string(),
    title: z11.string().optional()
  }),
  z11.object({
    kind: z11.literal("image"),
    url: z11.string(),
    alt_text: z11.string()
  }),
  z11.object({
    kind: z11.literal("block"),
    block_id: z11.string().min(1)
  })
]);
var AnthologyTagSchema = z11.object({
  include: z11.boolean(),
  themes: z11.array(z11.string().trim().max(40)).max(8).default([]),
  concepts: z11.array(z11.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z11.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z11.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z11.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z11.enum(["text", "custom"]).default("text"),
  anchor_order: z11.array(z11.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z11.object({
  w: z11.string(),
  start: z11.number(),
  end: z11.number()
});
var AnnotationVoiceClipSchema = z11.object({
  id: z11.string().min(1),
  start_s: z11.number(),
  end_s: z11.number(),
  word_range: z11.tuple([z11.number().int().min(0), z11.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z11.enum(["tap", "quote", "ai", "manual"]),
  confidence: z11.number().min(0).max(1),
  approved: z11.boolean(),
  transcript_text: z11.string()
});
var AnnotationVoiceTrackSchema = z11.object({
  id: z11.string().min(1),
  layer_id: z11.string().min(1),
  kind: z11.enum(["reading", "think_aloud", "feedback"]),
  title: z11.string().min(1),
  audio: z11.object({
    media_id: z11.string().optional(),
    url: z11.string().min(1),
    duration_s: z11.number().min(0),
    mime: z11.string().min(1)
  }),
  transcript: z11.object({
    words: z11.array(AnnotationVoiceWordSchema),
    timing: z11.enum(["word", "segment", "estimated"])
  }),
  taps: z11.array(
    z11.object({
      t: z11.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z11.array(AnnotationVoiceClipSchema).default([]),
  status: z11.enum(["draft", "published"]),
  extras: z11.array(
    z11.object({
      id: z11.string().min(1),
      kind: z11.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z11.string(),
      approved: z11.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z11.object({
  id: z11.string().min(1),
  layer_id: z11.string().min(1),
  sublayer_id: z11.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z11.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  code: AnnotationCodeRefSchema.optional(),
  body: z11.object({
    html: z11.string(),
    attachments: z11.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z11.ZodIssueCode.custom,
      message: "Thread primary anchor needs an id",
      path: ["anchor", "id"]
    });
  }
  const ids = [primaryId, ...extras.map((a) => a.id)].filter(
    (id) => typeof id === "string" && id.length > 0
  );
  const expectedCount = extras.length + (primaryId ? 1 : 0);
  if (ids.length !== expectedCount) {
    ctx.addIssue({
      code: z11.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z11.ZodIssueCode.custom,
      message: "Thread stop ids must be unique within the annotation",
      path: ["also_anchors"]
    });
  }
  if (ann.thread?.order !== "custom") return;
  const order = ann.thread.anchor_order ?? [];
  const idSet = new Set(ids);
  const isPermutation = order.length === ids.length && new Set(order).size === order.length && order.every((id) => idSet.has(id));
  if (!isPermutation) {
    ctx.addIssue({
      code: z11.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z11.object({
  show_markers: z11.boolean().default(true),
  default_layer_id: z11.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z11.union([z11.literal(0), z11.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z11.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("annotation"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string().optional(),
    attribution: z11.string().optional(),
    text: AnnotationTextSchema,
    layers: z11.array(AnnotationLayerSchema).default([]),
    annotations: z11.array(AnnotationItemSchema).default([]),
    voice_tracks: z11.array(AnnotationVoiceTrackSchema).optional(),
    anthology: AnthologyTagSchema.optional(),
    settings: AnnotationBlockSettingsSchema.default({ show_markers: true })
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineAnnotationVoiceTracks(block, ctx) {
  const voiceLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === "voice").map((layer) => layer.id)
  );
  const teacherLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === "teacher").map((layer) => layer.id)
  );
  for (const [index, track] of (block.content.voice_tracks ?? []).entries()) {
    if (!voiceLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z11.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z11.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z11.object({
    id: z11.string().min(1),
    type: z11.literal("block"),
    block_type: z11.literal(blockType),
    variant: z11.string().default("medium"),
    visibility: VisibilitySchema,
    content,
    ...blockLayout,
    ...blockTimestamps
  });
}
var ToolkitSkillBlockSchema = toolkitBlockSchema("toolkit_skill", ToolkitSkillContentSchema);
var ToolkitToolBlockSchema = toolkitBlockSchema("toolkit_tool", ToolkitToolContentSchema);
var ToolkitValueBlockSchema = toolkitBlockSchema("toolkit_value", ToolkitValueContentSchema);
var ThinkingMoveBlockSchema = toolkitBlockSchema("thinking_move", ThinkingMoveContentSchema);
var QuestionQuadrantBlockSchema = toolkitBlockSchema(
  "question_quadrant",
  QuestionQuadrantContentSchema
);
var ConceptFeaturesBlockSchema = toolkitBlockSchema(
  "concept_features",
  ConceptFeaturesContentSchema
);
var ThinkingIntentionsBlockSchema = toolkitBlockSchema(
  "thinking_intentions",
  ThinkingIntentionsContentSchema
);
var ThinkingReflectionBlockSchema = toolkitBlockSchema(
  "thinking_reflection",
  ThinkingReflectionContentSchema
);
var FluidAnalogyBlockSchema = toolkitBlockSchema("fluid_analogy", FluidAnalogyContentSchema);
var AnalogyTypesBlockSchema = toolkitBlockSchema("analogy_types", AnalogyTypesContentSchema);
var AnalogyCloseReadingBlockSchema = toolkitBlockSchema("analogy_close_reading", AnalogyMoveContentSchema);
var AnalogyPatternBlockSchema = toolkitBlockSchema("analogy_pattern", AnalogyMoveContentSchema);
var AnalogyReverseBlockSchema = toolkitBlockSchema("analogy_reverse", AnalogyMoveContentSchema);
var AnalogyProblemBlockSchema = toolkitBlockSchema("analogy_problem", AnalogyMoveContentSchema);
var AnalogyMetaphorBlockSchema = toolkitBlockSchema("analogy_metaphor", AnalogyMoveContentSchema);
var AnalogyTransferBlockSchema = toolkitBlockSchema("analogy_transfer", AnalogyMoveContentSchema);
var AnalogyChainsBlockSchema = toolkitBlockSchema("analogy_chains", AnalogyMoveContentSchema);
var TeacherNoteBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("teacher_note"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema.transform(() => "teacher_only"),
  content: TeacherNoteBlockContentSchema,
  ...blockLayout,
  ...blockTimestamps
});
var leafBlockSchemas = [
  RichTextBlockSchema,
  HeadingBlockSchema,
  CalloutBlockSchema,
  ImageBlockSchema,
  GalleryBlockSchema,
  VideoBlockSchema,
  EmbedBlockSchema,
  HtmlBlockSchema,
  HtmlAppBlockSchema,
  QuoteBlockSchema,
  DividerBlockSchema,
  ClassroomToolsBlockSchema,
  CountdownBlockSchema,
  DefinitionBlockSchema,
  CodeBlockSchema,
  AudioBlockSchema,
  AttachmentBlockSchema,
  AccordionBlockSchema,
  TableBlockSchema,
  PeerFeedbackBlockSchema,
  QuestionDropBlockSchema,
  BrainstormBlockSchema,
  HingeQuestionBlockSchema,
  ContinuumLineBlockSchema,
  CurriculumLinesBlockSchema,
  QuizQuestionBlockSchema,
  DiscernConfirmBlockSchema,
  QuestionSetBlockSchema,
  FlashcardsBlockSchema,
  ClozeBlockSchema,
  SelfCheckBlockSchema,
  NoteCueBlockSchema,
  WithTeacherBlockSchema,
  FadedExampleBlockSchema,
  ChartBlockSchema,
  EquationBlockSchema,
  DiagramBlockSchema,
  MindMapBlockSchema,
  ConceptMapBlockSchema,
  WhiteboardBlockSchema,
  OutcomesBlockSchema,
  AnnotationBlockObjectSchema,
  AnthologyBlockObjectSchema,
  ToolkitSkillBlockSchema,
  ToolkitToolBlockSchema,
  ToolkitValueBlockSchema,
  ThinkingMoveBlockSchema,
  QuestionQuadrantBlockSchema,
  ConceptFeaturesBlockSchema,
  ThinkingIntentionsBlockSchema,
  ThinkingReflectionBlockSchema,
  FluidAnalogyBlockSchema,
  AnalogyTypesBlockSchema,
  AnalogyCloseReadingBlockSchema,
  AnalogyPatternBlockSchema,
  AnalogyReverseBlockSchema,
  AnalogyProblemBlockSchema,
  AnalogyMetaphorBlockSchema,
  AnalogyTransferBlockSchema,
  AnalogyChainsBlockSchema,
  TeacherNoteBlockSchema
];
var SpacerBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("spacer"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z11.lazy(
  () => z11.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z11.array(
  z11.object({
    width: z11.number().int().min(1).max(12),
    blocks: z11.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z11.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("columns"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z11.lazy(
  () => z11.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("tabs"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    tabs: z11.array(
      z11.object({
        id: z11.string().min(1),
        label: z11.string(),
        blocks: z11.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionInnerChildBlockSchema = z11.lazy(
  () => z11.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SidePathSectionSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("section"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string(),
    collapsed_in_editor: z11.boolean().optional(),
    blocks: z11.array(SectionInnerChildBlockSchema),
    side_path: z11.literal(true),
    narration: NarrationSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z11.lazy(
  () => z11.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema,
    SidePathSectionSchema
  ])
);
var SectionLinkSchema = z11.object({
  mode: z11.literal("linked"),
  source_composition_id: z11.string().min(1)
});
var GroupSetSchema = z11.object({
  group_id: z11.string().min(1).max(64),
  class_id: z11.string().min(1).max(64),
  name: z11.string().min(1).max(120),
  tags: z11.array(z11.string().min(1).max(120)).min(1).max(8),
  students: z11.array(z11.string().min(1).max(64)).max(60),
  target: z11.number().int().min(1).max(10)
});
var SectionBlockObjectSchema = z11.object({
  id: z11.string().min(1),
  type: z11.literal("block"),
  block_type: z11.literal("section"),
  variant: z11.string().default("medium"),
  visibility: VisibilitySchema,
  content: z11.object({
    title: z11.string(),
    collapsed_in_editor: z11.boolean().optional(),
    blocks: z11.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional(),
    /** Lecture: the chapter intro clip. */
    narration: NarrationSchema.optional(),
    /** Lecture: a "write it in your book" cue at the chapter's end. On unless `enabled: false`. */
    takeaway: z11.object({ enabled: z11.boolean(), prompt: z11.string().max(300).optional() }).optional(),
    /** Lecture: plays only after a wrong answer on the gate just above it. */
    side_path: z11.boolean().optional(),
    /** Tutorial: this top-level section is the tab for the group with this id. */
    tutorial_group: TutorialGroupIdSchema.optional(),
    /** Tutorial: with tutorial_group, this section is that group's exit check (quiz questions). */
    tutorial_exit: z11.boolean().optional(),
    /** Design Sprint: this top-level section holds the guides for one phase. */
    sprint_phase: SprintPhaseKeySchema.optional(),
    /** Quiz: this top-level section is a group set, practice for one markbook group's students only. */
    group_set: GroupSetSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z11.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z11.lazy(
  () => z11.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    SectionBlockObjectSchema,
    TimelineBlockSchema,
    CardStackBlockSchema,
    TabsBlockSchema,
    CollectionBlockSchema
  ]).superRefine((block, ctx) => {
    if (block.block_type === "section") {
      refineLinkedSection(block, ctx);
    }
    if (block.block_type === "annotation") {
      refineAnnotationVoiceTracks(block, ctx);
    }
  })
);

// apps/teaching/src/blocks/walk-blocks.ts
function visitBlocks(blocks, visitor, path = "blocks") {
  blocks.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;
    visitor(block, blockPath);
    if (block.block_type === "section") {
      visitBlocks(block.content.blocks, visitor, `${blockPath}.content.blocks`);
      return;
    }
    if (block.block_type === "columns") {
      block.content.columns.forEach((column, columnIndex) => {
        visitBlocks(
          column.blocks,
          visitor,
          `${blockPath}.content.columns[${columnIndex}].blocks`
        );
      });
      return;
    }
    if (block.block_type === "tabs") {
      block.content.tabs.forEach((tab, tabIndex) => {
        visitBlocks(tab.blocks, visitor, `${blockPath}.content.tabs[${tabIndex}].blocks`);
      });
    }
  });
}

// apps/teaching/src/tutorial/model.ts
function groupSection(block) {
  if (block.block_type !== "section") return null;
  const id = block.content.tutorial_group;
  if (typeof id !== "string") return null;
  return { id, section: block, exit: block.content.tutorial_exit === true };
}
function tutorialParts(blocks) {
  const parts = { common: [], tabs: /* @__PURE__ */ new Map(), exits: /* @__PURE__ */ new Map(), duplicates: { tabs: [], exits: [] } };
  for (const block of blocks) {
    const g = groupSection(block);
    if (!g) {
      parts.common.push(block);
      continue;
    }
    const map = g.exit ? parts.exits : parts.tabs;
    if (map.has(g.id)) (g.exit ? parts.duplicates.exits : parts.duplicates.tabs).push(g.id);
    else map.set(g.id, g.section);
  }
  return parts;
}
function splitAtTeacher(blocks) {
  const at = blocks.findIndex((block) => block.block_type === "with_teacher");
  if (at === -1) return { before: [...blocks], withTeacher: null, after: [] };
  return { before: blocks.slice(0, at), withTeacher: blocks[at], after: blocks.slice(at + 1) };
}
function tutorialIssues(lesson) {
  const settings = lesson.tutorial;
  if (!settings || settings.groups.length === 0) return ["Plan the groups first: open the markbook and press Plan a tutorial."];
  const issues = [];
  const parts = tutorialParts(lesson.blocks);
  const nameOf = (id) => settings.groups.find((group) => group.id === id)?.name ?? id;
  for (const id of parts.duplicates.tabs) issues.push(`Group \u201C${nameOf(id)}\u201D has two tabs.`);
  for (const id of parts.duplicates.exits) issues.push(`Group \u201C${nameOf(id)}\u201D has two exit checks.`);
  const known = new Set(settings.groups.map((group) => group.id));
  if ([...parts.tabs.keys(), ...parts.exits.keys()].some((id) => !known.has(id))) {
    issues.push("A tab is for a group that\u2019s gone. Delete it or plan the groups again.");
  }
  for (const group of settings.groups) {
    const tab = parts.tabs.get(group.id);
    if (!tab) {
      issues.push(`Group \u201C${group.name}\u201D has no tab.`);
      continue;
    }
    const inner = tab.content.blocks;
    if (!splitAtTeacher(inner).withTeacher) issues.push(`Group \u201C${group.name}\u201D has no With teacher step.`);
    let hinge = false;
    visitBlocks(inner, (block) => {
      if (block.block_type === "hinge_question") hinge = true;
    });
    if (hinge) issues.push(`Group \u201C${group.name}\u201D has a hinge question. In a group tab, use a faded example, cloze or self-check instead.`);
    let questions = 0;
    visitBlocks(parts.exits.get(group.id)?.content.blocks ?? [], (block) => {
      if (block.block_type === "quiz_question") questions += 1;
    });
    if (questions === 0) issues.push(`Group \u201C${group.name}\u201D has no exit check questions.`);
  }
  let stray = false;
  visitBlocks([...parts.common, ...[...parts.tabs.values()].flatMap((tab) => tab.content.blocks)], (block) => {
    if (block.block_type === "quiz_question") stray = true;
  });
  if (stray) issues.push("Quiz questions in a tutorial go in a group\u2019s exit check.");
  return issues;
}

// apps/teaching/src/sprint/rules.ts
var SYDNEY = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
function sydneyOffset(epoch) {
  const parts = SYDNEY.formatToParts(new Date(epoch));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - Math.floor(epoch / 6e4) * 6e4;
}
function sydneyEpoch(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const t = /^(\d{2}):(\d{2})$/.exec(time) ?? ["", "23", "59"];
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let epoch = wall - sydneyOffset(wall);
  epoch = wall - sydneyOffset(epoch);
  return epoch;
}
function phaseDue(phase) {
  return sydneyEpoch(phase.due_date, phase.due_time || "23:59");
}
var SHORT_WHEN = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "numeric", minute: "2-digit" });

// apps/teaching/src/sprint/model.ts
function sprintIssues(lesson) {
  const s = lesson.sprint;
  if (!s) return ["Set up the sprint\u2019s Kit before publishing."];
  const out = [];
  if (s.criteria.length < 2) out.push("Add at least 2 criteria in the Kit.");
  const dues = s.phases.map((p) => phaseDue(p));
  if (dues.some((d) => d === null)) out.push("Set a deadline for every phase.");
  else if (dues.some((d, i) => i > 0 && d <= dues[i - 1])) out.push("Each phase\u2019s deadline must come after the one before it.");
  if (!s.groups.length || s.groups.some((g) => !g.students.length)) out.push("Put every student in a group.");
  const seen = /* @__PURE__ */ new Set();
  for (const g of s.groups) for (const st of g.students) {
    if (seen.has(st)) {
      out.push("A student is in two groups. Keep each student in one group.");
      break;
    }
    seen.add(st);
  }
  return out;
}

// apps/teaching/src/schemas/cover.ts
import { z as z12 } from "zod";
var CoverSchema = z12.object({
  url: z12.string().min(1).optional(),
  media_id: z12.string().min(1).optional(),
  alt_text: z12.string().optional()
}).superRefine((cover, ctx) => {
  if (!cover.url && !cover.media_id) {
    ctx.addIssue({
      code: z12.ZodIssueCode.custom,
      message: "Cover needs a url and/or media_id"
    });
  }
  if (cover.url !== void 0 && !isHttpUrl(cover.url)) {
    ctx.addIssue({
      code: z12.ZodIssueCode.custom,
      path: ["url"],
      message: "Cover url must be http(s)"
    });
  }
});
var CoverPatchSchema = CoverSchema.nullable();

// apps/teaching/src/schemas/source.ts
import { z as z13 } from "zod";
var SourceSchema = z13.object({
  system: z13.literal("notion"),
  page_id: z13.string().min(1).max(64),
  imported_at: IsoDateSchema,
  last_edited_at: IsoDateSchema
});

// apps/teaching/src/blocks/learning-activity.ts
var CLOZE_MARKER = /\[\[([^\]]+)\]\]/g;
function parseClozeText(text2) {
  const segments = [];
  const blanks = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(CLOZE_MARKER.source, "g");
  while ((match = re.exec(text2)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text2.slice(lastIndex, match.index) });
    }
    const inner = match[1];
    const pipeIndex = inner.indexOf("|");
    const blank = pipeIndex === -1 ? { answer: inner } : { answer: inner.slice(0, pipeIndex), hint: inner.slice(pipeIndex + 1) };
    const index = blanks.length;
    blanks.push(blank);
    segments.push({ type: "blank", blank, index });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text2.length) {
    segments.push({ type: "text", value: text2.slice(lastIndex) });
  } else if (segments.length === 0) {
    segments.push({ type: "text", value: text2 });
  }
  return { segments, blanks };
}

// apps/teaching/src/blocks/sanitize-svg.ts
var ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "title",
  "desc",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "use",
  "symbol"
]);
var ALLOWED_ATTRS = /* @__PURE__ */ new Set([
  "id",
  "class",
  "viewbox",
  "xmlns",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "transform",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
  "text-anchor",
  "font-size",
  "font-family",
  "dx",
  "dy",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "clip-path",
  "mask",
  "href",
  "xlink:href"
]);
var STRIP_TAGS = /* @__PURE__ */ new Set(["script", "style"]);
var MEANINGFUL_TAGS = /* @__PURE__ */ new Set([
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "use",
  "image"
]);
function isSafeHref(value) {
  return value.trim().startsWith("#");
}
function isSafeUrlAttrValue(value) {
  if (!/url\s*\(/i.test(value)) return true;
  const withoutSafe = value.replace(/url\s*\(\s*(['"]?)#([^)'"]*)\1\s*\)/gi, "");
  return !/url\s*\(/i.test(withoutSafe);
}
function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function serializeTagName(tag) {
  const camel = {
    lineargradient: "linearGradient",
    radialgradient: "radialGradient",
    clippath: "clipPath"
  };
  return camel[tag] ?? tag;
}
function sanitizeSvgMarkup(markup) {
  const doc = new DOMParser().parseFromString(
    `<sanitize-root>${markup}</sanitize-root>`,
    "application/xml"
  );
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return "";
  }
  const root = doc.documentElement;
  if (!root) return "";
  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeText(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (STRIP_TAGS.has(tag)) {
      return "";
    }
    if (!ALLOWED_TAGS.has(tag)) {
      return Array.from(el.childNodes).map(clean).join("");
    }
    const attrs = [];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) continue;
      if (!ALLOWED_ATTRS.has(name)) continue;
      if ((name === "href" || name === "xlink:href") && !isSafeHref(attr.value)) continue;
      if (!isSafeUrlAttrValue(attr.value)) continue;
      attrs.push(`${attr.name}="${escapeAttr(attr.value)}"`);
    }
    const outTag = serializeTagName(tag);
    const inner = Array.from(el.childNodes).map(clean).join("");
    return `<${outTag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${inner}</${outTag}>`;
  }
  return Array.from(root.childNodes).map(clean).join("");
}
function svgHasMeaningfulContent(markup) {
  if (!markup.trim()) return false;
  const doc = new DOMParser().parseFromString(
    `<sanitize-root>${markup}</sanitize-root>`,
    "application/xml"
  );
  if (doc.getElementsByTagName("parsererror").length > 0) return false;
  const root = doc.documentElement;
  if (!root) return false;
  function walk2(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (MEANINGFUL_TAGS.has(tag)) return true;
    if (tag === "path") {
      const d = el.getAttribute("d")?.trim() ?? "";
      if (d.length > 0) return true;
    }
    return Array.from(el.childNodes).some(walk2);
  }
  return Array.from(root.childNodes).some(walk2);
}

// apps/teaching/src/blocks/graph-layout.ts
function isRoot(node) {
  return node.parent_id == null;
}
function hasCycle(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const start of nodes) {
    const seen = /* @__PURE__ */ new Set();
    let current = start;
    while (current) {
      if (seen.has(current.id)) return true;
      seen.add(current.id);
      if (isRoot(current) || !current.parent_id) break;
      current = byId.get(current.parent_id);
    }
  }
  return false;
}
function validateMindMap(content) {
  const { nodes } = content;
  if (nodes.length === 0) {
    return "Mind map requires at least one node";
  }
  if (hasCycle(nodes)) {
    return "Mind map has a cycle in parent links";
  }
  const roots = nodes.filter(isRoot);
  if (roots.length !== 1) {
    return "Mind map requires exactly one root node";
  }
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    if (isRoot(node)) continue;
    if (!node.parent_id || !ids.has(node.parent_id)) {
      return `Mind map node "${node.id}" has a missing parent`;
    }
  }
  return null;
}
function validateConceptMap(content) {
  const { nodes, edges } = content;
  if (nodes.length < 2) {
    return "Concept map requires at least two nodes";
  }
  if (edges.length < 1) {
    return "Concept map requires at least one edge";
  }
  const ids = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    const label = edge.label?.trim() ?? "";
    if (!label) {
      return "Concept map edges require a non-empty label";
    }
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      return `Concept map edge "${edge.id}" has invalid endpoints`;
    }
  }
  return null;
}

// apps/teaching/src/blocks/hinge-question/shared.ts
var MIN_OPTIONS = 2;
function hingeIssue(content) {
  if (!content.prompt.trim()) return "Write the hinge question";
  if (content.options.length < MIN_OPTIONS) return "A hinge question needs at least two answers";
  if (content.options.some((o) => !o.text.trim())) return "Fill in every answer, or remove the empty one";
  if (!content.options.some((o) => o.id === content.correct_id)) return "Mark the right answer";
  if (content.reteach >= content.move_on) return "The reteach mark must be below the move-on mark";
  return null;
}

// apps/teaching/src/lecture/scenes.ts
var GATE_TYPES = /* @__PURE__ */ new Set(["hinge_question", "cloze", "self_check", "faded_example"]);
function isGate(block) {
  if (!GATE_TYPES.has(block.block_type)) return false;
  if (block.block_type === "faded_example") {
    return block.content.gate !== false && block.content.blanks.length > 0;
  }
  return block.content.gate !== false;
}
function takesSidePath(block) {
  return block.block_type === "hinge_question" || block.block_type === "cloze" || block.block_type === "faded_example";
}
function isSidePath(block) {
  return block.block_type === "section" && block.content.side_path === true;
}

// apps/teaching/src/schemas/publish-block-issues.ts
var KIND_LABEL = {
  rich_text: "Text",
  html: "HTML",
  html_app: "HTML app",
  question_set: "Question set",
  question_drop: "Question drop",
  brainstorm: "Brainstorm",
  hinge_question: "Hinge question",
  continuum_line: "Continuum line",
  curriculum_lines: "Curriculum lines",
  discern_confirm: "Discern Confirm",
  quiz_question: "Quiz question",
  self_check: "Self check",
  note_cue: "Note cue",
  with_teacher: "With teacher",
  faded_example: "Faded example",
  mind_map: "Mind map",
  concept_map: "Concept map"
};
var CAPTION_MAX = 48;
function formatPublishBlockIssue(issue) {
  return `${issue.label}: ${issue.message}`;
}
var ORPHAN_SIDE_PATH = "Place this If wrong path straight under a hinge question or cloze.";
function listPublishBlockIssues(blocks, options = {}) {
  const typeOrder = collectTypeOrder(blocks);
  const issues = [];
  const discernHosts = /* @__PURE__ */ new Set();
  visitBlocks(blocks, (block) => {
    if (block.discern) discernHosts.add(block.id);
  });
  walk(blocks, [], typeOrder, issues, discernHosts, options.lecture === true);
  return issues;
}
function collectTypeOrder(blocks) {
  const order = /* @__PURE__ */ new Map();
  visitBlocks(blocks, (block) => {
    const ids = order.get(block.block_type) ?? [];
    ids.push(block.id);
    order.set(block.block_type, ids);
  });
  return order;
}
function walk(blocks, ancestors, typeOrder, issues, discernHosts, lecture) {
  const judgeOrder = lecture && (ancestors.length > 0 || blocks.length > 1);
  for (const [index, block] of blocks.entries()) {
    const label = locateBlock(block, ancestors, typeOrder);
    const before = blocks[index - 1];
    const orphan = judgeOrder && isSidePath(block) && !(before && isGate(before) && takesSidePath(before));
    const message = ownIssue(block, discernHosts) ?? (orphan ? ORPHAN_SIDE_PATH : null);
    if (message) {
      issues.push({
        blockId: block.id,
        blockType: block.block_type,
        label,
        message
      });
    }
    if (block.block_type === "section") {
      walk(block.content.blocks, [...ancestors, shortLabel2(block)], typeOrder, issues, discernHosts, lecture);
    } else if (block.block_type === "columns") {
      block.content.columns.forEach((column, index2) => {
        walk(
          column.blocks,
          [...ancestors, `Column ${index2 + 1}`],
          typeOrder,
          issues,
          discernHosts,
          lecture
        );
      });
    } else if (block.block_type === "tabs") {
      block.content.tabs.forEach((tab, index2) => {
        const tabLabel = tab.label.trim() ? `Tab \u201C${truncate(tab.label.trim())}\u201D` : `Tab ${index2 + 1}`;
        walk(tab.blocks, [...ancestors, tabLabel], typeOrder, issues, discernHosts, lecture);
      });
    }
  }
}
function locateBlock(block, ancestors, typeOrder) {
  const ids = typeOrder.get(block.block_type) ?? [block.id];
  const index = ids.indexOf(block.id);
  const ordinal = { index: index >= 0 ? index + 1 : 1, total: ids.length };
  const self = shortLabel2(block, ordinal);
  return ancestors.length > 0 ? `${ancestors.join(" \u2192 ")} \u2192 ${self}` : self;
}
function kindLabel(type) {
  const mapped = KIND_LABEL[type];
  if (mapped) return mapped;
  return type.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
function shortLabel2(block, ordinal) {
  const kind = kindLabel(block.block_type);
  const numbered = ordinal && ordinal.total > 1 ? `${kind} ${ordinal.index}` : kind;
  const caption = blockCaption(block);
  return caption ? `${numbered} \u201C${caption}\u201D` : numbered;
}
function truncate(text2) {
  if (text2.length <= CAPTION_MAX) return text2;
  return `${text2.slice(0, CAPTION_MAX - 1).trimEnd()}\u2026`;
}
function blockCaption(block) {
  const content = block.content;
  const read = (...keys) => {
    for (const key of keys) {
      const value = content[key];
      if (typeof value === "string" && value.trim()) return truncate(value.trim());
    }
    return null;
  };
  switch (block.block_type) {
    case "heading":
      return read("text");
    case "callout":
      return read("title", "body");
    case "image":
      return read("alt_text", "caption");
    case "gallery":
      return read("title");
    case "video":
    case "embed":
      return read("title", "caption", "url");
    case "html_app":
      return read("title");
    case "quote":
      return read("quote");
    case "definition":
      return read("term");
    case "attachment":
      return read("title");
    case "section":
      return read("title");
    case "chart":
    case "mind_map":
    case "concept_map":
    case "equation":
    case "diagram":
      return read("title", "caption", "image_alt");
    case "card_stack": {
      const heading = read("title");
      if (heading) return heading;
      const first = block.content.cards[0]?.title.trim();
      return first ? truncate(first) : null;
    }
    case "self_check":
      return read("prompt");
    case "cloze":
      return read("text");
    default:
      return read("title", "caption");
  }
}
function ownIssue(block, discernHosts) {
  if (block.block_type === "discern_confirm" && !discernHosts.has(block.content.target_block_id)) {
    return "This Confirm card is not linked to a block with Discern. Delete it or add Discern again";
  }
  if (block.discern?.initial.type === "choose" && block.discern.initial.options.filter((o) => o.trim()).length < 2) {
    return "Discern needs at least two initial answer options";
  }
  if (block.discern?.mode === "theirs" && !block.discern.who.trim()) {
    return "Discern needs the name of whose choice students are judging";
  }
  if (block.block_type === "collection") {
    return "Collection blocks can only be used on class homepages";
  }
  if (block.block_type === "question_drop" && !block.content.target_quiz_id) {
    return "Choose the quiz this Question drop feeds into";
  }
  if (block.block_type === "brainstorm" && !block.content.question.trim()) {
    return "Write the question for this Brainstorm";
  }
  if (block.block_type === "hinge_question") {
    const issue = hingeIssue(block.content);
    if (issue) return issue;
  }
  if (block.block_type === "continuum_line") {
    const c = block.content;
    if (!c.statements.some((s) => s.text.trim())) return "Write at least one statement for this Continuum line";
    if (!c.scale.left.trim() || !c.scale.right.trim()) return "Label both ends of this Continuum line";
    if (c.stimulus.kind === "text" && !c.stimulus.text.trim()) return "Add the stimulus for this Continuum line";
    if (c.stimulus.kind === "image" && !isHttpUrl(c.stimulus.url)) return "Give the stimulus image a valid http(s) URL";
    if (c.stimulus.kind === "video" && !c.stimulus.url.trim()) return "Paste the stimulus video link";
  }
  if (block.block_type === "quiz_question") {
    const checked = checkQuestion(block.content.question);
    if (!checked.ok) return checked.message;
  }
  if (block.block_type === "image") {
    if (!isHttpUrl(block.content.url)) {
      return "Image blocks need a valid http(s) URL to publish";
    }
    if (block.content.alt_text.trim().length === 0) {
      return "Image blocks need alt text to publish";
    }
  }
  if (block.block_type === "gallery") {
    for (const entry of block.content.items) {
      if (!isHttpUrl(entry.url)) {
        return "Gallery images need a valid http(s) URL to publish";
      }
      if (entry.alt_text.trim().length === 0) {
        return "Gallery images need alt text to publish";
      }
    }
  }
  if (block.block_type === "video") {
    if (!block.content.external_id.trim()) {
      return "Video blocks need a recognised YouTube or Vimeo id to publish";
    }
  }
  if (block.block_type === "embed") {
    if (!isHttpUrl(block.content.url)) {
      return "Embed blocks need a valid http(s) URL to publish";
    }
  }
  if (block.block_type === "html") {
    if (block.content.html.trim().length === 0) {
      return "HTML blocks need content to publish";
    }
  }
  if (block.block_type === "html_app") {
    if (block.content.html.trim().length === 0) {
      return "HTML app blocks need content to publish";
    }
    if (block.content.ai) {
      if (block.content.ai.system.trim().length === 0) {
        return "HTML app AI lanes need a system / focus prompt to publish";
      }
      if (block.content.ai.model.trim().length === 0) {
        return "HTML app AI lanes need a model to publish";
      }
    }
  }
  if (block.block_type === "audio") {
    const mode = block.content.mode ?? "listen";
    if (mode !== "listen" && !block.content.prompt?.trim()) {
      return "Voice blocks need a question to publish";
    }
    if (mode === "listen" && !isHttpUrl(block.content.url)) {
      return "Audio blocks need a valid http(s) URL to publish";
    }
  }
  if (block.block_type === "attachment") {
    if (!isHttpUrl(block.content.url)) {
      return "Attachment blocks need a valid http(s) URL to publish";
    }
    if (block.content.title.trim().length === 0) {
      return "Attachment blocks need a title to publish";
    }
  }
  if (block.block_type === "question_set") {
    if (block.content.questions.length === 0) {
      return "Question set blocks need at least one question to publish";
    }
    for (const question of block.content.questions) {
      if (question.prompt.trim().length === 0) {
        return "Question set blocks need a non-empty prompt on every question to publish";
      }
      if (question.kind === "multiple_choice") {
        const options = (question.options ?? []).map((option) => option.trim()).filter(Boolean);
        if (options.length < 2) {
          return "Multiple choice questions need at least two options to publish";
        }
      }
    }
  }
  if (block.block_type === "quote") {
    if (block.content.quote.trim().length === 0) {
      return "Quote blocks need quote text to publish";
    }
  }
  if (block.block_type === "definition") {
    if (block.content.term.trim().length === 0 || block.content.definition.trim().length === 0) {
      return "Definition blocks need a term and definition to publish";
    }
  }
  if (block.block_type === "table") {
    if (block.content.headers.length === 0) {
      return "Table blocks need at least one header to publish";
    }
  }
  if (block.block_type === "section") {
    if (block.content.title.trim().length === 0) {
      return "Section blocks need a title to publish";
    }
  }
  if (block.block_type === "timeline") {
    for (const event of block.content.events) {
      if (event.label.trim().length === 0 || event.when.trim().length === 0) {
        return "Timeline events need a label and when value to publish";
      }
      if (event.image_url !== void 0 && event.image_url.trim().length > 0) {
        if (!isHttpUrl(event.image_url)) {
          return "Timeline event images need a valid http(s) URL to publish";
        }
        if ((event.image_alt ?? "").trim().length === 0) {
          return "Timeline event images need alt text to publish";
        }
      }
      if (event.link_url !== void 0 && event.link_url.trim().length > 0) {
        if (!isHttpUrl(event.link_url)) {
          return "Timeline event links need a valid http(s) URL to publish";
        }
      }
    }
  }
  if (block.block_type === "card_stack") {
    for (const card of block.content.cards) {
      if (card.title.trim().length === 0) {
        return "Card stack cards need a title to publish";
      }
      if (card.image_url !== void 0 && card.image_url.trim().length > 0) {
        if (!isHttpUrl(card.image_url)) {
          return "Card stack images need a valid http(s) URL to publish";
        }
        if ((card.image_alt ?? "").trim().length === 0) {
          return "Card stack images need alt text to publish";
        }
      }
    }
  }
  if (block.block_type === "tabs") {
    for (const panel of block.content.tabs) {
      if (panel.label.trim().length === 0) {
        return "Tabs blocks need a label on every tab to publish";
      }
    }
  }
  if (block.block_type === "flashcards") {
    for (const card of block.content.cards) {
      if (card.front.trim().length === 0 || card.back.trim().length === 0) {
        return "Flashcards need front and back text on every card to publish";
      }
    }
  }
  if (block.block_type === "cloze") {
    const validBlanks = parseClozeText(block.content.text).blanks.filter(
      (blank) => blank.answer.trim().length > 0
    );
    if (validBlanks.length < 1) {
      return "Cloze blocks need at least one blank to publish";
    }
  }
  if (block.block_type === "note_cue" && !block.content.prompt.trim()) {
    return "Write the prompt for this note cue";
  }
  if (block.block_type === "faded_example" && (!block.content.extract.trim() || block.content.parts.some((p) => !p.answer.trim()))) {
    return "Faded example needs an extract and a model answer for every part.";
  }
  if (block.block_type === "self_check") {
    if (block.content.prompt.trim().length === 0) {
      return "Self check blocks need a prompt to publish";
    }
    if (block.content.mode === "reveal" || block.content.mode === "confidence") {
      if ((block.content.answer ?? "").trim().length === 0) {
        return "Self check blocks need an answer to publish";
      }
    }
    if (block.content.mode === "checklist") {
      const items = (block.content.items ?? []).filter((item) => item.label.trim().length > 0);
      if (items.length === 0) {
        return "Self check checklists need at least one item to publish";
      }
    }
  }
  if (block.block_type === "chart") {
    for (const series of block.content.series) {
      if (series.points.length === 0) {
        return "Chart series need at least one point to publish";
      }
      for (const point of series.points) {
        if (!Number.isFinite(point.y)) {
          return "Chart points need finite y values to publish";
        }
      }
    }
  }
  if (block.block_type === "equation") {
    if (block.content.latex.trim().length === 0) {
      return "Equation blocks need LaTeX to publish";
    }
  }
  if (block.block_type === "diagram") {
    if (block.content.source === "image") {
      if (!isHttpUrl(block.content.image_url ?? "")) {
        return DIAGRAM_IMAGE_PUBLISH_URL_ISSUE;
      }
      if ((block.content.image_alt ?? "").trim().length === 0) {
        return "Diagram image needs alt text to publish";
      }
    } else {
      const cleaned = sanitizeSvgMarkup(block.content.svg_markup ?? "");
      if (!svgHasMeaningfulContent(cleaned)) {
        return "Diagram SVG needs safe SVG markup to publish";
      }
    }
  }
  if (block.block_type === "mind_map") {
    return validateMindMap(block.content);
  }
  if (block.block_type === "concept_map") {
    return validateConceptMap(block.content);
  }
  return null;
}

// apps/teaching/src/schemas/lesson.ts
var LessonSchema = z14.object({
  ...CommonFields,
  ...TrashFields,
  type: z14.literal("lesson"),
  unit_id: z14.string().min(1),
  sequence: z14.number().int(),
  blocks: z14.array(BlockSchema),
  published_at: IsoDateSchema.optional(),
  cover: CoverSchema.optional(),
  tags: z14.array(z14.string().min(1).max(40)).max(24).optional(),
  author_id: z14.string().min(1).optional(),
  review_status: z14.enum(["needs_review", "none"]).optional(),
  syllabus_outcomes: z14.array(z14.string().min(1).max(32)).max(24).optional(),
  outcome_ids: z14.array(z14.string().min(1).max(64)).max(24).optional(),
  /** Curriculum network: the subject lines this lesson serves, with depth for train and metro. */
  line_stops: z14.array(LineStopSchema).max(16).optional(),
  /** Lines taken off by hand that the dot points would add; they stay off. */
  line_off: LineOffSchema.optional(),
  /**
   * Lessons that come after this one. Unset (or null: saves merge, so null is
   * how a lesson goes back) follows unit order; an empty list ends the unit here.
   */
  after_lesson_ids: AfterLessonIdsSchema.nullable().optional(),
  /** On the unit map: a support or extension lesson beside the core route. Null (saves merge) goes back to core. */
  route_role: LessonRouteRoleSchema.nullable().optional(),
  skip_rule: LessonSkipRuleSchema.nullable().optional(),
  /** A support, extension or optional lesson: the core lesson it branches off. Null (saves merge) goes back to its place in the order. */
  branch_from: z14.string().min(1).max(64).nullable().optional(),
  /** Taught before the unit officially starts: the unit map's weeks count from the first lesson after. */
  pre_unit: z14.boolean().nullable().optional(),
  /** Syllabus dot points this lesson teaches ("human:U2"); its outcomes and concepts follow from the alignment. */
  dot_points: z14.array(DotPointRefSchema).max(20).optional(),
  /** What the dot points ask for that this lesson's activities already cover ("outcome:3", "concept:PER2", "process:UND", "skill:analysis"). */
  plan_covered: z14.array(z14.string().regex(/^(outcome|concept|process|skill):[A-Za-z0-9_]{1,40}$/)).max(120).optional(),
  /** Teacher planning metadata; optional for blob/version compatibility. */
  pedagogical_mode: PedagogicalModeSchema.optional(),
  /** Hides the student feedback dot on every block of this lesson. */
  feedback_off: z14.boolean().optional(),
  /** Quiz lessons only: timer, attempts, feedback and other quiz settings. */
  quiz: QuizSettingsSchema.optional(),
  /** Tutorial lessons only: the class and its groups. */
  tutorial: TutorialSettingsSchema.optional(),
  /** Design Sprint lessons only: Kit, phases and groups. */
  sprint: SprintSettingsSchema.optional(),
  source: SourceSchema.optional()
});
var PublishableLessonSchema = LessonSchema.superRefine((lesson, ctx) => {
  if (lesson.title.trim().length === 0) {
    ctx.addIssue({
      code: z14.ZodIssueCode.custom,
      message: "Title is required to publish",
      path: ["title"]
    });
  }
  if (lesson.pedagogical_mode !== "quiz" && lesson.pedagogical_mode !== "tutorial") {
    let stray = false;
    visitBlocks(lesson.blocks, (block) => {
      if (block.block_type === "quiz_question") stray = true;
    });
    if (stray) {
      ctx.addIssue({
        code: z14.ZodIssueCode.custom,
        message: "Quiz questions only work in a lesson set to Quiz. Change the lesson type or remove them.",
        path: ["blocks"]
      });
    }
  }
  if (lesson.pedagogical_mode === "tutorial") {
    for (const message of tutorialIssues(lesson)) {
      ctx.addIssue({ code: z14.ZodIssueCode.custom, message, path: ["blocks"] });
    }
  }
  if (lesson.pedagogical_mode === "design_sprint") {
    for (const message of sprintIssues(lesson)) {
      ctx.addIssue({ code: z14.ZodIssueCode.custom, message, path: ["sprint"] });
    }
  }
  for (const issue of listPublishBlockIssues(lesson.blocks, { lecture: lesson.pedagogical_mode === "lecture" || lesson.pedagogical_mode === "tutorial" })) {
    ctx.addIssue({
      code: z14.ZodIssueCode.custom,
      message: formatPublishBlockIssue(issue),
      path: ["blocks"]
    });
  }
});

// apps/teaching/src/schemas/unit.ts
import { z as z15 } from "zod";
var UnitSchema = z15.object({
  ...CommonFields,
  ...TrashFields,
  type: z15.literal("unit"),
  year_id: z15.string().min(1),
  subject_id: z15.string().min(1),
  lesson_ids: z15.array(z15.string().min(1)),
  primary_term: z15.number().int().positive().optional(),
  start_date: z15.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z15.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z15.string().optional(),
  cover: CoverSchema.optional(),
  blocks: z15.array(BlockSchema).optional(),
  outcome_ids: z15.array(z15.string().min(1)).max(24).optional(),
  /** 'program': same level as a unit, never one of a class's active units. */
  kind: z15.enum(["program"]).optional(),
  source: SourceSchema.optional()
});

// apps/teaching/src/schemas/class.ts
import { z as z16 } from "zod";

// apps/teaching/src/schemas/student-initials.ts
var INITIALS_PATTERN = /^[A-Z]{1,4}[0-9]?$/;
var STUDENT_ID_PATTERN = /^st_[a-z0-9_]{1,24}$/;

// apps/teaching/src/schedule/timetable.js
var DAY_MS = 864e5;
var TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function dateNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use a valid date.");
  const n = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) throw new Error("Use a valid date.");
  return n / DAY_MS;
}
var weekday = (n) => ![0, 6].includes(new Date(n * DAY_MS).getUTCDay());
function validateTimetable(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose or enter a class timetable.");
  const { anchor_date, anchor_day, cycle_length, slots } = input;
  const anchor = dateNumber(anchor_date);
  if (!Number.isInteger(cycle_length) || cycle_length < 1 || cycle_length > 20 || !Number.isInteger(anchor_day) || anchor_day < 1 || anchor_day > cycle_length) throw new Error("Cycle days must fit the cycle length (1\u201320).");
  if (!Array.isArray(slots) || !slots.length || slots.length > 100) throw new Error("Add between 1 and 100 teaching times.");
  const normalized = slots.map((slot) => {
    if (!slot || !Number.isInteger(slot.day) || slot.day < 1 || slot.day > cycle_length || !TIME.test(slot.start_time) || !TIME.test(slot.end_time) || slot.start_time >= slot.end_time) throw new Error("Each teaching time needs a valid day, start and later end time.");
    if (slot.period != null && typeof slot.period !== "string" || slot.room != null && typeof slot.room !== "string") throw new Error("Period and room must be text.");
    return { day: slot.day, start_time: slot.start_time, end_time: slot.end_time, period: (slot.period ?? "").trim().slice(0, 40), room: (slot.room ?? "").trim().slice(0, 80) };
  }).sort((a, b) => a.day - b.day || a.start_time.localeCompare(b.start_time));
  normalized.forEach((slot, i) => {
    const prev = normalized[i - 1];
    if (prev && prev.day === slot.day && prev.end_time > slot.start_time) throw new Error("Teaching times on the same cycle day must not overlap.");
  });
  const non_school_dates = input.non_school_dates ?? [];
  if (!Array.isArray(non_school_dates) || non_school_dates.length > 1e3) throw new Error("Enter non-school dates as a list.");
  non_school_dates.forEach(dateNumber);
  if (!weekday(anchor) || non_school_dates.includes(anchor_date)) throw new Error("The anchor must be a school day.");
  const cycle_overrides = input.cycle_overrides ?? {};
  if (!cycle_overrides || typeof cycle_overrides !== "object" || Array.isArray(cycle_overrides) || Object.keys(cycle_overrides).length > 100) throw new Error("Enter valid cycle corrections.");
  for (const [date, day2] of Object.entries(cycle_overrides)) {
    const n = dateNumber(date);
    if (!weekday(n) || non_school_dates.includes(date) || !Number.isInteger(day2) || day2 < 1 || day2 > cycle_length || date === anchor_date && day2 !== anchor_day) throw new Error("A cycle correction must name a school day and valid cycle day.");
  }
  return { anchor_date, anchor_day, cycle_length, slots: normalized, non_school_dates: [...new Set(non_school_dates)].sort(), cycle_overrides: { ...cycle_overrides } };
}

// apps/teaching/src/schemas/class.ts
var ClassTimetableSchema = z16.unknown().transform((value, ctx) => {
  try {
    return validateTimetable(value);
  } catch (error) {
    ctx.addIssue({ code: z16.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Invalid timetable" });
    return z16.NEVER;
  }
});
var ClassHomepageSchema = z16.object({
  announcements: z16.array(BlockSchema),
  resources: z16.array(BlockSchema),
  custom: z16.array(BlockSchema)
});
var ClassStudentSchema = z16.object({
  name: z16.string().min(1).max(80),
  skip_picker: z16.boolean().default(false),
  /** Never changes once saved, so renames keep a student's quiz results. */
  id: z16.string().regex(STUDENT_ID_PATTERN).optional(),
  /** What the student types to take a quiz. Unique within the class. */
  initials: z16.string().regex(INITIALS_PATTERN).optional()
});
var MAX_CLASS_STUDENTS = 60;
var ClassSchema = z16.object({
  ...CommonFields,
  ...TrashFields,
  type: z16.literal("class"),
  code: z16.string().min(1),
  display_name: z16.string().min(1).optional(),
  academic_year: z16.number().int(),
  year_id: z16.string().min(1),
  subject_id: z16.string().min(1),
  active_unit_ids: z16.array(z16.string().min(1)),
  current_unit_id: z16.string().min(1).optional(),
  current_scheduled_lesson_id: z16.string().min(1).optional(),
  meeting_days: z16.array(z16.number().int().min(1).max(7)).optional(),
  timetable: ClassTimetableSchema.optional(),
  homepage: ClassHomepageSchema.optional(),
  cover: CoverSchema.optional(),
  students: z16.array(ClassStudentSchema).max(MAX_CLASS_STUDENTS).optional(),
  source: SourceSchema.optional()
});

// apps/teaching/src/schemas/subject.ts
import { z as z17 } from "zod";
var SubjectSchema = z17.object({
  ...CommonFields,
  type: z17.literal("subject"),
  display_title: z17.string().min(1),
  scope_id: z17.string().min(1).optional(),
  unit_ids: z17.array(z17.string().min(1)),
  outcome_ids: z17.array(z17.string().min(1)),
  class_ids: z17.array(z17.string().min(1)),
  /** Curriculum network lines, in map column order: trains, metro, light rail. */
  network_lines: z17.array(NetworkLineSchema).max(24).optional(),
  /** Drag offsets on the year network, keyed by unit id. */
  network_nudges: NetworkNudgesSchema.optional()
});

// apps/teaching/src/schemas/document.ts
import { z as z18 } from "zod";
var DocumentKindSchema = z18.enum(["syllabus"]);
var DocumentSchema = z18.object({
  ...CommonFields,
  ...TrashFields,
  type: z18.literal("document"),
  kind: DocumentKindSchema,
  subject_id: z18.string().min(1),
  blocks: z18.array(BlockSchema),
  cover: CoverSchema.optional(),
  source: SourceSchema.optional()
});
export {
  ClassSchema,
  DocumentSchema,
  EMPTY_CHOICES,
  LessonSchema,
  MEDIA_PLACEHOLDER_PREFIX,
  SubjectSchema,
  UnitSchema,
  buildImportPlan,
  categoryRule
};
