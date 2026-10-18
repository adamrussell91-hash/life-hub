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
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
      const text = richTextHtml(n.data.rich_text);
      if (text) r.html += `<p>${text}</p>`;
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
function plainParagraphsHtml(text) {
  return text.split("\n").filter((line) => line.trim()).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
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
function boldLine(text, st, notionId) {
  return makeBlock("rich_text", st.ids.from(notionId), { html: `<p><strong>${escapeHtml(text)}</strong></p>` }, st.now);
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
import { z as z9 } from "zod";

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
import { z as z6 } from "zod";

// apps/teaching/src/schemas/kaplan.ts
import { z as z3 } from "zod";
var KaplanLensSchema = z3.enum(["patterns", "multiple_perspectives", "ethics"]);
var ThreePromptsSchema = z3.tuple([
  z3.string().max(1200),
  z3.string().max(1200),
  z3.string().max(1200)
]);
var KaplanQualifierSchema = z3.object({
  lens: KaplanLensSchema,
  focus: z3.string().trim().max(200).default(""),
  mode: z3.enum(["notes", "discussion"]).default("notes"),
  prompts: ThreePromptsSchema.optional(),
  supports: z3.tuple([
    z3.string().max(1200).nullable(),
    z3.string().max(1200).nullable(),
    z3.string().max(1200).nullable()
  ]).optional()
});
var KaplanQualifiersSchema = z3.array(KaplanQualifierSchema).max(3).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.lens)).size !== items.length) {
    ctx.addIssue({ code: z3.ZodIssueCode.custom, message: "Use each Kaplan lens once per block." });
  }
});

// apps/teaching/src/quiz/core.ts
import { z as z4 } from "zod";
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
  "label_image",
  "extended_response",
  "explain_effect"
];
var QuizQuestionKindSchema = z4.enum(QUIZ_QUESTION_KINDS);
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
var Id = z4.string().min(1).max(64);
var Text = (max) => z4.string().trim().min(1).max(max);
var OptionalText = (max) => z4.string().trim().max(max).optional();
var QuizImageSchema = z4.object({
  url: z4.string().min(1).max(2e3),
  alt: z4.string().max(300).default("")
});
var QuizChoiceSchema = z4.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z4.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z4.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z4.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizPinSchema = z4.object({
  id: Id,
  x: z4.number().min(0).max(1),
  y: z4.number().min(0).max(1),
  label: Text(120)
});
var base = {
  id: Id,
  prompt: z4.string().trim().max(QUIZ_LIMITS.prompt),
  marks: z4.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional()
};
var QuizQuestionSchema = z4.discriminatedUnion("kind", [
  z4.object({ ...base, kind: z4.literal("multiple_choice"), options: z4.array(QuizChoiceSchema).min(2).max(6), correct: z4.array(Id).length(1) }),
  z4.object({ ...base, kind: z4.literal("multi_select"), options: z4.array(QuizChoiceSchema).min(2).max(8), correct: z4.array(Id).min(1).max(8) }),
  z4.object({ ...base, kind: z4.literal("true_false"), answer: z4.boolean() }),
  z4.object({
    ...base,
    kind: z4.literal("short_answer"),
    accepted: z4.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z4.boolean().optional()
  }),
  z4.object({ ...base, kind: z4.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z4.boolean().optional() }),
  z4.object({ ...base, kind: z4.literal("odd_one_out"), options: z4.array(QuizChoiceSchema).min(3).max(6), correct: z4.array(Id).length(1) }),
  z4.object({ ...base, kind: z4.literal("matching"), pairs: z4.array(QuizPairSchema).min(2).max(8) }),
  z4.object({ ...base, kind: z4.literal("ordering"), items: z4.array(QuizChoiceSchema).min(3).max(8) }),
  z4.object({
    ...base,
    kind: z4.literal("categorise"),
    groups: z4.array(QuizGroupSchema).min(2).max(4),
    items: z4.array(QuizSortItemSchema).min(2).max(16)
  }),
  z4.object({
    ...base,
    kind: z4.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z4.array(QuizChoiceSchema.extend({ technique_id: z4.string().max(64).optional() })).min(2).max(6),
    correct: z4.array(Id).length(1)
  }),
  z4.object({
    ...base,
    kind: z4.literal("find_it"),
    segments: z4.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z4.array(Id).min(1).max(40)
  }),
  z4.object({ ...base, kind: z4.literal("label_image"), image: QuizImageSchema, pins: z4.array(QuizPinSchema).min(2).max(8) }),
  z4.object({
    ...base,
    kind: z4.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z4.object({
    ...base,
    kind: z4.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z4.custom(
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
var QuizFeedbackSchema = z4.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z4.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z4.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z4.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z4.boolean().optional(),
  shuffle_questions: z4.boolean().optional(),
  shuffle_options: z4.boolean().optional(),
  attempts: z4.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z4.number().min(0).max(1).optional(),
  confidence: z4.boolean().optional(),
  closes_at: z4.string().datetime().optional()
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
    pins: "Add at least two pins, each with a label.",
    image: "Choose an image.",
    marks: `Marks must be between 1 and ${QUIZ_LIMITS.marksMax}.`
  };
  return { ok: false, message: messages[field] ?? "Check the question: something is missing or too long." };
}

// apps/teaching/src/schemas/toolkit.ts
import { z as z5 } from "zod";
var TkStepSchema = z5.object({
  id: z5.string().min(1),
  title: z5.string(),
  prompt: z5.string()
});
var TkRevealSchema = z5.object({
  id: z5.string().min(1),
  label: z5.string(),
  body: z5.string()
});
var TkTeacherNoteSchema = z5.object({
  what: z5.string().default(""),
  run: z5.array(z5.string()).default([]),
  say: z5.array(z5.string()).default([]),
  watch: z5.array(z5.string()).default([]),
  extra_label: z5.string().default(""),
  extra: z5.array(z5.string()).default([]),
  time: z5.string().default(""),
  source: z5.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z5.boolean().default(false)
});
var TkJotsSchema = z5.record(z5.string()).default({});
var TkItemListSchema = z5.array(z5.string().min(1)).default([]);
var ToolkitSkillContentSchema = z5.object({
  item: z5.string().min(1),
  label: z5.string(),
  definition: z5.string(),
  definition_source: z5.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  context: z5.string().default(""),
  steps: z5.array(TkStepSchema).max(8),
  show_test: z5.boolean().default(true),
  checks: z5.array(z5.string()).max(8).default([]),
  reveals: z5.array(TkRevealSchema).max(6).default([]),
  links: z5.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z5.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z5.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z5.enum(["none", "level1", "level2", "level3", "maths", "inquiry"]);
var StressVerdictSchema = z5.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z5.object({
  kind: z5.string().default(""),
  marker: z5.string().default(""),
  a: z5.string().default(""),
  b: z5.string().default("")
});
var ToolkitToolContentSchema = z5.object({
  item: z5.string().min(1),
  label: z5.string(),
  definition: z5.string(),
  definition_source: z5.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  frame: ToolFrameSchema,
  sentence: z5.string().default(""),
  steps: z5.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z5.string().default(""),
  converters: z5.array(z5.object({ id: z5.string().min(1), closed: z5.string(), open: z5.string() })).max(10).default([]),
  statements: z5.array(
    z5.object({
      id: z5.string().min(1),
      text: z5.string(),
      verdict: StressVerdictSchema,
      reason: z5.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z5.array(TkRevealSchema).max(6).default([]),
  links: z5.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z5.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z5.object({
  item: z5.string().min(1),
  label: z5.string(),
  definition: z5.string(),
  definition_source: z5.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  claim: z5.string().default(""),
  options: z5.array(z5.object({ id: z5.string().min(1), text: z5.string() })).max(8).default([]),
  probes: z5.array(z5.object({ id: z5.string().min(1), question: z5.string(), asks: z5.string() })).max(8).default([]),
  instruction: z5.string().default(""),
  model: z5.object({ label: z5.string(), body: z5.string() }).default({ label: "", body: "" }),
  discussion: z5.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z5.object({
  id: z5.string().min(1),
  tool: z5.string().min(1),
  prompt: z5.string(),
  frame: z5.string(),
  example: z5.string()
});
var ThinkingMoveContentSchema = z5.object({
  skill: z5.string().min(1),
  tools: z5.array(z5.string().min(1)).min(1).max(5),
  value: z5.string().min(1),
  community: z5.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  stimulus: z5.string().default(""),
  steps: z5.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z5.array(z5.string()).max(8).default([]),
  why: z5.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z5.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z5.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z5.object({
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  stimulus: z5.string().default(""),
  procedure: z5.enum(["sort", "create"]).default("sort"),
  questions: z5.array(z5.object({ id: z5.string().min(1), text: z5.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z5.array(z5.object({ id: z5.string().min(1), closed: z5.string(), open: z5.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z5.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z5.object({
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  concepts: z5.array(
    z5.object({
      id: z5.string().min(1),
      label: z5.string(),
      central: z5.boolean(),
      contestable: z5.boolean(),
      common: z5.boolean()
    })
  ).max(8).default([]),
  analogy: z5.object({ stem: z5.string(), example: z5.string() }).default({ stem: "", example: "" }),
  game: z5.object({
    kind: ConceptGameKindSchema,
    left: z5.string(),
    middle: z5.string(),
    right: z5.string(),
    cards: z5.array(z5.object({ id: z5.string().min(1), text: z5.string(), prompt: z5.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z5.array(z5.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z5.object({
  content: z5.string().default(""),
  skills: z5.array(z5.string().min(1)).max(2).default([]),
  tools: z5.array(z5.string().min(1)).max(6).default([]),
  values: z5.array(z5.string().min(1)).max(4).default([]),
  community: z5.array(z5.string().min(1)).max(2).default([]),
  success: z5.array(z5.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z5.object({
  variant: z5.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  concept: z5.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z5.object({
  task: z5.string().default(""),
  steps: z5.array(TkStepSchema).max(6).default([]),
  example: z5.string().default("")
});
var FluidAnalogyContentSchema = z5.object({
  kind: z5.string().min(1),
  label: z5.string(),
  definition: z5.string(),
  /** The text, character or idea students work with. */
  focus: z5.string().default(""),
  /** The level students start at. */
  level: z5.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z5.boolean().default(true),
  tiers: z5.array(AnalogyTierSchema).length(3),
  show_check: z5.boolean().default(true),
  checks: z5.array(z5.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z5.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z5.object({
  key: z5.string().min(1),
  label: z5.string().default(""),
  frame: z5.string().default(""),
  example: z5.string().default("")
});
var AnalogyStageSchema = z5.object({
  task: z5.string().default(""),
  slots: z5.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z5.object({
  label: z5.string(),
  definition: z5.string(),
  /** The text, character or idea students work with. */
  focus: z5.string().default(""),
  /** The level students start at. */
  level: z5.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z5.boolean().default(true),
  levels: z5.array(AnalogyStageSchema).length(3),
  show_check: z5.boolean().default(true),
  checks: z5.array(z5.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z5.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z5.object({
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  focus: z5.string().default(""),
  /** Types marked "This lesson". */
  types: z5.array(z5.string().min(1)).max(7).default([]),
  show_contrast: z5.boolean().default(true),
  weak: z5.string().default(""),
  strong: z5.string().default(""),
  why: z5.string().default(""),
  process: z5.array(z5.string()).max(8).default([]),
  show_check: z5.boolean().default(true),
  checks: z5.array(z5.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z5.object({
  title: z5.string().default("Teacher note"),
  html: z5.string().default("")
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
var VisibilitySchema = z6.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z6.enum([
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
  "quiz_question",
  "question_set",
  "flashcards",
  "cloze",
  "self_check",
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
var ColumnPresetSchema = z6.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z6.enum(["small", "medium", "large"]);
var VideoProviderSchema = z6.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z6.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z6.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z6.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z6.enum([
  "information",
  "important",
  "warning",
  "extension",
  "scaffold",
  "example",
  "remember",
  "teacher"
]);
var QuestionKindSchema = z6.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z6.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z6.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  layout: z6.record(z6.unknown()).default({}),
  print: z6.record(z6.unknown()).default({}),
  settings: z6.record(z6.unknown()).default({})
};
var RichTextBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("rich_text"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({ html: z6.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HeadingBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z6.object({ text: z6.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("callout"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    style: CalloutStyleSchema,
    title: z6.string().optional(),
    body: z6.string(),
    related_to: z6.object({
      block_id: z6.string().min(1),
      question_id: z6.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    url: z6.string(),
    alt_text: z6.string(),
    caption: z6.string().optional(),
    annotations: z6.array(
      z6.object({
        id: z6.string().min(1),
        body: z6.string().min(1),
        selector: z6.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z6.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z6.object({
  id: z6.string().min(1),
  url: z6.string(),
  alt_text: z6.string(),
  caption: z6.string().optional()
});
var GalleryBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    layout: GalleryLayoutSchema,
    items: z6.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z6.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    provider: VideoProviderSchema,
    external_id: z6.string(),
    url: z6.string().optional(),
    start_seconds: z6.number().int().positive().optional(),
    title: z6.string().optional(),
    caption: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("embed"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    url: z6.string(),
    title: z6.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("html"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({ html: z6.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z6.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z6.object({
  enabled: z6.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z6.string().min(1),
  system: z6.string(),
  max_tokens: z6.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("html_app"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    html: z6.string(),
    height_px: z6.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("quote"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    quote: z6.string(),
    attribution: z6.string().optional(),
    source: z6.string().optional(),
    reference: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimerSegmentSchema = z6.object({
  label: z6.string().max(60),
  minutes: z6.number().min(0.25).max(180)
});
var ClassroomToolIdSchema = z6.enum([
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
var DividerBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("divider"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    /** The faint gear at the end of the rule that slides out the classroom tools. */
    tools: z6.boolean().default(true),
    /** Timers saved with the lesson, ready when it opens. */
    timer_stack: z6.array(TimerSegmentSchema).max(8).default([])
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var ClassroomToolsBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("classroom_tools"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    timer_stack: z6.array(TimerSegmentSchema).max(8).default([]),
    /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
    start_tool: ClassroomToolIdSchema.optional()
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var CountdownBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("countdown"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().max(200).default(""),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z6.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z6.string().regex(/^(\d{2}:\d{2})?$/).default(""),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z6.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    note: z6.string().max(400).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("definition"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    term: z6.string(),
    definition: z6.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("code"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    code: z6.string(),
    language: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("audio"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    url: z6.string(),
    title: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("attachment"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    url: z6.string(),
    title: z6.string(),
    filename: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z6.object({
  title: z6.string(),
  body: z6.string()
});
var AccordionBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("accordion"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    items: z6.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("table"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    headers: z6.array(z6.string()),
    rows: z6.array(z6.array(z6.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z6.object({
  id: z6.string().min(1),
  prompt: z6.string(),
  kind: QuestionKindSchema,
  options: z6.array(z6.string()).optional(),
  response_space: ResponseSpaceSchema.optional()
});
var PeerFeedbackBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("peer_feedback"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    prompt: z6.string().max(4e3),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z6.enum(["comments", "annotate"]).default("comments"),
    strength_prompt: z6.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z6.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionDropBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("question_drop"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    target_quiz_id: z6.string().max(64).default(""),
    prompt: z6.string().max(500).default(""),
    kinds: z6.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z6.number().int().min(1).max(20).default(1),
    marks_max: z6.number().int().min(1).max(20).default(3),
    per_student: z6.number().int().min(1).max(5).default(1),
    accepting: z6.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("quiz_question"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z6.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("question_set"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    questions: z6.array(QuestionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z6.object({
  block_id: z6.string().min(1),
  annotation_id: z6.string().min(1),
  lesson_id: z6.string().optional(),
  kind: z6.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z6.string().min(1)
});
var FlashcardItemSchema = z6.object({
  id: z6.string().min(1),
  front: z6.string(),
  back: z6.string(),
  image_url: z6.string().optional(),
  image_alt: z6.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("flashcards"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    cards: z6.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z6.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("cloze"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    text: z6.string(),
    case_sensitive: z6.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z6.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z6.object({
  id: z6.string().min(1),
  label: z6.string()
});
var SelfCheckBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("self_check"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z6.string(),
    answer: z6.string().optional(),
    items: z6.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z6.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z6.object({
  x: z6.union([z6.string(), z6.number()]),
  y: z6.number()
});
var ChartSeriesColorSchema = z6.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z6.object({
  id: z6.string().min(1),
  name: z6.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z6.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("chart"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    chart_type: ChartTypeSchema,
    title: z6.string().optional(),
    x_label: z6.string().optional(),
    y_label: z6.string().optional(),
    series: z6.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("equation"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    latex: z6.string(),
    caption: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z6.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("diagram"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    source: DiagramSourceSchema,
    image_url: z6.string().optional(),
    image_alt: z6.string().optional(),
    svg_markup: z6.string().optional(),
    caption: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z6.object({
  id: z6.string().min(1),
  label: z6.string(),
  parent_id: z6.string().nullable().optional(),
  color: z6.string().optional(),
  x: z6.number().optional(),
  y: z6.number().optional()
});
var GraphBuildModeSchema = z6.enum(["outline", "canvas"]);
var GraphEdgeSchema = z6.object({
  id: z6.string().min(1),
  from: z6.string().min(1),
  to: z6.string().min(1),
  label: z6.string().optional()
});
var MindMapBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("mind_map"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    nodes: z6.array(GraphNodeSchema).min(1).max(24),
    edges: z6.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("concept_map"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    nodes: z6.array(GraphNodeSchema).min(1).max(24),
    edges: z6.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("whiteboard"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    document_id: z6.string().min(1),
    seed_document_id: z6.string().min(1).optional(),
    title: z6.string().optional(),
    height_px: z6.number().int().min(360).max(1400).default(640),
    published_snapshot: z6.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z6.object({
  id: z6.string().min(1),
  when: z6.string(),
  label: z6.string(),
  description: z6.string(),
  image_url: z6.string().optional(),
  image_alt: z6.string().optional(),
  link_url: z6.string().optional(),
  link_label: z6.string().optional()
});
var TimelineLayoutSchema = z6.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("timeline"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    layout: TimelineLayoutSchema.optional(),
    events: z6.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z6.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z6.object({
  id: z6.string().min(1),
  number: z6.string().optional(),
  eyebrow: z6.string(),
  title: z6.string(),
  description: z6.string(),
  image_url: z6.string().optional(),
  image_alt: z6.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("card_stack"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    cards: z6.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z6.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("collection"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    source: CollectionSourceSchema,
    title: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z6.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("anthology"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var OutcomesBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("outcomes"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z6.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z6.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z6.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z6.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z6.enum(["left", "center", "right"]);
var AnnotationLineSchema = z6.object({
  id: z6.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z6.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z6.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z6.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z6.object({
  id: z6.string().min(1),
  lines: z6.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z6.object({
  kind: z6.enum(["verse", "prose"]),
  stanzas: z6.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z6.object({
  id: z6.string().min(1),
  name: z6.string().min(1),
  subgroup: z6.string().optional()
});
var AnnotationLayerSchema = z6.object({
  id: z6.string().min(1),
  name: z6.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z6.string().optional(),
  sublayers: z6.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z6.object({
  exact: z6.string().min(1),
  prefix: z6.string().optional(),
  suffix: z6.string().optional()
});
var AnnotationAnchorSchema = z6.object({
  /** Required on every stop when the annotation is a thread. */
  id: z6.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z6.string().min(1),
  line: z6.string().optional(),
  start: z6.number().int().min(0).optional(),
  end: z6.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z6.string().optional()
});
var AnnotationTechniqueRefSchema = z6.object({
  id: z6.string().min(1),
  table_version: z6.string().min(1)
});
var AnnotationAttachmentSchema = z6.discriminatedUnion("kind", [
  z6.object({
    kind: z6.literal("link"),
    url: z6.string(),
    label: z6.string().optional()
  }),
  z6.object({
    kind: z6.literal("video"),
    url: z6.string(),
    start_seconds: z6.number().int().min(0).optional()
  }),
  z6.object({
    kind: z6.literal("audio"),
    url: z6.string(),
    title: z6.string().optional()
  }),
  z6.object({
    kind: z6.literal("image"),
    url: z6.string(),
    alt_text: z6.string()
  }),
  z6.object({
    kind: z6.literal("block"),
    block_id: z6.string().min(1)
  })
]);
var AnthologyTagSchema = z6.object({
  include: z6.boolean(),
  themes: z6.array(z6.string().trim().max(40)).max(8).default([]),
  concepts: z6.array(z6.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z6.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z6.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z6.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z6.enum(["text", "custom"]).default("text"),
  anchor_order: z6.array(z6.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z6.object({
  w: z6.string(),
  start: z6.number(),
  end: z6.number()
});
var AnnotationVoiceClipSchema = z6.object({
  id: z6.string().min(1),
  start_s: z6.number(),
  end_s: z6.number(),
  word_range: z6.tuple([z6.number().int().min(0), z6.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z6.enum(["tap", "quote", "ai", "manual"]),
  confidence: z6.number().min(0).max(1),
  approved: z6.boolean(),
  transcript_text: z6.string()
});
var AnnotationVoiceTrackSchema = z6.object({
  id: z6.string().min(1),
  layer_id: z6.string().min(1),
  kind: z6.enum(["reading", "think_aloud", "feedback"]),
  title: z6.string().min(1),
  audio: z6.object({
    media_id: z6.string().optional(),
    url: z6.string().min(1),
    duration_s: z6.number().min(0),
    mime: z6.string().min(1)
  }),
  transcript: z6.object({
    words: z6.array(AnnotationVoiceWordSchema),
    timing: z6.enum(["word", "segment", "estimated"])
  }),
  taps: z6.array(
    z6.object({
      t: z6.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z6.array(AnnotationVoiceClipSchema).default([]),
  status: z6.enum(["draft", "published"]),
  extras: z6.array(
    z6.object({
      id: z6.string().min(1),
      kind: z6.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z6.string(),
      approved: z6.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z6.object({
  id: z6.string().min(1),
  layer_id: z6.string().min(1),
  sublayer_id: z6.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z6.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  body: z6.object({
    html: z6.string(),
    attachments: z6.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
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
      code: z6.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
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
      code: z6.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z6.object({
  show_markers: z6.boolean().default(true),
  default_layer_id: z6.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z6.union([z6.literal(0), z6.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z6.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("annotation"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    attribution: z6.string().optional(),
    text: AnnotationTextSchema,
    layers: z6.array(AnnotationLayerSchema).default([]),
    annotations: z6.array(AnnotationItemSchema).default([]),
    voice_tracks: z6.array(AnnotationVoiceTrackSchema).optional(),
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
        code: z6.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z6.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z6.object({
    id: z6.string().min(1),
    type: z6.literal("block"),
    block_type: z6.literal(blockType),
    variant: z6.string().default("medium"),
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
var TeacherNoteBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("teacher_note"),
  variant: z6.string().default("medium"),
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
  QuizQuestionBlockSchema,
  QuestionSetBlockSchema,
  FlashcardsBlockSchema,
  ClozeBlockSchema,
  SelfCheckBlockSchema,
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
var SpacerBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("spacer"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z6.lazy(
  () => z6.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z6.array(
  z6.object({
    width: z6.number().int().min(1).max(12),
    blocks: z6.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("columns"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z6.lazy(
  () => z6.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("tabs"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    tabs: z6.array(
      z6.object({
        id: z6.string().min(1),
        label: z6.string(),
        blocks: z6.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z6.lazy(
  () => z6.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SectionLinkSchema = z6.object({
  mode: z6.literal("linked"),
  source_composition_id: z6.string().min(1)
});
var SectionBlockObjectSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("section"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string(),
    collapsed_in_editor: z6.boolean().optional(),
    blocks: z6.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z6.lazy(
  () => z6.discriminatedUnion("block_type", [
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

// apps/teaching/src/schemas/cover.ts
import { z as z7 } from "zod";
var CoverSchema = z7.object({
  url: z7.string().min(1).optional(),
  media_id: z7.string().min(1).optional(),
  alt_text: z7.string().optional()
}).superRefine((cover, ctx) => {
  if (!cover.url && !cover.media_id) {
    ctx.addIssue({
      code: z7.ZodIssueCode.custom,
      message: "Cover needs a url and/or media_id"
    });
  }
  if (cover.url !== void 0 && !isHttpUrl(cover.url)) {
    ctx.addIssue({
      code: z7.ZodIssueCode.custom,
      path: ["url"],
      message: "Cover url must be http(s)"
    });
  }
});
var CoverPatchSchema = CoverSchema.nullable();

// apps/teaching/src/schemas/source.ts
import { z as z8 } from "zod";
var SourceSchema = z8.object({
  system: z8.literal("notion"),
  page_id: z8.string().min(1).max(64),
  imported_at: IsoDateSchema,
  last_edited_at: IsoDateSchema
});

// apps/teaching/src/blocks/learning-activity.ts
var CLOZE_MARKER = /\[\[([^\]]+)\]\]/g;
function parseClozeText(text) {
  const segments = [];
  const blanks = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(CLOZE_MARKER.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const inner = match[1];
    const pipeIndex = inner.indexOf("|");
    const blank = pipeIndex === -1 ? { answer: inner } : { answer: inner.slice(0, pipeIndex), hint: inner.slice(pipeIndex + 1) };
    const index = blanks.length;
    blanks.push(blank);
    segments.push({ type: "blank", blank, index });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  } else if (segments.length === 0) {
    segments.push({ type: "text", value: text });
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

// apps/teaching/src/schemas/publish-block-issues.ts
var KIND_LABEL = {
  rich_text: "Text",
  html: "HTML",
  html_app: "HTML app",
  question_set: "Question set",
  question_drop: "Question drop",
  quiz_question: "Quiz question",
  self_check: "Self check",
  mind_map: "Mind map",
  concept_map: "Concept map"
};
var CAPTION_MAX = 48;
function formatPublishBlockIssue(issue) {
  return `${issue.label}: ${issue.message}`;
}
function listPublishBlockIssues(blocks) {
  const typeOrder = collectTypeOrder(blocks);
  const issues = [];
  walk(blocks, [], typeOrder, issues);
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
function walk(blocks, ancestors, typeOrder, issues) {
  for (const block of blocks) {
    const label = locateBlock(block, ancestors, typeOrder);
    const message = ownIssue(block);
    if (message) {
      issues.push({
        blockId: block.id,
        blockType: block.block_type,
        label,
        message
      });
    }
    if (block.block_type === "section") {
      walk(block.content.blocks, [...ancestors, shortLabel(block)], typeOrder, issues);
    } else if (block.block_type === "columns") {
      block.content.columns.forEach((column, index) => {
        walk(
          column.blocks,
          [...ancestors, `Column ${index + 1}`],
          typeOrder,
          issues
        );
      });
    } else if (block.block_type === "tabs") {
      block.content.tabs.forEach((tab, index) => {
        const tabLabel = tab.label.trim() ? `Tab \u201C${truncate(tab.label.trim())}\u201D` : `Tab ${index + 1}`;
        walk(tab.blocks, [...ancestors, tabLabel], typeOrder, issues);
      });
    }
  }
}
function locateBlock(block, ancestors, typeOrder) {
  const ids = typeOrder.get(block.block_type) ?? [block.id];
  const index = ids.indexOf(block.id);
  const ordinal = { index: index >= 0 ? index + 1 : 1, total: ids.length };
  const self = shortLabel(block, ordinal);
  return ancestors.length > 0 ? `${ancestors.join(" \u2192 ")} \u2192 ${self}` : self;
}
function kindLabel(type) {
  const mapped = KIND_LABEL[type];
  if (mapped) return mapped;
  return type.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
function shortLabel(block, ordinal) {
  const kind = kindLabel(block.block_type);
  const numbered = ordinal && ordinal.total > 1 ? `${kind} ${ordinal.index}` : kind;
  const caption = blockCaption(block);
  return caption ? `${numbered} \u201C${caption}\u201D` : numbered;
}
function truncate(text) {
  if (text.length <= CAPTION_MAX) return text;
  return `${text.slice(0, CAPTION_MAX - 1).trimEnd()}\u2026`;
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
function ownIssue(block) {
  if (block.block_type === "collection") {
    return "Collection blocks can only be used on class homepages";
  }
  if (block.block_type === "question_drop" && !block.content.target_quiz_id) {
    return "Choose the quiz this Question drop feeds into";
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
    if (!isHttpUrl(block.content.url)) {
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
var LessonSchema = z9.object({
  ...CommonFields,
  ...TrashFields,
  type: z9.literal("lesson"),
  unit_id: z9.string().min(1),
  sequence: z9.number().int(),
  blocks: z9.array(BlockSchema),
  published_at: IsoDateSchema.optional(),
  cover: CoverSchema.optional(),
  tags: z9.array(z9.string().min(1).max(40)).max(24).optional(),
  author_id: z9.string().min(1).optional(),
  review_status: z9.enum(["needs_review", "none"]).optional(),
  syllabus_outcomes: z9.array(z9.string().min(1).max(32)).max(24).optional(),
  outcome_ids: z9.array(z9.string().min(1).max(64)).max(24).optional(),
  /** Teacher planning metadata; optional for blob/version compatibility. */
  pedagogical_mode: PedagogicalModeSchema.optional(),
  /** Hides the student feedback dot on every block of this lesson. */
  feedback_off: z9.boolean().optional(),
  /** Quiz lessons only: timer, attempts, feedback and other quiz settings. */
  quiz: QuizSettingsSchema.optional(),
  source: SourceSchema.optional()
});
var PublishableLessonSchema = LessonSchema.superRefine((lesson, ctx) => {
  if (lesson.title.trim().length === 0) {
    ctx.addIssue({
      code: z9.ZodIssueCode.custom,
      message: "Title is required to publish",
      path: ["title"]
    });
  }
  if (lesson.pedagogical_mode !== "quiz") {
    let stray = false;
    visitBlocks(lesson.blocks, (block) => {
      if (block.block_type === "quiz_question") stray = true;
    });
    if (stray) {
      ctx.addIssue({
        code: z9.ZodIssueCode.custom,
        message: "Quiz questions only work in a lesson set to Quiz. Change the lesson type or remove them.",
        path: ["blocks"]
      });
    }
  }
  for (const issue of listPublishBlockIssues(lesson.blocks)) {
    ctx.addIssue({
      code: z9.ZodIssueCode.custom,
      message: formatPublishBlockIssue(issue),
      path: ["blocks"]
    });
  }
});

// apps/teaching/src/schemas/unit.ts
import { z as z10 } from "zod";
var UnitSchema = z10.object({
  ...CommonFields,
  ...TrashFields,
  type: z10.literal("unit"),
  year_id: z10.string().min(1),
  subject_id: z10.string().min(1),
  lesson_ids: z10.array(z10.string().min(1)),
  primary_term: z10.number().int().positive().optional(),
  start_date: z10.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z10.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z10.string().optional(),
  cover: CoverSchema.optional(),
  blocks: z10.array(BlockSchema).optional(),
  outcome_ids: z10.array(z10.string().min(1)).max(24).optional(),
  /** 'program': same level as a unit, never one of a class's active units. */
  kind: z10.enum(["program"]).optional(),
  source: SourceSchema.optional()
});

// apps/teaching/src/schemas/class.ts
import { z as z11 } from "zod";

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
var ClassTimetableSchema = z11.unknown().transform((value, ctx) => {
  try {
    return validateTimetable(value);
  } catch (error) {
    ctx.addIssue({ code: z11.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Invalid timetable" });
    return z11.NEVER;
  }
});
var ClassHomepageSchema = z11.object({
  announcements: z11.array(BlockSchema),
  resources: z11.array(BlockSchema),
  custom: z11.array(BlockSchema)
});
var ClassStudentSchema = z11.object({
  name: z11.string().min(1).max(80),
  skip_picker: z11.boolean().default(false)
});
var MAX_CLASS_STUDENTS = 60;
var ClassSchema = z11.object({
  ...CommonFields,
  ...TrashFields,
  type: z11.literal("class"),
  code: z11.string().min(1),
  display_name: z11.string().min(1).optional(),
  academic_year: z11.number().int(),
  year_id: z11.string().min(1),
  subject_id: z11.string().min(1),
  active_unit_ids: z11.array(z11.string().min(1)),
  current_unit_id: z11.string().min(1).optional(),
  current_scheduled_lesson_id: z11.string().min(1).optional(),
  meeting_days: z11.array(z11.number().int().min(1).max(7)).optional(),
  timetable: ClassTimetableSchema.optional(),
  homepage: ClassHomepageSchema.optional(),
  cover: CoverSchema.optional(),
  students: z11.array(ClassStudentSchema).max(MAX_CLASS_STUDENTS).optional(),
  source: SourceSchema.optional()
});

// apps/teaching/src/schemas/subject.ts
import { z as z12 } from "zod";
var SubjectSchema = z12.object({
  ...CommonFields,
  type: z12.literal("subject"),
  display_title: z12.string().min(1),
  scope_id: z12.string().min(1).optional(),
  unit_ids: z12.array(z12.string().min(1)),
  outcome_ids: z12.array(z12.string().min(1)),
  class_ids: z12.array(z12.string().min(1))
});

// apps/teaching/src/schemas/document.ts
import { z as z13 } from "zod";
var DocumentKindSchema = z13.enum(["syllabus"]);
var DocumentSchema = z13.object({
  ...CommonFields,
  ...TrashFields,
  type: z13.literal("document"),
  kind: DocumentKindSchema,
  subject_id: z13.string().min(1),
  blocks: z13.array(BlockSchema),
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
