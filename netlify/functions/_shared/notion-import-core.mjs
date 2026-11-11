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
function safeDecode(text2) {
  try {
    return decodeURIComponent(text2);
  } catch {
    return text2;
  }
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
    const segment = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1];
    const place = segment ? safeDecode(segment.replace(/\+/g, " ")) : url.searchParams.get("q")?.trim();
    if (place) {
      return {
        provider: "google_maps",
        embed_url: `https://maps.google.com/maps?q=${encodeURIComponent(place)}&output=embed`
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
function mediaUrl(st, ref, node, url, hosted, name2, purpose) {
  if (!hosted) return url;
  st.media.push({ ref, page_id: st.page_id, notion_block_id: node?.id ?? null, url, name: name2, purpose });
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
  const name2 = fileName(n.data, f.url);
  return { url: mediaUrl(st, n.id, n, f.url, f.hosted, name2, purpose), name: name2, hosted: f.hosted };
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
      const name2 = raw ? fileName(d, raw.url) : "";
      const isHtml = /\.html?$/i.test(name2);
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
import { z as z19 } from "zod";

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
import { z as z13 } from "zod";

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

// apps/teaching/src/schemas/faded.ts
import { z as z4 } from "zod";
var FadedStepSchema = z4.object({
  /** Absent only on content converted from the old shape: the key is then the block id. */
  id: z4.string().min(1).optional(),
  /** Only when this step needs different wording from the block's question. */
  prompt: z4.string().max(300).optional(),
  extract: z4.string().max(2e3),
  answers: z4.array(z4.string().max(600)).min(1).max(4),
  blanks: z4.array(z4.number().int().min(0).max(3)).max(4),
  /** Worked steps: one question about why the example works. */
  question: z4.object({
    prompt: z4.string().max(300),
    choices: z4.array(z4.string().max(200)).min(2).max(4),
    correct: z4.number().int().min(0).max(3)
  }).optional()
});
var FadedShape = z4.object({
  prompt: z4.string().max(300),
  part_labels: z4.array(z4.string().min(1).max(40)).min(1).max(4),
  steps: z4.array(FadedStepSchema).min(1).max(6),
  /** What a strong answer does, by part label. */
  criteria: z4.record(z4.string(), z4.array(z4.string().max(160)).max(4)),
  /** A block with a writing step is a gate unless switched off. */
  gate: z4.boolean().optional()
});
var GENERIC_CRITERIA = ["Answers the question", "Uses words from the extract", "Says what those words show"];
function upgradeFaded(raw) {
  const c = raw ?? {};
  if (Array.isArray(c.steps)) return raw;
  const parts = Array.isArray(c.parts) ? c.parts : [];
  const blanks = Array.isArray(c.blanks) ? c.blanks : [];
  const labels = parts.map((p) => p.label);
  return {
    prompt: typeof c.prompt === "string" ? c.prompt : "",
    part_labels: labels,
    steps: parts.length ? [{ extract: typeof c.extract === "string" ? c.extract : "", answers: parts.map((p) => p.answer), blanks }] : [],
    criteria: Object.fromEntries(blanks.filter((i) => i < labels.length).map((i) => [labels[i], GENERIC_CRITERIA])),
    ...typeof c.gate === "boolean" ? { gate: c.gate } : {}
  };
}
var FadedContentSchema = z4.preprocess(
  upgradeFaded,
  FadedShape.superRefine((c, ctx) => {
    c.steps.forEach((step, s) => {
      const issue = (message, key) => ctx.addIssue({ code: "custom", message, path: ["steps", s, key] });
      if (step.answers.length !== c.part_labels.length) issue("Each step needs one answer per part.", "answers");
      if (new Set(step.blanks).size !== step.blanks.length || step.blanks.some((i) => i >= c.part_labels.length)) {
        issue("Each blank must name a different part of the example.", "blanks");
      }
      if (step.question && step.question.correct >= step.question.choices.length) issue("The correct choice must be one of the choices.", "question");
    });
  })
);
function fadedContent(block) {
  const c = upgradeFaded(block.content);
  return { prompt: c.prompt ?? "", part_labels: c.part_labels ?? [], steps: c.steps ?? [], criteria: c.criteria ?? {}, ...c.gate === void 0 ? {} : { gate: c.gate } };
}
var fadedWritingSteps = (c) => c.steps.filter((s) => s.blanks.length > 0);

// apps/teaching/src/schemas/kaplan.ts
import { z as z5 } from "zod";
var KaplanLensSchema = z5.enum(["patterns", "multiple_perspectives", "ethics"]);
var ThreePromptsSchema = z5.tuple([
  z5.string().max(1200),
  z5.string().max(1200),
  z5.string().max(1200)
]);
var KaplanQualifierSchema = z5.object({
  lens: KaplanLensSchema,
  focus: z5.string().trim().max(200).default(""),
  mode: z5.enum(["notes", "discussion"]).default("notes"),
  prompts: ThreePromptsSchema.optional(),
  supports: z5.tuple([
    z5.string().max(1200).nullable(),
    z5.string().max(1200).nullable(),
    z5.string().max(1200).nullable()
  ]).optional()
});
var KaplanQualifiersSchema = z5.array(KaplanQualifierSchema).max(3).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.lens)).size !== items.length) {
    ctx.addIssue({ code: z5.ZodIssueCode.custom, message: "Use each Kaplan lens once per block." });
  }
});

// apps/teaching/src/schemas/discern.ts
import { z as z6 } from "zod";
var DiscernModeSchema = z6.enum(["own", "theirs"]);
var DiscernInitialTypeSchema = z6.enum(["scale", "choose", "write"]);
var DiscernScalePresetSchema = z6.enum(["agree", "extent", "effect", "verdict"]);
var DiscernQualifierSchema = z6.object({
  /** own: the student's answer. theirs: a character's or historical figure's choice. */
  mode: DiscernModeSchema.default("own"),
  who: z6.string().trim().max(80).default(""),
  /** What is being judged. Fills every default prompt. */
  focus: z6.string().trim().max(200).default(""),
  /** Optional evidence source, e.g. "the poems" or "Source B". */
  source: z6.string().trim().max(120).default(""),
  initial: z6.object({
    type: DiscernInitialTypeSchema.default("scale"),
    preset: DiscernScalePresetSchema.default("agree"),
    /** Scale points or choices. Empty scale points fall back to the preset. */
    options: z6.array(z6.string().trim().max(60)).max(5).default([])
  }).prefault({}),
  /** Teacher overrides for the five step prompts; an empty string keeps the default. */
  prompts: z6.array(z6.string().max(1200)).length(5).optional(),
  /** "Their choice" only: students also plot how settled the character is across key moments. */
  character_tail: z6.object({
    enabled: z6.boolean().default(false),
    moments: z6.array(z6.string().trim().max(80)).max(6).default([])
  }).optional()
});

// apps/teaching/src/schemas/lens.ts
import { z as z7 } from "zod";
var LensAttachmentSchema = z7.object({
  id: z7.string().min(1).max(60),
  config: z7.record(z7.string(), z7.unknown())
});
var LensAttachmentsSchema = z7.array(LensAttachmentSchema).max(6).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    ctx.addIssue({ code: z7.ZodIssueCode.custom, message: "Use each lens once per block." });
  }
});
var LensLevelSchema = z7.enum(["support", "core", "extend"]);
var StepTextSchema = z7.string().max(1200);
var WindowsMirrorsConfigSchema = z7.object({
  focus: z7.string().trim().max(200).default(""),
  answer_with: z7.enum(["window", "mirror", "both", "choice"]).default("both"),
  level: LensLevelSchema.default("core"),
  student_level: z7.boolean().default(true),
  mode: z7.enum(["notes", "discussion"]).default("notes"),
  /** Teacher overrides keyed `${level}.${stepId}`; empty keeps the default. */
  prompts: z7.record(z7.string(), StepTextSchema).optional(),
  supports: z7.record(z7.string(), StepTextSchema.nullable()).optional(),
  examples: z7.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});
var SteppedLensConfigSchema = WindowsMirrorsConfigSchema.omit({ answer_with: true });
var LogicSchema = z7.enum(["deductive", "inductive", "abductive", "all_three", "choice"]);
var ReasoningConfigSchema = z7.object({
  focus: z7.string().trim().max(200).default(""),
  logic: LogicSchema.default("choice"),
  level: LensLevelSchema.default("core"),
  student_level: z7.boolean().default(true),
  mode: z7.enum(["notes", "discussion"]).default("notes"),
  prompts: z7.record(z7.string(), StepTextSchema).optional(),
  supports: z7.record(z7.string(), StepTextSchema.nullable()).optional(),
  examples: z7.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});
var SleeveLevelSchema = z7.enum(["support", "extend"]);
var SleeveConfigSchema = z7.object({
  level: SleeveLevelSchema.default("support"),
  student_level: z7.boolean().default(true),
  do: z7.string().max(600).optional(),
  checks: z7.array(z7.string().max(300)).max(3).optional()
});

// apps/teaching/src/tutorial/schema.ts
import { z as z8 } from "zod";
var GAP_TYPES = ["knowledge", "mix_up"];
var TutorialGroupIdSchema = z8.string().regex(/^[a-z0-9_-]{1,40}$/);
var TutorialGroupSchema = z8.object({
  id: TutorialGroupIdSchema,
  /** Teacher-facing: "Re-tells the plot". Students never see it. */
  name: z8.string().min(1).max(80),
  /** Teacher-facing: why this group gets it wrong. */
  why: z8.string().max(300),
  /** Student-facing goal, written as what they will do: "Today: explaining the effect". */
  goal: z8.string().max(140),
  gap_type: z8.enum(GAP_TYPES),
  students: z8.array(z8.string().min(1).max(64)).max(40),
  /** Ann's evidence for placing each student, from their recorded mistakes. */
  evidence: z8.array(z8.object({ student: z8.string().min(1).max(64), quote: z8.string().max(300) })).max(80).default([]),
  /** Teacher-facing: what to build for this group. Shown as a teacher note at the top of its tab. */
  notes: z8.string().max(1200).optional(),
  /** Students the teacher marked unsure; the exit check confirms the placement. */
  unsure: z8.array(z8.string().min(1).max(64)).max(40).optional()
});
var TutorialSettingsSchema = z8.object({
  class_id: z8.string().min(1).max(64),
  /** The evidence tag the tutorial works on, e.g. "tech:cyclical_structure". */
  tag: z8.string().max(80).optional(),
  /** The quiz whose evidence flagged these students. */
  source_lesson_id: z8.string().max(64).optional(),
  groups: z8.array(TutorialGroupSchema).max(8)
});

// apps/teaching/src/sprint/schema.ts
import { z as z9 } from "zod";
var SPRINT_PHASES = ["understand", "sketch", "decide", "prototype", "test"];
var SprintPhaseKeySchema = z9.enum(SPRINT_PHASES);
var LevelSchema = z9.union([z9.literal(1), z9.literal(2), z9.literal(3)]);
var SPRINT_LIMITS = { criteria: 5, requirements: 6, groups: 10, groupSize: 12, ideas: 5, parts: 6, files: 3, fileBytes: 5 * 1024 * 1024 };
var SprintIdSchema = z9.string().regex(/^[a-z0-9_-]{1,40}$/);
var Day = z9.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
var Time = z9.string().regex(/^(\d{2}:\d{2})?$/);
var text = (max) => z9.string().trim().max(max);
var SprintCriterionSchema = z9.object({
  id: SprintIdSchema,
  text: z9.string().trim().min(1).max(160),
  /** Markbook outcome catalogue id, from the lesson's dot points. */
  outcome: z9.string().min(1).max(64).optional()
});
var SprintRequirementSchema = z9.object({
  id: SprintIdSchema,
  text: z9.string().trim().min(1).max(160),
  phases: z9.array(SprintPhaseKeySchema).max(5).default(["sketch", "prototype"])
});
var IdeaGuideSchema = z9.object({
  checklist: z9.array(z9.string().trim().min(1).max(160)).min(1).max(8),
  model: z9.object({
    topic: text(80),
    text: text(800),
    /** "1 answers the question", one per marked part. */
    notes: z9.array(text(120)).max(6).default([])
  }),
  pair: z9.object({ developing: text(400), strong: text(400), note: text(200) }).optional()
});
var exampleLines = z9.array(text(240)).max(4).default([]);
var IdeaKindSchema = z9.object({
  /** "One idea is…": "a kind of viva question, with one sample". */
  one: text(120).default(""),
  /** The plural used in headings: "kinds of viva question". */
  many: text(60).default(""),
  /** What ideas get judged with, shown before the timer starts. */
  judge: text(240).default(""),
  examples: z9.object({
    inspiration: exampleLines,
    rapid: exampleLines,
    pick: exampleLines,
    develop: exampleLines
  }).prefault({})
});
var SprintPhaseSchema = z9.object({
  key: SprintPhaseKeySchema,
  where: z9.enum(["class", "home"]),
  due_date: Day.default(""),
  due_time: Time.default("15:00"),
  /** Class phases: when the class part ends on its own, "YYYY-MM-DDTHH:MM" Sydney time, or empty. */
  ends_at: z9.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/).default(""),
  instruction: text(600).default(""),
  /** Understand and Sketch: ideas each student writes. */
  ideas: z9.number().int().min(1).max(SPRINT_LIMITS.ideas).optional(),
  stretch: text(300).default("")
});
var SprintGroupSchema = z9.object({
  id: SprintIdSchema,
  name: z9.string().trim().min(1).max(40),
  students: z9.array(z9.string().min(1).max(64)).max(SPRINT_LIMITS.groupSize)
});
var UNDERSTAND_ALONE = ["spot", "audience", "dig", "say", "limits"];
var UNDERSTAND_GROUP = ["vote", "merge", "grid", "ask", "expert"];
var UNDERSTAND_STEPS = [...UNDERSTAND_ALONE, ...UNDERSTAND_GROUP];
var allSteps = () => Object.fromEntries(UNDERSTAND_STEPS.map((k) => [k, true]));
var UnderstandSettingsSchema = z9.object({
  layout: z9.enum(["slides", "vertical"]).default("slides"),
  steps: z9.record(z9.string(), z9.boolean()).default(allSteps).transform((v) => ({ ...allSteps(), ...Object.fromEntries(Object.entries(v).filter(([k]) => UNDERSTAND_STEPS.includes(k))) }))
});
var defaultUnderstand = () => ({ layout: "slides", steps: allSteps() });
var phasesInOrder = (phases) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);
var SprintSettingsSchema = z9.object({
  class_id: z9.string().min(1).max(64),
  /** Who settles each group's problem and idea: the students' votes (ties come to the teacher), or the teacher approves each. */
  decider: z9.enum(["top_vote", "teacher"]).default("top_vote"),
  support: z9.enum(["guided", "standard", "open"]).default("standard"),
  /** Older Kits' class lock; still loads, no longer used. The teacher picks a lock when ending a class part. */
  lock_hours: z9.number().int().min(0).max(24).default(0),
  criteria: z9.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z9.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z9.array(text(200)).max(2).default([]),
  requirements: z9.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  idea_kind: IdeaKindSchema.optional(),
  phases: z9.array(SprintPhaseSchema).length(5).refine(phasesInOrder, "Phases must be in order: Understand, Sketch, Decide, Prototype, Test."),
  groups: z9.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  understand: UnderstandSettingsSchema.prefault(defaultUnderstand),
  /** Sketch's rapid ideas: minutes on the timer, 0 for no timer. */
  sketch_timer: z9.number().int().min(0).max(30).default(8),
  /** Stand-out dots from before head-to-heads; kept so older Kits still load, no longer used. */
  decide_dots: z9.number().int().min(0).max(5).default(3),
  /** Markbook assessment columns made for this sprint's marks. */
  columns: z9.object({ prototype: z9.string().optional(), reflection: z9.string().optional() }).default({})
});
var PublicSprintSchema = z9.object({
  support: z9.enum(["guided", "standard", "open"]),
  lock_hours: z9.number().int().min(0).max(24),
  criteria: z9.array(SprintCriterionSchema.omit({ outcome: true })).max(SPRINT_LIMITS.criteria),
  reflection_criteria: z9.array(SprintCriterionSchema.omit({ outcome: true })).max(3),
  reflection_prompts: z9.array(z9.string().max(200)).max(2),
  requirements: z9.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements),
  idea_guide: IdeaGuideSchema,
  idea_kind: IdeaKindSchema.optional(),
  phases: z9.array(SprintPhaseSchema).length(5),
  understand: UnderstandSettingsSchema.prefault(defaultUnderstand),
  sketch_timer: z9.number().int().min(0).max(30).default(8),
  decide_dots: z9.number().int().min(0).max(5).default(3)
});
var where = text(200);
var Wheres = z9.record(z9.string().max(40), where).default({});
var cards = z9.array(text(120)).max(8).default([]);
var UnderstandPayloadSchema = z9.object({
  /** Earlier sprints' "How might we" notes; still read, no longer written. */
  notes: z9.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's statements) this student starred. */
  star: z9.string().max(40).default(""),
  stretch: text(300).default(""),
  /** Words from the brief that stand out. */
  spot: z9.array(text(40)).max(30).default([]),
  audience: z9.object({ who: text(200).default(""), why: text(300).default("") }).prefault({ who: "", why: "" }),
  /** The surface problem, then each "why is that a problem?". */
  dig: z9.array(text(300)).max(6).default([]),
  /** The problem in their own words. */
  say: text(400).default(""),
  limits: z9.object({ can_known: cards, cant_known: cards, can_unknown: cards, cant_unknown: cards }).prefault({ can_known: [], cant_known: [], can_unknown: [], cant_unknown: [] })
});
var SketchCardSchema = z9.object({
  id: SprintIdSchema,
  /** The rapid idea it grew from. */
  seed: text(120).optional(),
  title: text(80),
  idea: text(600),
  answers: text(600),
  evidence: text(600),
  file: z9.string().max(40).optional(),
  /** Criterion id → the line that shows it. */
  criteria: Wheres,
  /** Requirement id → where it is. */
  requirements: Wheres,
  value_answer: text(300).default("")
});
var SketchPayloadSchema = z9.object({
  /** Examples worth borrowing from, and what to take from each. */
  inspiration: z9.array(z9.object({ from: text(120).default(""), borrow: text(200).default("") })).max(3).default([]),
  /** Rapid ideas: one line each, written against the timer. */
  rapid: z9.array(text(120)).max(40).default([]),
  /** When the student started the timer (ISO), or empty. */
  rapid_started_at: z9.string().max(40).default(""),
  /** Developed ideas, one per rapid idea picked (card id "r{index}"). These go to the group. */
  cards: z9.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z9.string().max(40).default(""),
  strongest_why: text(300).default("")
});
var IDEA_PARTS = ["idea", "answers", "evidence"];
var DotSchema = z9.object({ idea: z9.string().max(40), part: z9.enum(IDEA_PARTS), note: text(120).default("") });
var DuelSchema = z9.object({
  a: z9.string().max(40),
  b: z9.string().max(40),
  winner: z9.string().max(40),
  stronger: z9.array(z9.string().max(40)).max(SPRINT_LIMITS.criteria).default([]),
  why: text(160).default("")
});
var DecidePayloadSchema = z9.object({
  /** Head-to-heads between the group's strongest ideas, every pair once. */
  duels: z9.array(DuelSchema).max(66).default([]),
  /** Stand-out dots from sprints run before head-to-heads; no longer placed. */
  dots: z9.array(DotSchema).max(5).default([]),
  /** Criterion id → idea id, from sprints run before head-to-heads. */
  votes: z9.record(z9.string().max(40), z9.string().max(40)).default({}),
  reasons: z9.record(z9.string().max(40), text(300)).default({}),
  opened: z9.array(z9.string().max(40)).max(40).default([]),
  stretch: text(300).default("")
});
var PrototypeBuildSchema = z9.object({
  text: text(4e3).default(""),
  link: z9.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, "Links start with https://").default(""),
  files: z9.array(z9.string().max(40)).max(SPRINT_LIMITS.files).default([])
});
var PrototypePayloadSchema = PrototypeBuildSchema.extend({
  /** A student with two or more parts builds each one here, by part id; one part uses the fields above. */
  builds: z9.record(z9.string().max(40), PrototypeBuildSchema).refine((b) => Object.keys(b).length <= SPRINT_LIMITS.parts, "Too many parts.").default({}),
  requirements: Wheres,
  self: z9.record(z9.string().max(40), LevelSchema).default({}),
  self_why: z9.record(z9.string().max(40), text(300)).default({}),
  value_answer: text(300).default("")
});
var TestPayloadSchema = z9.object({
  reflection: z9.array(text(1e3)).max(2).default([]),
  quote: text(300).default(""),
  change_criterion: z9.string().max(40).default(""),
  value_answer: text(300).default("")
});
var PartSchema = z9.object({
  id: SprintIdSchema,
  text: z9.string().trim().min(1).max(80),
  shows: text(400).default(""),
  /** Optional notes on how the part gets made: tools, steps, what is borrowed. */
  how: text(400).default(""),
  criterion: z9.string().max(40).default("")
});
var PartsSchema = z9.array(PartSchema).max(SPRINT_LIMITS.parts).refine((parts) => new Set(parts.map((p) => p.id)).size === parts.length, "Each part needs its own id.");
var FeedbackEntrySchema = z9.object({
  levels: z9.record(z9.string().max(40), LevelSchema).default({}),
  worked: text(300).default(""),
  next: text(300).default(""),
  /** The criterion the written lines are about. */
  about: z9.string().max(40).default("")
});

// apps/teaching/src/quiz/core.ts
import { z as z11 } from "zod";

// apps/teaching/src/quiz/writing.ts
import { z as z10 } from "zod";
var WRITING_CHECKS = ["off", "flag", "block"];
var WritingCheckSchema = z10.enum(WRITING_CHECKS);

// apps/teaching/src/quiz/core.ts
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
var QuizQuestionKindSchema = z11.enum(QUIZ_QUESTION_KINDS);
var QUIZ_LIMITS = {
  prompt: 1e3,
  option: 300,
  hint: 500,
  explanation: 1e3,
  passage: 4e3,
  /** A short answer's "Looking for" note, and a teacher's comment on a marked answer. */
  note: 1e3,
  answer: 200,
  model: 3e3,
  response: 6e3,
  marksMax: 20
};
var Id = z11.string().min(1).max(64);
var Text = (max) => z11.string().trim().min(1).max(max);
var OptionalText = (max) => z11.string().trim().max(max).optional();
var QuizImageSchema = z11.object({
  url: z11.string().min(1).max(2e3),
  alt: z11.string().max(300).default("")
});
var QuizChoiceSchema = z11.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z11.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z11.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z11.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizSpotTargetSchema = z11.object({
  id: Id,
  /** The words, copied exactly from the passage. */
  quote: Text(QUIZ_LIMITS.option),
  /** Every technique a fair marker would accept for these words. */
  correct: z11.array(Id).min(1).max(10)
});
var QuizPinSchema = z11.object({
  id: Id,
  x: z11.number().min(0).max(1),
  y: z11.number().min(0).max(1),
  label: Text(120)
});
var NextStepEntrySchema = z11.object({
  lines: z11.array(z11.string().max(160)).length(5),
  /** Lines the teacher changed by hand; Regenerate keeps these. */
  edited: z11.array(z11.boolean()).length(5),
  /** Hash of the question, skills and ladder it was built from (bankSource), for the stale note. */
  source: z11.string().max(32)
});
var NextStepBankSchema = z11.record(z11.string().min(1).max(64), NextStepEntrySchema);
var SkillRefPattern = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z11.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z11.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional(),
  /** Syllabus outcome ids for the markbook. None means the lesson's outcomes. Capped like a criterion's (MARKBOOK_LIMITS.outcomes). */
  outcomes: z11.array(z11.string().min(1).max(64)).max(8).optional(),
  /** Skills-continuum sub-strands, `strand.sub`, for insights. */
  skills: z11.array(z11.string().regex(SkillRefPattern, "Pick a skill from the list.")).max(8).optional(),
  /** Knowledge pieces this question checks (deep understandings), for the unit's tracking. */
  pieces: z11.array(z11.string().regex(/^kp_[a-z0-9]{4,16}$/)).max(6).optional()
};
var QuizQuestionSchema = z11.discriminatedUnion("kind", [
  z11.object({ ...base, kind: z11.literal("multiple_choice"), options: z11.array(QuizChoiceSchema).min(2).max(6), correct: z11.array(Id).length(1) }),
  z11.object({ ...base, kind: z11.literal("multi_select"), options: z11.array(QuizChoiceSchema).min(2).max(8), correct: z11.array(Id).min(1).max(8) }),
  z11.object({ ...base, kind: z11.literal("true_false"), answer: z11.boolean() }),
  z11.object({
    ...base,
    kind: z11.literal("short_answer"),
    accepted: z11.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z11.boolean().optional(),
    /** What a right answer says, for the AI marker. Optional. */
    looking_for: OptionalText(QUIZ_LIMITS.note),
    ai_mark: z11.boolean().optional()
  }),
  z11.object({ ...base, kind: z11.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z11.boolean().optional(), ai_mark: z11.boolean().optional() }),
  z11.object({ ...base, kind: z11.literal("odd_one_out"), options: z11.array(QuizChoiceSchema).min(3).max(6), correct: z11.array(Id).length(1) }),
  z11.object({ ...base, kind: z11.literal("matching"), pairs: z11.array(QuizPairSchema).min(2).max(8) }),
  z11.object({ ...base, kind: z11.literal("ordering"), items: z11.array(QuizChoiceSchema).min(3).max(8) }),
  z11.object({
    ...base,
    kind: z11.literal("categorise"),
    groups: z11.array(QuizGroupSchema).min(2).max(4),
    items: z11.array(QuizSortItemSchema).min(2).max(16)
  }),
  z11.object({
    ...base,
    kind: z11.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z11.array(QuizChoiceSchema.extend({ technique_id: z11.string().max(64).optional() })).min(2).max(6),
    correct: z11.array(Id).length(1)
  }),
  z11.object({
    ...base,
    kind: z11.literal("find_it"),
    segments: z11.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z11.array(Id).min(1).max(40)
  }),
  z11.object({
    ...base,
    kind: z11.literal("spot_technique"),
    passage: Text(QUIZ_LIMITS.passage),
    options: z11.array(
      QuizChoiceSchema.extend({
        technique_id: z11.string().max(64).optional(),
        /** How many times students may name it: 2 for a passage with two similes. */
        uses: z11.number().int().min(1).max(12).optional()
      })
    ).min(2).max(10),
    targets: z11.array(QuizSpotTargetSchema).min(1).max(12),
    /** How many students must find. Fewer than the targets means any of them will do. */
    find: z11.number().int().min(1).max(12).optional()
  }),
  z11.object({ ...base, kind: z11.literal("label_image"), image: QuizImageSchema, pins: z11.array(QuizPinSchema).min(2).max(8) }),
  z11.object({
    ...base,
    kind: z11.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model),
    next_steps: NextStepBankSchema.optional(),
    ai_mark: z11.boolean().optional()
  }),
  z11.object({
    ...base,
    kind: z11.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model),
    next_steps: NextStepBankSchema.optional(),
    ai_mark: z11.boolean().optional()
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z11.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z11.custom(
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
var QuizFeedbackSchema = z11.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z11.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z11.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z11.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z11.boolean().optional(),
  shuffle_questions: z11.boolean().optional(),
  shuffle_options: z11.boolean().optional(),
  attempts: z11.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z11.number().min(0).max(1).optional(),
  confidence: z11.boolean().optional(),
  /** Written answers: off, flag how they were typed, or also block paste. Blank means flag. */
  writing_check: WritingCheckSchema.optional(),
  closes_at: z11.string().datetime().optional(),
  /** Live quiz in focus view: a question revealed under this share right stops at a checkpoint. Blank means 80. */
  move_on: z11.number().int().min(1).max(100).optional(),
  /** A follow-up quiz: only these students (class-list ids) may sit it. */
  for_students: z11.array(z11.string().min(1).max(64)).max(60).optional(),
  /** The quiz this one follows up, and the flag that prompted it. */
  follow_up_of: z11.string().max(64).optional(),
  follow_up_flag: z11.string().max(160).optional(),
  /** Teacher only: an earlier quiz to show before-and-after against. */
  compare_with: z11.string().max(64).optional()
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
import { z as z12 } from "zod";
var TkStepSchema = z12.object({
  id: z12.string().min(1),
  title: z12.string(),
  prompt: z12.string()
});
var TkRevealSchema = z12.object({
  id: z12.string().min(1),
  label: z12.string(),
  body: z12.string()
});
var TkTeacherNoteSchema = z12.object({
  what: z12.string().default(""),
  run: z12.array(z12.string()).default([]),
  say: z12.array(z12.string()).default([]),
  watch: z12.array(z12.string()).default([]),
  extra_label: z12.string().default(""),
  extra: z12.array(z12.string()).default([]),
  time: z12.string().default(""),
  source: z12.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z12.boolean().default(false)
});
var TkJotsSchema = z12.record(z12.string(), z12.string()).default({});
var TkItemListSchema = z12.array(z12.string().min(1)).default([]);
var ToolkitSkillContentSchema = z12.object({
  item: z12.string().min(1),
  label: z12.string(),
  definition: z12.string(),
  definition_source: z12.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z12.string().default(""),
  context: z12.string().default(""),
  steps: z12.array(TkStepSchema).max(8),
  show_test: z12.boolean().default(true),
  checks: z12.array(z12.string()).max(8).default([]),
  reveals: z12.array(TkRevealSchema).max(6).default([]),
  links: z12.object({ tools: TkItemListSchema, values: TkItemListSchema }).prefault({ tools: [], values: [] }),
  show_links: z12.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z12.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z12.preprocess(
  (value) => value === "level2" ? "none" : value,
  z12.enum(["none", "level1", "level3", "maths", "inquiry"])
);
var StressVerdictSchema = z12.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z12.object({
  kind: z12.string().default(""),
  marker: z12.string().default(""),
  a: z12.string().default(""),
  b: z12.string().default("")
});
var ToolkitToolContentSchema = z12.object({
  item: z12.string().min(1),
  label: z12.string(),
  definition: z12.string(),
  definition_source: z12.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z12.string().default(""),
  frame: ToolFrameSchema,
  sentence: z12.string().default(""),
  steps: z12.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.prefault({}),
  worked_note: z12.string().default(""),
  converters: z12.array(z12.object({ id: z12.string().min(1), closed: z12.string(), open: z12.string() })).max(10).default([]),
  statements: z12.array(
    z12.object({
      id: z12.string().min(1),
      text: z12.string(),
      verdict: StressVerdictSchema,
      reason: z12.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z12.array(TkRevealSchema).max(6).default([]),
  links: z12.object({ skills: TkItemListSchema, tools: TkItemListSchema }).prefault({ skills: [], tools: [] }),
  show_links: z12.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z12.object({
  item: z12.string().min(1),
  label: z12.string(),
  definition: z12.string(),
  definition_source: z12.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z12.string().default(""),
  claim: z12.string().default(""),
  options: z12.array(z12.object({ id: z12.string().min(1), text: z12.string() })).max(8).default([]),
  probes: z12.array(z12.object({ id: z12.string().min(1), question: z12.string(), asks: z12.string() })).max(8).default([]),
  instruction: z12.string().default(""),
  model: z12.object({ label: z12.string(), body: z12.string() }).prefault({ label: "", body: "" }),
  discussion: z12.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z12.object({
  id: z12.string().min(1),
  tool: z12.string().min(1),
  prompt: z12.string(),
  frame: z12.string(),
  example: z12.string()
});
var ThinkingMoveContentSchema = z12.object({
  skill: z12.string().min(1),
  tools: z12.array(z12.string().min(1)).min(1).max(5),
  value: z12.string().min(1),
  community: z12.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z12.string().default(""),
  stimulus: z12.string().default(""),
  steps: z12.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z12.array(z12.string()).max(8).default([]),
  why: z12.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z12.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z12.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z12.object({
  /** Student instruction shown at the top of the block. */
  guide: z12.string().default(""),
  stimulus: z12.string().default(""),
  procedure: z12.enum(["sort", "create"]).default("sort"),
  /** Students send their own questions and place them on the quadrant (live, published lesson). */
  collect_questions: z12.boolean().default(false),
  questions: z12.array(z12.object({ id: z12.string().min(1), text: z12.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z12.array(z12.object({ id: z12.string().min(1), closed: z12.string(), open: z12.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z12.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z12.object({
  /** Student instruction shown at the top of the block. */
  guide: z12.string().default(""),
  concepts: z12.array(
    z12.object({
      id: z12.string().min(1),
      label: z12.string(),
      central: z12.boolean(),
      contestable: z12.boolean(),
      common: z12.boolean()
    })
  ).max(8).default([]),
  analogy: z12.object({ stem: z12.string(), example: z12.string() }).prefault({ stem: "", example: "" }),
  game: z12.object({
    kind: ConceptGameKindSchema,
    left: z12.string(),
    middle: z12.string(),
    right: z12.string(),
    cards: z12.array(z12.object({ id: z12.string().min(1), text: z12.string(), prompt: z12.string() })).max(16)
  }).prefault({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z12.array(z12.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z12.object({
  content: z12.string().default(""),
  skills: z12.array(z12.string().min(1)).max(2).default([]),
  tools: z12.array(z12.string().min(1)).max(6).default([]),
  values: z12.array(z12.string().min(1)).max(4).default([]),
  community: z12.array(z12.string().min(1)).max(2).default([]),
  success: z12.array(z12.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z12.object({
  variant: z12.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z12.string().default(""),
  concept: z12.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z12.object({
  task: z12.string().default(""),
  steps: z12.array(TkStepSchema).max(6).default([]),
  example: z12.string().default("")
});
var FluidAnalogyContentSchema = z12.object({
  kind: z12.string().min(1),
  label: z12.string(),
  definition: z12.string(),
  /** The text, character or idea students work with. */
  focus: z12.string().default(""),
  /** The level students start at. */
  level: z12.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z12.boolean().default(true),
  tiers: z12.array(AnalogyTierSchema).length(3),
  show_check: z12.boolean().default(true),
  checks: z12.array(z12.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z12.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z12.object({
  key: z12.string().min(1),
  label: z12.string().default(""),
  frame: z12.string().default(""),
  example: z12.string().default("")
});
var AnalogyStageSchema = z12.object({
  task: z12.string().default(""),
  slots: z12.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z12.object({
  label: z12.string(),
  definition: z12.string(),
  /** The text, character or idea students work with. */
  focus: z12.string().default(""),
  /** The level students start at. */
  level: z12.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z12.boolean().default(true),
  levels: z12.array(AnalogyStageSchema).length(3),
  show_check: z12.boolean().default(true),
  checks: z12.array(z12.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z12.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z12.object({
  /** Student instruction shown at the top of the block. */
  guide: z12.string().default(""),
  focus: z12.string().default(""),
  /** Types marked "This lesson". */
  types: z12.array(z12.string().min(1)).max(7).default([]),
  show_contrast: z12.boolean().default(true),
  weak: z12.string().default(""),
  strong: z12.string().default(""),
  why: z12.string().default(""),
  process: z12.array(z12.string()).max(8).default([]),
  show_check: z12.boolean().default(true),
  checks: z12.array(z12.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteWalkthruSchema = z12.object({
  set: z12.number().int().min(1).max(20).default(1),
  // A book technique (w1-…) or a fusion from the board (fu_…), whose steps can run to nine.
  id: z12.string().regex(/^(?:w\d+-[a-z0-9-]{2,80}|fu_[a-z0-9]{6,24})$/),
  jots: z12.record(z12.string().regex(/^[1-9]$/), z12.string().max(2e3)).default({})
});
var TeacherNoteBlockContentSchema = z12.object({
  title: z12.string().default("Teacher note"),
  html: z12.string().default(""),
  walkthru: TeacherNoteWalkthruSchema.optional()
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
var VisibilitySchema = z13.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z13.enum([
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
  "done",
  "brainstorm",
  "hinge_question",
  "explainer",
  "comparative_judgement",
  "continuum_line",
  "diamond_nine",
  "venn",
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
var ColumnPresetSchema = z13.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z13.enum(["small", "medium", "large"]);
var VideoProviderSchema = z13.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z13.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z13.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z13.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z13.enum([
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
var QuestionKindSchema = z13.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z13.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z13.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  discern: DiscernQualifierSchema.optional(),
  lenses: LensAttachmentsSchema.optional(),
  layout: z13.record(z13.string(), z13.unknown()).default({}),
  print: z13.record(z13.string(), z13.unknown()).default({}),
  settings: z13.record(z13.string(), z13.unknown()).default({})
};
var RichTextBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("rich_text"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({ html: z13.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var NarrationSchema = z13.object({
  url: z13.string().min(1),
  duration_s: z13.number().min(0).max(900),
  transcript: z13.string().max(8e3).optional()
});
var RevealSchema = z13.enum(["all", "one"]);
var HeadingBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z13.object({
    text: z13.string(),
    narration: NarrationSchema.optional(),
    /** Lecture: what the teacher plans to say, e.g. imported speaker notes. Teacher-only. */
    script: z13.string().max(8e3).optional(),
    reveal: RevealSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("callout"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    style: CalloutStyleSchema,
    title: z13.string().optional(),
    body: z13.string(),
    related_to: z13.object({
      block_id: z13.string().min(1),
      question_id: z13.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z13.object({
    url: z13.string(),
    alt_text: z13.string(),
    caption: z13.string().optional(),
    annotations: z13.array(
      z13.object({
        id: z13.string().min(1),
        body: z13.string().min(1),
        selector: z13.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z13.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z13.object({
  id: z13.string().min(1),
  url: z13.string(),
  alt_text: z13.string(),
  caption: z13.string().optional(),
  /** A lesson in the same unit: the image opens it. Unresolved ids show as a plain image. */
  lesson_id: z13.string().min(1).optional()
});
var GalleryBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z13.object({
    layout: GalleryLayoutSchema,
    items: z13.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z13.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z13.object({
    provider: VideoProviderSchema,
    external_id: z13.string(),
    url: z13.string().optional(),
    start_seconds: z13.number().int().positive().optional(),
    title: z13.string().optional(),
    caption: z13.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("embed"),
  variant: z13.string().default("large"),
  visibility: VisibilitySchema,
  content: z13.object({
    url: z13.string(),
    title: z13.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z13.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("html"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({ html: z13.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z13.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z13.object({
  enabled: z13.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z13.string().min(1),
  system: z13.string(),
  max_tokens: z13.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("html_app"),
  variant: z13.string().default("large"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    html: z13.string(),
    height_px: z13.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("quote"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    quote: z13.string(),
    attribution: z13.string().optional(),
    source: z13.string().optional(),
    reference: z13.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimerSegmentSchema = z13.object({
  label: z13.string().max(60),
  minutes: z13.number().min(0.25).max(180)
});
var ClassroomToolIdSchema = z13.enum([
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
var DividerBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("divider"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    /** The faint gear at the end of the rule that slides out the classroom tools. */
    tools: z13.boolean().default(true),
    /** Timers saved with the lesson, ready when it opens. */
    timer_stack: z13.array(TimerSegmentSchema).max(8).default([])
  }).prefault({}),
  ...blockLayout,
  ...blockTimestamps
});
var ClassroomToolsBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("classroom_tools"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    timer_stack: z13.array(TimerSegmentSchema).max(8).default([]),
    /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
    start_tool: ClassroomToolIdSchema.optional()
  }).prefault({}),
  ...blockLayout,
  ...blockTimestamps
});
var CountdownBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("countdown"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().max(200).default(""),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z13.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z13.string().regex(/^(\d{2}:\d{2})?$/).default(""),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z13.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    note: z13.string().max(400).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("definition"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    term: z13.string(),
    definition: z13.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("code"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    code: z13.string(),
    language: z13.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("audio"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  /**
   * The Voice block. `listen` plays a clip (the original audio block); `respond`
   * and `viva` have students record a spoken answer and submit their best take.
   * Viva adds dot points the timer walks through. `url` is only used by listen.
   * `oracy` layers a type over those modes: speech, debate and presentation run
   * as viva, recite as respond with `recite_text` in place of a required prompt.
   */
  content: z13.object({
    url: z13.string(),
    title: z13.string().optional(),
    mode: z13.enum(["listen", "respond", "viva"]).default("listen"),
    prompt: z13.string().max(4e3).optional(),
    time_limit_s: z13.number().int().min(30).max(300).optional(),
    student_chooses_time: z13.boolean().optional(),
    scaffold: z13.array(z13.object({ label: z13.string().max(80), weight: z13.number().min(0.5).max(3).default(1) })).max(8).optional(),
    code_groups: z13.array(z13.enum(["composition", "viva", "speaking"])).optional(),
    oracy: z13.enum(["speech", "debate", "presentation", "recite"]).optional(),
    side: z13.enum(["proposing", "opposing"]).optional(),
    stems: z13.array(z13.string().max(120)).max(12).optional(),
    recite_text: z13.string().max(8e3).optional(),
    /**
     * Time pressure: one locked run. The question stays hidden until the student
     * starts prepping; then prep time, a big "about to speak" countdown, the
     * speaking time, and a grace period before the take sends itself.
     */
    pressure: z13.object({
      enabled: z13.boolean().default(false),
      prep_s: z13.number().int().min(10).max(600).default(60),
      countdown_s: z13.number().int().min(3).max(30).default(10),
      grace_s: z13.number().int().min(0).max(30).default(10)
    }).optional(),
    /**
     * Follow-ups: after the main answer, questions drawn at random from the
     * teacher's bank. Each gets a short think, then a timed answer, recorded
     * onto the same take so it is marked with it.
     */
    follow_up: z13.object({
      enabled: z13.boolean().default(false),
      questions: z13.array(z13.string().max(300)).max(40).default([]),
      count: z13.number().int().min(1).max(3).default(1),
      think_s: z13.number().int().min(3).max(60).default(10),
      answer_s: z13.number().int().min(10).max(180).default(30)
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("attachment"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    url: z13.string(),
    title: z13.string(),
    filename: z13.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z13.object({
  title: z13.string(),
  body: z13.string()
});
var AccordionBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("accordion"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    items: z13.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("table"),
  variant: z13.string().default("large"),
  visibility: VisibilitySchema,
  content: z13.object({
    headers: z13.array(z13.string()),
    rows: z13.array(z13.array(z13.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z13.object({
  id: z13.string().min(1),
  prompt: z13.string(),
  kind: QuestionKindSchema,
  options: z13.array(z13.string()).optional(),
  response_space: ResponseSpaceSchema.optional(),
  /** The 4 levels format's band; absent means guessed from the question's opening words. */
  level: z13.enum(["beginner", "detective", "judge", "inventor"]).optional(),
  /** Reasoning chart format: which logic this question walks. Absent means Student's choice. */
  logic: LogicSchema.optional(),
  /** Short answer only: the answer a student can check their own against. */
  model_answer: z13.string().optional(),
  /**
   * Sentence-level formats: the sentences or notes students work from. Sentence combining: the kernel
   * sentences to join. Appositive: the sentence with the noun to rename. Expansion: the kernel. Note to
   * topic sentence: the fragment notes, one per line.
   */
  kernels: z13.array(z13.string().max(400)).max(8).optional(),
  /** Sentence combining: the joining word the combined sentence must use. Absent means any. */
  conjunction: z13.string().max(20).optional(),
  /** Sentence expansion: the question words the student answers in the expanded sentence. */
  question_words: z13.array(z13.enum(["who", "what", "when", "where", "why", "how"])).max(6).optional(),
  /** Sentence-level formats: the partial frame a middle item starts from. Absent means the first part of the model answer. */
  frame: z13.string().max(400).optional(),
  /** How the model answer opens: straight away, or after the student rates their confidence 1 to 5. Absent means straight away. */
  model_check: z13.enum(["reveal", "confidence"]).optional(),
  /** Success criteria the student ticks off against their answer. */
  checklist: z13.array(z13.object({ id: z13.string().min(1), label: z13.string() })).max(12).optional(),
  /** Skills-continuum sub-strands (`strand.sub`) this box practises; they pick the student's next step. */
  skills: z13.array(z13.string().regex(SkillRefPattern)).max(4).optional(),
  /** The box's next steps, one entry per linked feedback code. */
  next_steps: NextStepBankSchema.optional()
});
var PeerFeedbackBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("peer_feedback"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    prompt: z13.string().max(4e3),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z13.enum(["comments", "annotate"]).default("comments"),
    strength_prompt: z13.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z13.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ContinuumStatementSchema = z13.object({
  id: z13.string().min(1),
  text: z13.string().max(300).default(""),
  snap: z13.boolean().default(false),
  /** Predict mode: where the statement really sits on the line (0 to 1). Teacher only: publish strips it. */
  answer: z13.number().min(0).max(1).optional()
});
var ContinuumLineBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("continuum_line"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    stimulus: z13.object({
      kind: z13.enum(["text", "image", "video"]).default("text"),
      text: z13.string().max(2e3).default(""),
      url: z13.string().max(2e3).default(""),
      alt_text: z13.string().max(500).default("")
    }).prefault({ kind: "text", text: "", url: "", alt_text: "" }),
    scale: z13.object({
      left: z13.string().max(40).default("Implied"),
      right: z13.string().max(40).default("Not implied"),
      stops: z13.array(z13.string().max(40)).max(3).default([])
    }).prefault({ left: "Implied", right: "Not implied", stops: [] }),
    statements: z13.array(ContinuumStatementSchema).max(10).default([]),
    pace: z13.enum(["teacher", "student", "self"]).default("teacher"),
    replace: z13.boolean().default(true),
    /** Opinion: no right answer, the reason is the point. Predict: each statement has an answer the teacher shows after the reveal. Absent means opinion. */
    mode: z13.enum(["opinion", "predict"]).optional(),
    /** A return line: the id of an earlier continuum line in the lesson. It runs that line's stimulus, scale and statements again, and shows each student where they first put their symbol. */
    returns_to: z13.string().min(1).max(64).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiamondCardSchema = z13.object({
  id: z13.string().min(1).max(64),
  kind: z13.enum(["text", "quote", "image"]).default("text"),
  text: z13.string().max(300).default(""),
  /** Quote: who said it, or where it comes from. */
  source: z13.string().max(120).optional(),
  url: z13.string().max(2e3).optional(),
  alt_text: z13.string().max(300).optional()
});
var DiamondNineBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("diamond_nine"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().max(200).default(""),
    /** What the diamond ranks by, e.g. "Most significant to the text's meaning". */
    criterion: z13.string().max(200).default(""),
    /** A second pass ranks the same cards by this. Empty means no second pass. */
    second_criterion: z13.string().max(200).default(""),
    cards: z13.array(DiamondCardSchema).max(9).default([]),
    /** A student may swap one card for their own. */
    wildcard: z13.boolean().default(true),
    /** Offer Because, but, so as a frame for the reasons. */
    frame: z13.boolean().default(false),
    /** After submitting, students can rank again and say what changed their mind. */
    rerank: z13.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VennBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("venn"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    prompt: z13.string().max(600).default(""),
    texts: z13.array(z13.object({ label: z13.string().max(80).default("") })).min(2).max(3).default([{ label: "" }, { label: "" }]),
    /** Points students sort into the circles before adding their own. */
    preload: z13.array(z13.object({ id: z13.string().min(1).max(64), text: z13.string().max(300).default("") })).max(12).default([]),
    /** The centre's synthesis sentence frame. */
    synthesis_frame: z13.string().max(300).default("Both \u2026 explore \u2026, but where A \u2026, B \u2026"),
    /** Suggest a deep point when surface points outnumber deep ones. */
    nudge: z13.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var BrainstormBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("brainstorm"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    question: z13.string().max(500).default(""),
    safety: z13.enum(["instant", "approve", "reveal"]).default("approve"),
    per_student: z13.union([z13.literal(0), z13.literal(1), z13.literal(3), z13.literal(5)]).default(3),
    max_length: z13.number().int().min(20).max(280).default(140),
    layout: z13.enum(["grid", "cloud", "groups"]).default("grid")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HingeOptionSchema = z13.object({
  id: z13.string().min(1).max(40),
  text: z13.string().max(300).default(""),
  misconception: z13.string().max(300).default(""),
  /** Independent mode: how near this answer is. Absent: the right answer is right, the rest are mix-ups. */
  tier: z13.enum(["right", "close", "mixup"]).optional()
});
var HingeBackupSchema = z13.object({
  prompt: z13.string().max(500).default(""),
  options: z13.array(HingeOptionSchema).max(5).default([]),
  correct_id: z13.string().max(40).default(""),
  source: z13.enum(["teacher", "ann"]).default("teacher")
});
var HingeQuestionBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("hinge_question"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    prompt: z13.string().max(500).default(""),
    options: z13.array(HingeOptionSchema).max(5).default([]),
    correct_id: z13.string().max(40).default(""),
    seconds: z13.union([z13.literal(0), z13.literal(30), z13.literal(60), z13.literal(90), z13.literal(120)]).default(60),
    move_on: z13.number().int().min(1).max(100).default(80),
    reteach: z13.number().int().min(0).max(99).default(50),
    /** A parallel question for the re-check after re-teaching. Teacher-written, or drafted by Ann in focus view. */
    backup: HingeBackupSchema.optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z13.boolean().optional(),
    /**
     * Live: the teacher opens and closes a round. Independent: each student
     * answers alone with a reason, gets their own feedback and one retry on
     * the back-up question. Absent means live.
     */
    pace: z13.enum(["live", "independent"]).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CurriculumLinesColourSchema = z13.enum([
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
var CurriculumLinesLevelSchema = z13.enum(["introduced", "reinforced", "mastered"]);
var CurriculumLinesStrandSchema = z13.object({
  id: z13.string().min(1).max(64),
  name: z13.string().max(60).default(""),
  colour: CurriculumLinesColourSchema.default("wave")
});
var CurriculumLinesStationSchema = z13.object({
  id: z13.string().min(1).max(64),
  strand_id: z13.string().min(1).max(64),
  week: z13.number().int().min(1).max(20),
  level: CurriculumLinesLevelSchema.default("reinforced"),
  label: z13.string().max(120).default(""),
  lesson_id: z13.string().min(1).max(64).optional()
});
var CurriculumLinesCheckpointSchema = z13.object({
  id: z13.string().min(1).max(64),
  week: z13.number().int().min(1).max(20),
  label: z13.string().max(80).default(""),
  lesson_id: z13.string().min(1).max(64).optional(),
  strand_ids: z13.array(z13.string().min(1).max(64)).min(1).max(8)
});
var CurriculumLinesTerminusSchema = z13.object({
  label: z13.string().max(80).default("Assessment task"),
  detail: z13.string().max(160).optional(),
  when: z13.string().max(24).optional(),
  lesson_id: z13.string().min(1).max(64).optional()
});
var CurriculumLinesV1ContentSchema = z13.object({
  title: z13.string().max(120).optional(),
  weeks: z13.number().int().min(1).max(20).default(8),
  strands: z13.array(CurriculumLinesStrandSchema).min(1).max(8),
  stations: z13.array(CurriculumLinesStationSchema).max(160).default([]),
  checkpoints: z13.array(CurriculumLinesCheckpointSchema).max(20).default([]),
  terminus: CurriculumLinesTerminusSchema.prefault({ label: "Assessment task" })
});
var NetworkLineModeSchema = z13.enum(["train", "metro", "light_rail"]);
var LineAlignmentSchema = z13.discriminatedUnion("kind", [
  z13.object({ kind: z13.literal("points"), group: z13.enum(["U", "R"]) }),
  z13.object({ kind: z13.literal("concept"), key: z13.string().regex(/^[A-Z]{2,5}$/) }),
  z13.object({ kind: z13.literal("strand"), strand: z13.enum(SKILL_STRANDS) })
]);
var DotPointRefSchema = z13.string().regex(/^[a-z0-9-]{2,40}:[UR]\d{1,2}$/);
var NetworkLineSchema = z13.object({
  id: z13.string().min(1).max(64),
  mode: NetworkLineModeSchema,
  name: z13.string().max(60).default(""),
  short: z13.string().max(4).optional(),
  colour: CurriculumLinesColourSchema.default("wave"),
  alignment: LineAlignmentSchema.optional(),
  /** What the line means, in a sentence: students read it when they press the line's tag on their unit map. */
  meaning: z13.string().max(200).optional()
});
var AfterLessonIdsSchema = z13.array(z13.string().min(1).max(64)).max(6);
var LessonRouteRoleSchema = z13.enum(["core", "support", "extension", "optional"]);
var LessonSkipRuleSchema = z13.string().trim().max(80);
var LineStopSchema = z13.object({
  line_id: z13.string().min(1).max(64),
  level: CurriculumLinesLevelSchema.optional(),
  /** Set from the lesson's dot points; it follows them until the teacher takes it off. */
  auto: z13.literal(true).optional()
});
var LineOffSchema = z13.array(z13.string().min(1).max(64)).max(24);
var NetworkNudgesSchema = z13.record(
  z13.string().min(1).max(160),
  z13.object({ dx: z13.number().min(-2e3).max(2e3), dy: z13.number().min(-2e3).max(2e3) })
).refine((value) => Object.keys(value).length <= 120, { message: "At most 120 nudges" });
var CurriculumRailStopSchema = z13.object({
  id: z13.string().min(1).max(64),
  line_id: z13.string().min(1).max(64),
  after_lesson_id: z13.string().min(1).max(64).optional(),
  kind: z13.enum(["stop", "extension", "support"]).default("stop"),
  lesson_id: z13.string().min(1).max(64).optional(),
  block_id: z13.string().min(1).max(120).optional(),
  label: z13.string().max(120).default(""),
  /** Who may take the straight track past a support stop, e.g. "90%+ on the techniques quiz". */
  skip_rule: z13.string().max(80).optional()
});
var CurriculumGateSchema = z13.object({
  id: z13.string().min(1).max(64),
  after_lesson_id: z13.string().min(1).max(64).optional(),
  label: z13.string().max(80).default(""),
  lesson_id: z13.string().min(1).max(64).optional(),
  line_ids: z13.array(z13.string().min(1).max(64)).max(24).default([])
});
var CurriculumLinesV2ContentSchema = z13.object({
  version: z13.literal(2),
  title: z13.string().max(120).optional(),
  rail_stops: z13.array(CurriculumRailStopSchema).max(60).default([]),
  gates: z13.array(CurriculumGateSchema).max(12).default([]),
  nudges: NetworkNudgesSchema.default({}),
  /** Map-only station order; lessons not listed follow in unit order. */
  station_order: z13.array(z13.string().min(1).max(64)).max(200).optional(),
  /** Lessons left off this map (they stay in the unit). */
  hidden_lessons: z13.array(z13.string().min(1).max(64)).max(200).optional(),
  /** The syllabus focus area this unit covers; unset is worked out from the unit's title. */
  focus_area: z13.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  /** The metro lines (textual concepts) this unit shows; unset shows every one. The year network always shows them all. */
  concept_lines: z13.array(z13.string().min(1).max(64)).max(4).optional(),
  /** The light rail lines (skills strands) this unit shows; unset shows every one. The year network always shows them all. */
  skill_lines: z13.array(z13.string().min(1).max(64)).max(4).optional(),
  terminus: CurriculumLinesTerminusSchema.prefault({ label: "Assessment task" })
});
var CurriculumLinesBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("curriculum_lines"),
  variant: z13.string().default("large"),
  visibility: VisibilitySchema,
  content: z13.union([CurriculumLinesV2ContentSchema, CurriculumLinesV1ContentSchema]),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionDropBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("question_drop"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    target_quiz_id: z13.string().max(64).default(""),
    prompt: z13.string().max(500).default(""),
    kinds: z13.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z13.number().int().min(1).max(20).default(1),
    marks_max: z13.number().int().min(1).max(20).default(3),
    per_student: z13.number().int().min(1).max(5).default(1),
    accepting: z13.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DoneBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("done"),
  variant: z13.string().default("small"),
  visibility: VisibilitySchema,
  content: z13.object({
    label: z13.string().max(120).default("I\u2019ve finished this")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiscernConfirmBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("discern_confirm"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    target_block_id: z13.string().max(120).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("quiz_question"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z13.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("question_set"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    questions: z13.array(QuestionItemSchema),
    /** Shape of the set; absent means standard. See src/blocks/formats/registry.ts. */
    format: z13.enum([
      "standard",
      "human_experience_table",
      "anchor_bridge",
      "question_levels",
      "because_but_so",
      "reasoning_chart",
      "sentence_combining",
      "appositive",
      "sentence_expansion",
      "note_to_topic"
    ]).optional(),
    /** Sentence-level formats: worked-example fading (absent means on) and an optional word limit. */
    sentence: z13.object({
      fade: z13.boolean().default(true),
      word_limit: z13.number().int().min(3).max(80).optional()
    }).optional(),
    /** Human experience table settings, kept when switching format away and back. */
    table: z13.object({
      rows: z13.number().int().min(3).max(5).default(3),
      example: z13.boolean().default(true)
    }).optional(),
    /** Reasoning chart settings, kept when switching format away and back. */
    reasoning: z13.object({
      level: LensLevelSchema.default("core"),
      student_level: z13.boolean().default(true)
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z13.object({
  block_id: z13.string().min(1),
  annotation_id: z13.string().min(1),
  lesson_id: z13.string().optional(),
  kind: z13.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z13.string().min(1)
});
var FlashcardItemSchema = z13.object({
  id: z13.string().min(1),
  front: z13.string(),
  back: z13.string(),
  image_url: z13.string().optional(),
  image_alt: z13.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("flashcards"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    cards: z13.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z13.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("cloze"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    text: z13.string(),
    case_sensitive: z13.boolean().optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z13.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z13.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z13.object({
  id: z13.string().min(1),
  label: z13.string()
});
var SelfCheckBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("self_check"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z13.string(),
    answer: z13.string().optional(),
    items: z13.array(SelfCheckItemSchema).max(12).optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z13.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var NOTE_CUE_KINDS = ["copy", "own_words", "draw", "question"];
var NoteCueKindSchema = z13.enum(NOTE_CUE_KINDS);
var NoteCueBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("note_cue"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    kind: NoteCueKindSchema,
    prompt: z13.string().max(500)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WithTeacherBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("with_teacher"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    talking_points: z13.array(z13.string().max(300)).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FadedExampleBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("faded_example"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: FadedContentSchema,
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z13.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z13.object({
  x: z13.union([z13.string(), z13.number()]),
  y: z13.number()
});
var ChartSeriesColorSchema = z13.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z13.object({
  id: z13.string().min(1),
  name: z13.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z13.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("chart"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    chart_type: ChartTypeSchema,
    title: z13.string().optional(),
    x_label: z13.string().optional(),
    y_label: z13.string().optional(),
    series: z13.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("equation"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    latex: z13.string(),
    caption: z13.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z13.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("diagram"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    source: DiagramSourceSchema,
    image_url: z13.string().optional(),
    image_alt: z13.string().optional(),
    svg_markup: z13.string().optional(),
    caption: z13.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z13.object({
  id: z13.string().min(1),
  label: z13.string(),
  parent_id: z13.string().nullable().optional(),
  color: z13.string().optional(),
  x: z13.number().optional(),
  y: z13.number().optional()
});
var GraphBuildModeSchema = z13.enum(["outline", "canvas"]);
var GraphEdgeSchema = z13.object({
  id: z13.string().min(1),
  from: z13.string().min(1),
  to: z13.string().min(1),
  label: z13.string().optional()
});
var MindMapBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("mind_map"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    nodes: z13.array(GraphNodeSchema).min(1).max(24),
    edges: z13.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("concept_map"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    nodes: z13.array(GraphNodeSchema).min(1).max(24),
    edges: z13.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardStarterIdSchema = z13.enum(["sort_groups", "venn", "same_different"]);
var WhiteboardBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("whiteboard"),
  variant: z13.string().default("large"),
  visibility: VisibilitySchema,
  content: z13.object({
    document_id: z13.string().min(1),
    seed_document_id: z13.string().min(1).optional(),
    /** Built-in layout drawn into the board the first time it opens with no document (packages/whiteboard/starters.mjs). */
    starter: WhiteboardStarterIdSchema.optional(),
    title: z13.string().optional(),
    height_px: z13.number().int().min(360).max(1400).default(640),
    published_snapshot: z13.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z13.object({
  id: z13.string().min(1),
  when: z13.string(),
  label: z13.string(),
  description: z13.string(),
  image_url: z13.string().optional(),
  image_alt: z13.string().optional(),
  link_url: z13.string().optional(),
  link_label: z13.string().optional()
});
var TimelineLayoutSchema = z13.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("timeline"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    layout: TimelineLayoutSchema.optional(),
    events: z13.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z13.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z13.object({
  id: z13.string().min(1),
  number: z13.string().optional(),
  eyebrow: z13.string(),
  title: z13.string(),
  description: z13.string(),
  image_url: z13.string().optional(),
  image_alt: z13.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("card_stack"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    cards: z13.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z13.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("collection"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    source: CollectionSourceSchema,
    title: z13.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z13.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("anthology"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var OutcomesBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  // Shows as What, How, Why. The type keeps its old name so blocks already placed carry over.
  block_type: z13.literal("outcomes"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    what: z13.string().default(""),
    how: z13.array(z13.object({ id: z13.string().min(1), text: z13.string() })).default([])
  }).default({ what: "", how: [] }),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z13.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z13.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z13.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z13.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z13.enum(["left", "center", "right"]);
var AnnotationLineSchema = z13.object({
  id: z13.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z13.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z13.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z13.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z13.object({
  id: z13.string().min(1),
  lines: z13.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z13.object({
  kind: z13.enum(["verse", "prose"]),
  stanzas: z13.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z13.object({
  id: z13.string().min(1),
  name: z13.string().min(1),
  subgroup: z13.string().optional()
});
var AnnotationLayerSchema = z13.object({
  id: z13.string().min(1),
  name: z13.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z13.string().optional(),
  sublayers: z13.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z13.object({
  exact: z13.string().min(1),
  prefix: z13.string().optional(),
  suffix: z13.string().optional()
});
var AnnotationAnchorSchema = z13.object({
  /** Required on every stop when the annotation is a thread. */
  id: z13.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z13.string().min(1),
  line: z13.string().optional(),
  start: z13.number().int().min(0).optional(),
  end: z13.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z13.string().optional()
});
var AnnotationTechniqueRefSchema = z13.object({
  id: z13.string().min(1),
  table_version: z13.string().min(1)
});
var AnnotationCodeRefSchema = z13.object({
  id: z13.string().min(1).max(40),
  code: z13.string().regex(/^[A-Z]{1,3}$/),
  label: z13.string().max(60),
  descriptor: z13.string().max(600).default(""),
  colour: z13.enum(["blue", "sage", "peach", "gold", "lilac"]).default("blue"),
  positive: z13.boolean().default(false)
});
var AnnotationAttachmentSchema = z13.discriminatedUnion("kind", [
  z13.object({
    kind: z13.literal("link"),
    url: z13.string(),
    label: z13.string().optional()
  }),
  z13.object({
    kind: z13.literal("video"),
    url: z13.string(),
    start_seconds: z13.number().int().min(0).optional()
  }),
  z13.object({
    kind: z13.literal("audio"),
    url: z13.string(),
    title: z13.string().optional()
  }),
  z13.object({
    kind: z13.literal("image"),
    url: z13.string(),
    alt_text: z13.string()
  }),
  z13.object({
    kind: z13.literal("block"),
    block_id: z13.string().min(1)
  })
]);
var AnthologyTagSchema = z13.object({
  include: z13.boolean(),
  themes: z13.array(z13.string().trim().max(40)).max(8).default([]),
  concepts: z13.array(z13.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z13.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z13.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z13.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z13.enum(["text", "custom"]).default("text"),
  anchor_order: z13.array(z13.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z13.object({
  w: z13.string(),
  start: z13.number(),
  end: z13.number()
});
var AnnotationVoiceClipSchema = z13.object({
  id: z13.string().min(1),
  start_s: z13.number(),
  end_s: z13.number(),
  word_range: z13.tuple([z13.number().int().min(0), z13.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z13.enum(["tap", "quote", "ai", "manual"]),
  confidence: z13.number().min(0).max(1),
  approved: z13.boolean(),
  transcript_text: z13.string()
});
var AnnotationVoiceTrackSchema = z13.object({
  id: z13.string().min(1),
  layer_id: z13.string().min(1),
  kind: z13.enum(["reading", "think_aloud", "feedback"]),
  title: z13.string().min(1),
  audio: z13.object({
    media_id: z13.string().optional(),
    url: z13.string().min(1),
    duration_s: z13.number().min(0),
    mime: z13.string().min(1)
  }),
  transcript: z13.object({
    words: z13.array(AnnotationVoiceWordSchema),
    timing: z13.enum(["word", "segment", "estimated"])
  }),
  taps: z13.array(
    z13.object({
      t: z13.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z13.array(AnnotationVoiceClipSchema).default([]),
  status: z13.enum(["draft", "published"]),
  extras: z13.array(
    z13.object({
      id: z13.string().min(1),
      kind: z13.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z13.string(),
      approved: z13.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z13.object({
  id: z13.string().min(1),
  layer_id: z13.string().min(1),
  sublayer_id: z13.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z13.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  code: AnnotationCodeRefSchema.optional(),
  body: z13.object({
    html: z13.string(),
    attachments: z13.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z13.ZodIssueCode.custom,
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
      code: z13.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z13.ZodIssueCode.custom,
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
      code: z13.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z13.object({
  show_markers: z13.boolean().default(true),
  default_layer_id: z13.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z13.union([z13.literal(0), z13.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z13.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationExemplarQuestionSchema = z13.object({
  id: z13.string().min(1).max(40),
  kind: z13.enum(["what", "why", "how"]),
  text: z13.string().trim().max(300)
});
var AnnotationExemplarSchema = z13.object({
  kind: z13.enum(["single", "compare", "counter"]),
  /** What the exemplar shows, e.g. "a topic sentence that argues". */
  focus: z13.string().trim().max(120).optional(),
  labels: z13.array(z13.string().trim().max(40)).max(2).default([]),
  split_at: z13.string().min(1).optional(),
  hide_labels: z13.boolean().default(false),
  questions: z13.array(AnnotationExemplarQuestionSchema).max(8).default([])
});
var AnnotationBlockObjectSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("annotation"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().optional(),
    attribution: z13.string().optional(),
    text: AnnotationTextSchema,
    layers: z13.array(AnnotationLayerSchema).default([]),
    annotations: z13.array(AnnotationItemSchema).default([]),
    voice_tracks: z13.array(AnnotationVoiceTrackSchema).optional(),
    anthology: AnthologyTagSchema.optional(),
    exemplar: AnnotationExemplarSchema.optional(),
    settings: AnnotationBlockSettingsSchema.prefault({ show_markers: true })
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
        code: z13.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z13.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
var EXPLAINER_MAX_SECONDS = 600;
var ExplainerMarkStyleSchema = z13.enum(["highlight", "underline", "box", "bracket", "strike"]);
var explainerEventBase = {
  id: z13.string().min(1).max(60),
  t: z13.number().min(0)
};
var ExplainerMarkEventSchema = z13.object({
  ...explainerEventBase,
  kind: z13.literal("mark"),
  style: ExplainerMarkStyleSchema,
  colour: AnnotationColourSchema.optional(),
  anchor: AnnotationAnchorSchema
});
var ExplainerNoteEventSchema = z13.object({
  ...explainerEventBase,
  kind: z13.literal("note"),
  anchor: AnnotationAnchorSchema,
  html: z13.string().max(4e3).default(""),
  tray_id: z13.string().max(60).optional()
});
var ExplainerEraseEventSchema = z13.object({
  ...explainerEventBase,
  kind: z13.literal("erase"),
  target: z13.string().min(1).max(60)
});
var ExplainerPointerEventSchema = z13.object({
  ...explainerEventBase,
  kind: z13.literal("pointer"),
  pane: z13.enum(["text", "board"]),
  samples: z13.array(z13.union([z13.tuple([z13.number(), z13.number()]), z13.tuple([z13.number(), z13.number(), z13.number()])])).max(2e4).default([])
});
var ExplainerPauseEventSchema = z13.object({
  ...explainerEventBase,
  kind: z13.literal("pause"),
  prompt: z13.string().max(500).default("")
});
var ExplainerBoardElementSchema = z13.looseObject({
  id: z13.string().min(1).max(80),
  type: z13.string().min(1).max(40),
  version: z13.number().optional(),
  isDeleted: z13.boolean().optional()
});
var ExplainerBoardEventSchema = z13.object({
  ...explainerEventBase,
  kind: z13.literal("board"),
  elements: z13.array(ExplainerBoardElementSchema).max(500).default([])
});
var ExplainerStrokeEventSchema = z13.object({
  ...explainerEventBase,
  kind: z13.literal("stroke"),
  element: ExplainerBoardElementSchema,
  offsets: z13.array(z13.number().min(0)).max(2e4).default([])
});
var ExplainerSendEventSchema = z13.object({
  ...explainerEventBase,
  kind: z13.literal("send"),
  anchor: AnnotationAnchorSchema,
  element: ExplainerBoardElementSchema
});
var ExplainerEventSchema = z13.discriminatedUnion("kind", [
  ExplainerMarkEventSchema,
  ExplainerNoteEventSchema,
  ExplainerEraseEventSchema,
  ExplainerPointerEventSchema,
  ExplainerPauseEventSchema,
  ExplainerBoardEventSchema,
  ExplainerStrokeEventSchema,
  ExplainerSendEventSchema
]);
var ExplainerClipSchema = z13.object({
  media_id: z13.string().optional(),
  url: z13.string().min(1),
  mime: z13.string().min(1),
  start_s: z13.number().min(0),
  duration_s: z13.number().min(0)
});
var ExplainerTranscriptSchema = z13.object({
  words: z13.array(AnnotationVoiceWordSchema),
  timing: z13.enum(["word", "segment", "estimated"])
});
var ExplainerRecordingSchema = z13.object({
  status: z13.enum(["draft", "published"]).default("draft"),
  clips: z13.array(ExplainerClipSchema).max(200).default([]),
  duration_s: z13.number().min(0).max(EXPLAINER_MAX_SECONDS),
  transcript: ExplainerTranscriptSchema.optional(),
  events: z13.array(ExplainerEventSchema).max(5e3).default([])
});
var ExplainerTrayNoteSchema = z13.object({
  id: z13.string().min(1).max(60),
  html: z13.string().max(4e3).default("")
});
var ExplainerBoardSceneSchema = z13.object({
  format: z13.literal("excalidraw"),
  version: z13.literal(1),
  elements: z13.array(ExplainerBoardElementSchema).max(2e3).default([]),
  appState: z13.object({ viewBackgroundColor: z13.string().max(40).optional() }).default({}),
  files: z13.record(z13.string(), z13.unknown()).default({})
});
var ExplainerLayoutSchema = z13.enum(["text", "board", "both"]);
var ExplainerBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("explainer"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().max(200).optional(),
    layout: ExplainerLayoutSchema.default("text"),
    text: AnnotationTextSchema.optional(),
    tray: z13.array(ExplainerTrayNoteSchema).max(60).default([]),
    /** The board's starting picture (an Excalidraw scene), drawn before recording. */
    board_start: ExplainerBoardSceneSchema.optional(),
    recording: ExplainerRecordingSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CJ_DEFAULT_CRITERION = "Which answer is stronger overall?";
var CJ_DEFAULT_CHIPS = ["Precise quote", "Clear argument", "Analyses effect"];
var CjSourceSchema = z13.object({
  /** '' = this lesson. */
  lesson_id: z13.string().max(80).default(""),
  block_id: z13.string().max(80).default(""),
  question_id: z13.string().max(80).default("")
});
var CjCalibrationSchema = z13.object({
  id: z13.string().min(1).max(60),
  left: z13.string().max(4e3).default(""),
  right: z13.string().max(4e3).default(""),
  better: z13.enum(["left", "right"]).default("left"),
  reason: z13.string().max(300).default("")
});
var CjAnchorSchema = z13.object({
  id: z13.string().min(1).max(60),
  text: z13.string().max(4e3).default(""),
  mark: z13.number().min(0).max(100).nullable().default(null)
});
var ComparativeJudgementBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("comparative_judgement"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string().max(200).optional(),
    source: CjSourceSchema.default({ lesson_id: "", block_id: "", question_id: "" }),
    criterion: z13.string().max(300).default(CJ_DEFAULT_CRITERION),
    chips: z13.array(z13.string().max(40)).max(8).default(CJ_DEFAULT_CHIPS),
    calibration: z13.array(CjCalibrationSchema).max(3).default([]),
    anchors: z13.array(CjAnchorSchema).max(6).default([]),
    per_student: z13.number().int().min(4).max(20).default(8),
    show_third: z13.boolean().default(false),
    teacher_weight: z13.union([z13.literal(1), z13.literal(2), z13.literal(3)]).default(2),
    downweight_misfits: z13.boolean().default(true),
    out_of: z13.number().min(1).max(100).default(20)
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineExplainerRecording(block, ctx) {
  const rec = block.content.recording;
  if (!rec) return;
  let prev = 0;
  for (const [index, ev] of rec.events.entries()) {
    if (ev.t < prev) {
      ctx.addIssue({
        code: z13.ZodIssueCode.custom,
        message: "explainer events must be sorted by t",
        path: ["content", "recording", "events", index, "t"]
      });
    }
    if (ev.t > rec.duration_s + 1e-6) {
      ctx.addIssue({
        code: z13.ZodIssueCode.custom,
        message: "explainer event is after the end of the recording",
        path: ["content", "recording", "events", index, "t"]
      });
    }
    if (ev.kind === "stroke") {
      const points = ev.element.points;
      if (Array.isArray(points) && points.length !== ev.offsets.length) {
        ctx.addIssue({
          code: z13.ZodIssueCode.custom,
          message: "a stroke needs one time offset for each point",
          path: ["content", "recording", "events", index, "offsets"]
        });
      }
    }
    prev = Math.max(prev, ev.t);
  }
}
function toolkitBlockSchema(blockType, content) {
  return z13.object({
    id: z13.string().min(1),
    type: z13.literal("block"),
    block_type: z13.literal(blockType),
    variant: z13.string().default("medium"),
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
var TeacherNoteBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("teacher_note"),
  variant: z13.string().default("medium"),
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
  DoneBlockSchema,
  BrainstormBlockSchema,
  HingeQuestionBlockSchema,
  ExplainerBlockSchema,
  ComparativeJudgementBlockSchema,
  ContinuumLineBlockSchema,
  DiamondNineBlockSchema,
  VennBlockSchema,
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
var SpacerBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("spacer"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z13.lazy(
  () => z13.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z13.array(
  z13.object({
    width: z13.number().int().min(1).max(12),
    blocks: z13.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z13.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("columns"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z13.lazy(
  () => z13.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("tabs"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    tabs: z13.array(
      z13.object({
        id: z13.string().min(1),
        label: z13.string(),
        blocks: z13.array(TabChildBlockSchema),
        /** Choice board: the tile's level, 1 Core, 2 Stretch, 3 Challenge. */
        tier: z13.number().int().min(1).max(3).optional(),
        /** Choice board: the kind of task, e.g. Write, Analyse, Create. */
        kind: z13.string().max(40).optional()
      })
    ).min(2).max(9),
    /** Absent means tabs; folds shows each panel as a fold-out; choice shows them as a choice board. */
    style: z13.enum(["tabs", "folds", "choice"]).optional(),
    /** Choice board settings, kept when switching style away and back. */
    choice: z13.object({
      /** How many tiles each student picks. */
      pick: z13.number().int().min(1).max(9).default(3),
      /** Tiles per row. */
      columns: z13.number().int().min(2).max(4).default(3),
      /** each_column: at least one pick in every column. line: a full row, column or diagonal (3 × 3 only). */
      rule: z13.enum(["none", "each_column", "line"]).default("none")
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionInnerChildBlockSchema = z13.lazy(
  () => z13.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SidePathSectionSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("section"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string(),
    collapsed_in_editor: z13.boolean().optional(),
    blocks: z13.array(SectionInnerChildBlockSchema),
    side_path: z13.literal(true),
    narration: NarrationSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z13.lazy(
  () => z13.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema,
    SidePathSectionSchema
  ])
);
var SectionLinkSchema = z13.object({
  mode: z13.literal("linked"),
  source_composition_id: z13.string().min(1)
});
var GroupSetSchema = z13.object({
  group_id: z13.string().min(1).max(64),
  class_id: z13.string().min(1).max(64),
  name: z13.string().min(1).max(120),
  tags: z13.array(z13.string().min(1).max(120)).min(1).max(8),
  students: z13.array(z13.string().min(1).max(64)).max(60),
  target: z13.number().int().min(1).max(10)
});
var SectionBlockObjectSchema = z13.object({
  id: z13.string().min(1),
  type: z13.literal("block"),
  block_type: z13.literal("section"),
  variant: z13.string().default("medium"),
  visibility: VisibilitySchema,
  content: z13.object({
    title: z13.string(),
    collapsed_in_editor: z13.boolean().optional(),
    blocks: z13.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional(),
    /** Lecture: the chapter intro clip. */
    narration: NarrationSchema.optional(),
    /** Lecture: a "write it in your book" cue at the chapter's end. On unless `enabled: false`. */
    takeaway: z13.object({ enabled: z13.boolean(), prompt: z13.string().max(300).optional() }).optional(),
    /** Lecture: plays only after a wrong answer on the gate just above it. */
    side_path: z13.boolean().optional(),
    /** Tutorial: this top-level section is the tab for the group with this id. */
    tutorial_group: TutorialGroupIdSchema.optional(),
    /** Tutorial: with tutorial_group, this section is that group's exit check (quiz questions). */
    tutorial_exit: z13.boolean().optional(),
    /** Design Sprint: this top-level section holds the guides for one phase. */
    sprint_phase: SprintPhaseKeySchema.optional(),
    /** Design Sprint: this top-level section holds resources that stay with students on every phase. */
    sprint_guides: z13.boolean().optional(),
    /** Case Study: this top-level section holds the Brief's blocks, shown to students above the first-take question. */
    case_brief: z13.boolean().optional(),
    /** Case Study: this top-level section holds one case part's blocks (by part id), shown in the work panel while that part is open. */
    case_part: z13.string().max(40).optional(),
    /** Case Study: this top-level section holds the Outcome's blocks, shown to students once the outcome is out. */
    case_outcome: z13.boolean().optional(),
    /** Station Rotation: this top-level section holds one station's blocks (by station id). */
    rotation_station: z13.string().max(40).optional(),
    /** Station Rotation: this top-level section holds the finale's own blocks. */
    rotation_finale: z13.boolean().optional(),
    /** Quiz: this top-level section is a group set, practice for one markbook group's students only. */
    group_set: GroupSetSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z13.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z13.lazy(
  () => z13.discriminatedUnion("block_type", [
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
    if (block.block_type === "explainer") {
      refineExplainerRecording(block, ctx);
    }
  })
);

// apps/teaching/src/deep/schema.ts
import { z as z14 } from "zod";
var DEEP_LIMITS = { perUnit: 4, pieces: 24, claim: 400, why: 300, piece: 200, fill: 400 };
var PIECE_TARGET = { min: 4, max: 6 };
var PIECE_TARGET_LABEL = `${PIECE_TARGET.min} to ${PIECE_TARGET.max}`;
var TIERS = ["essential", "strong", "sophisticated"];
var DuIdSchema = z14.string().regex(/^du_[a-z0-9]{4,16}$/);
var PieceIdSchema = z14.string().regex(/^kp_[a-z0-9]{4,16}$/);
var ConceptBulletSchema = z14.string().regex(/^[A-Z]{2,5}\d{1,2}$/);
var KnowledgePieceSchema = z14.object({
  id: PieceIdSchema,
  text: z14.string().trim().min(1).max(DEEP_LIMITS.piece),
  tier: z14.enum(TIERS),
  /** The one Understanding dot point this piece builds. Older pieces have none yet; marks on them fall back to the lesson's points. */
  dot_point: DotPointRefSchema.optional()
});
var DeepUnderstandingSchema = z14.object({
  id: DuIdSchema,
  claim: z14.string().trim().max(DEEP_LIMITS.claim),
  why: z14.string().trim().max(DEEP_LIMITS.why).default(""),
  dot_points: z14.array(DotPointRefSchema).min(1).max(8),
  concept_bullets: z14.array(ConceptBulletSchema).min(1).max(8),
  pieces: z14.array(KnowledgePieceSchema).max(DEEP_LIMITS.pieces).default([]),
  /** Pieces owned by another deep understanding in this unit. */
  shared_piece_ids: z14.array(PieceIdSchema).max(DEEP_LIMITS.pieces).default([]),
  steps: z14.array(z14.object({ step: z14.enum(["2a", "2b", "3", "4"]), fill: z14.string().trim().max(DEEP_LIMITS.fill) })).max(4).default([])
});
var DeepUnderstandingDraftSchema = DeepUnderstandingSchema.extend({
  dot_points: z14.array(DotPointRefSchema).max(8),
  concept_bullets: z14.array(ConceptBulletSchema).max(8)
});

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

// apps/teaching/src/case-study/schema.ts
import { z as z15 } from "zod";
var CASE_OUTCOMES = ["transfer", "framework", "decision", "causal"];
var CASE_DOC_KINDS = ["memo", "data", "news", "transcript", "update"];
var Id2 = z15.string().regex(/^[a-z0-9_-]{1,40}$/);
var CaseDocSchema = z15.object({
  id: Id2,
  kind: z15.enum(CASE_DOC_KINDS),
  title: z15.string().max(120),
  /** "Water Authority internal memo, 3 March". Shown under the title. */
  source: z15.string().max(160).default(""),
  /** Plain text; blank lines separate paragraphs. */
  text: z15.string().max(6e3)
});
var CasePartSchema = z15.object({
  id: Id2,
  title: z15.string().max(80),
  docs: z15.array(CaseDocSchema).min(1).max(8),
  /** Layered release only: a short question the student answers before the next part opens. */
  question: z15.string().max(300).optional()
});
var CaseOptionSchema = z15.object({
  id: Id2,
  label: z15.string().max(120),
  detail: z15.string().max(300).optional()
});
var CaseDecisionSchema = z15.object({
  /** The question in the case's voice: "You are the head of the water authority. The dam is at 30%. What do you do?" */
  prompt: z15.string().max(500),
  /** 2 to 4 options for a guided decision; empty means free text (extension). */
  options: z15.array(CaseOptionSchema).max(4).default([])
});
var CaseOutcomeSchema = z15.object({
  /** What actually happened. */
  text: z15.string().max(4e3),
  /** Publish is blocked without it. */
  source: z15.string().max(200),
  /** Own pace only: hold the Outcome until this date (YYYY-MM-DD) so the class sees it together. */
  hold_until: z15.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
var CaseTransferSchema = z15.object({
  title: z15.string().max(120),
  docs: z15.array(CaseDocSchema).min(1).max(4),
  /** Includes "Which rule helped?" in its wording when the teacher wants it. */
  question: z15.string().max(500)
});
var CaseHelpSchema = z15.object({
  do: z15.string().max(300).optional(),
  why: z15.string().max(400).optional(),
  example: z15.string().max(600).optional(),
  stuck: z15.string().max(400).optional()
});
var CaseHelpMap = z15.record(z15.string(), CaseHelpSchema);
var CaseReflectionSchema = z15.object({
  question: z15.string().max(300).default(""),
  off: z15.boolean().default(false)
});
var CASE_PACES = ["teacher", "own"];
var CASE_SUPPORTS = ["guided", "standard", "open"];
var CaseSettingsSchema = z15.object({
  /** Required: "On a case they haven't seen, students will be able to…". */
  purpose: z15.string().max(400).default(""),
  outcomes: z15.array(z15.enum(CASE_OUTCOMES)).max(4).default([]),
  /** Phase 1 builds Flow A only. */
  flow: z15.literal("A").default("A"),
  pace: z15.enum(CASE_PACES).default("teacher"),
  support: z15.enum(CASE_SUPPORTS).default("standard"),
  /** 'whole': every document at once (M2). 'layered': parts open in turn, each with a question (M1). */
  release: z15.enum(["whole", "layered"]).default("whole"),
  parts: z15.array(CasePartSchema).max(4).default([]),
  decision: CaseDecisionSchema.optional(),
  outcome: CaseOutcomeSchema.optional(),
  /** Own pace, optional: up to 3 challenges to the student's locked decision; they answer one before the Outcome opens. */
  objections: z15.array(z15.string().max(300)).max(3).default([]),
  /** The question under the Outcome. Blank keeps the default wording; off drops the step. */
  reflection: CaseReflectionSchema.optional(),
  /** True drops the Rules station: no rule of thumb and no unseen case, so the case ends at the Outcome. */
  rules_off: z15.boolean().optional(),
  transfer: CaseTransferSchema.optional(),
  /** Set when the lesson is a class-bound case; the one class whose roster the initials claim uses. */
  class_id: z15.string().max(64).optional(),
  help: CaseHelpMap.optional()
});
var PublicCaseSchema = z15.object({
  purpose: z15.string().max(400),
  pace: z15.enum(CASE_PACES),
  support: z15.enum(CASE_SUPPORTS),
  release: z15.enum(["whole", "layered"]),
  decision: CaseDecisionSchema,
  /** Part titles only, so the rail can say "Part 2 to come". */
  part_titles: z15.array(z15.string().max(80)).max(4),
  has_objections: z15.boolean(),
  reflection: CaseReflectionSchema.optional(),
  rules_off: z15.boolean().optional(),
  help: CaseHelpMap.optional()
});

// apps/teaching/src/case-study/model.ts
var filled = (s) => !!s && s.trim().length > 0;
var docIssues = (docs) => docs.length > 0 && docs.every((d) => filled(d.title) && filled(d.text));
function caseIssues(lesson) {
  const c = lesson.case;
  if (!c) return ["Set up the case: add a purpose, a case document, a decision and an outcome."];
  const out = [];
  if (!filled(c.purpose)) out.push("Say what students will be able to do on a case they have not seen (Kit).");
  if (c.parts.length === 0 || !c.parts.some((p) => p.docs.length > 0)) out.push("Add at least one case part with a document.");
  else if (c.parts.some((p) => !docIssues(p.docs))) out.push("Every case document needs a title and text.");
  if (!filled(c.decision?.prompt)) out.push("Write the decision question.");
  const options = c.decision?.options.length ?? 0;
  if (c.support === "guided" && (options < 2 || options > 4)) out.push("A guided case needs 2 to 4 options.");
  else if (options === 1) out.push("Add a second option, or remove the first for a free-text decision.");
  if (!filled(c.outcome?.text)) out.push("Write what actually happened (Outcome).");
  if (!filled(c.outcome?.source)) out.push("The outcome needs a source.");
  if (c.release === "layered" && c.parts.slice(0, -1).some((p) => !filled(p.question))) out.push("Layered release needs a question on every part except the last.");
  const t = c.transfer;
  if (!c.rules_off && (!t || !filled(t.title) || !docIssues(t.docs) || !filled(t.question))) out.push("Write the unseen case: a title, a document and a question (Rules).");
  return out;
}

// apps/teaching/src/rotation/schema.ts
import { z as z16 } from "zod";
var ROTATION_KINDS = ["facts", "concepts", "procedures", "analysis", "perspectives", "teacher"];
var ROTATION_DIALS = ["guided", "standard", "open"];
var ROTATION_PATHS = ["fixed", "free_all", "choose_n", "must_may", "unlocks"];
var ROTATION_FALLBACKS = ["choose_n_minus_1", "skip_finale_build", "none"];
var ROTATION_ROLES = ["recall", "goal", "step", "hint", "gate", "after", "done", "exit"];
var DEFAULT_LINK_WORDS = ["causes", "makes worse", "is evidence for", "slows recovery of"];
var DEFAULT_FINALE_FORMATS = ["One-page brief", "Annotated diagram", "Two-minute talk"];
var DEFAULT_DEBRIEF = ["Why did you choose that order? Would you choose it again?", "Which piece changed your explanation the most?"];
var Id3 = z16.string().regex(/^[a-z0-9_-]{1,40}$/);
var WRITTEN_CHECKS = ["technique_named", "exact_quote", "technique_fits", "effect_linked"];
var WrittenGateSchema = z16.object({
  prompt: z16.string().max(600).default(""),
  passage: z16.string().max(4e3).default(""),
  /** One mark per point. */
  marks: z16.number().int().min(1).max(6).default(3),
  /** What each effect must link to: "isolation". */
  idea: z16.string().max(120).default(""),
  checks: z16.array(z16.enum(WRITTEN_CHECKS)).max(4).default(["technique_named", "exact_quote", "technique_fits", "effect_linked"]),
  different_techniques: z16.boolean().default(true),
  pass_at: z16.number().int().min(1).max(6).default(3),
  pass_at_support: z16.number().int().min(1).max(6).optional(),
  /** Optional: quotes the teacher expects and the techniques that fit them. The checker may accept others it can justify. */
  answer_key: z16.array(z16.object({ quote: z16.string().max(400), techniques: z16.array(z16.string().max(80)).max(6) })).max(12).optional(),
  max_checks: z16.number().int().min(1).max(6).default(3),
  /** Teacher only; never sent to students or to the checker. */
  model_answer: z16.string().max(3e3).optional(),
  /** Daily cap per class in A$. At the cap, written gates become teacher checks for the rest of the day. */
  daily_cap_aud: z16.number().min(0).max(50).default(3)
});
var StationSchema = z16.object({
  id: Id3,
  title: z16.string().max(120).default(""),
  kind: z16.enum(ROTATION_KINDS).default("concepts"),
  strand: z16.string().max(40).optional(),
  outcomes: z16.array(z16.string().max(200)).max(6).default([]),
  minutes: z16.number().int().min(1).max(90).default(10),
  seats: z16.number().int().min(1).max(40).default(6),
  /** "Back bench". A QR code links to the station. */
  location: z16.string().max(80).optional(),
  must_do: z16.boolean().optional(),
  unlock_after: z16.array(Id3).max(8).optional(),
  /** One letter or a short code, breakout only. */
  token: z16.string().max(4).optional(),
  /** The evidence card text this station produces. */
  piece: z16.string().max(300).default(""),
  /** Marks an offline station done. */
  offline_code: z16.string().max(20).optional(),
  /** Map position, 0 to 100 each way. Absent: laid out automatically. */
  x: z16.number().min(0).max(100).optional(),
  y: z16.number().min(0).max(100).optional(),
  /** The station's gate, when it is a written answer. A hinge gate is a block in the section instead. */
  written_gate: WrittenGateSchema.optional(),
  /** Teacher station only: what to say to a group sent here, per misconception. */
  script: z16.string().max(600).optional()
});
var PretestItemSchema = z16.object({
  id: Id3,
  station: Id3,
  /** Saved half-written while drafting; publish runs the full check. */
  question: QuizQuestionDraftSchema,
  /** Missing it routes the student to the teacher station. */
  misconception: z16.boolean().optional()
});
var LockOptionSchema = z16.object({ id: Id3, text: z16.string().max(300) });
var LockQuestionSchema = z16.object({
  prompt: z16.string().max(500).default(""),
  options: z16.array(LockOptionSchema).max(5).default([]),
  correct_id: z16.string().max(40).default("")
});
var RotationFinaleSchema = z16.object({
  lock: LockQuestionSchema.optional(),
  /** The build: what students write, with their board's cards and links in place. */
  build_prompt: z16.string().max(400).default("Write your recommendation, using your evidence."),
  formats: z16.array(z16.string().max(60)).max(5).default([...DEFAULT_FINALE_FORMATS]),
  debrief: z16.array(z16.string().max(300)).max(4).default([...DEFAULT_DEBRIEF])
});
var RotationSettingsSchema = z16.object({
  class_id: z16.string().max(64).default(""),
  dial: z16.enum(ROTATION_DIALS).default("standard"),
  /** Extend passed at two stations opens route choice. */
  fade_dial: z16.boolean().default(true),
  path: z16.enum(ROTATION_PATHS).default("free_all"),
  choose_n: z16.number().int().min(1).max(8).optional(),
  evidence: z16.enum(["board", "list"]).default("board"),
  link_words: z16.array(z16.string().min(1).max(40)).min(2).max(6).default([...DEFAULT_LINK_WORDS]),
  stations: z16.array(StationSchema).max(9).default([]),
  pretest: z16.array(PretestItemSchema).max(30).default([]),
  finale: RotationFinaleSchema.default({ build_prompt: "Write your recommendation, using your evidence.", formats: [...DEFAULT_FINALE_FORMATS], debrief: [...DEFAULT_DEBRIEF] }),
  /** Breakout framing; optional. */
  story: z16.object({ title: z16.string().max(120), intro: z16.string().max(800) }).optional(),
  behind_fallback: z16.enum(ROTATION_FALLBACKS).default("choose_n_minus_1"),
  /** Lesson length when it isn't scheduled; the timetable's wins when it is. */
  minutes: z16.number().int().min(10).max(240).optional()
});
var PublicWrittenGateSchema = WrittenGateSchema.pick({ prompt: true, passage: true, marks: true, idea: true, checks: true, different_techniques: true, pass_at: true, pass_at_support: true, max_checks: true });
var PublicStationSchema = StationSchema.omit({ written_gate: true, offline_code: true, script: true }).extend({
  written_gate: PublicWrittenGateSchema.optional(),
  has_offline_code: z16.boolean().optional()
});
var PublicRotationSchema = z16.object({
  dial: z16.enum(ROTATION_DIALS),
  fade_dial: z16.boolean(),
  path: z16.enum(ROTATION_PATHS),
  choose_n: z16.number().int().optional(),
  evidence: z16.enum(["board", "list"]),
  link_words: z16.array(z16.string()),
  stations: z16.array(PublicStationSchema),
  finale: z16.object({
    lock: z16.object({ prompt: z16.string(), options: z16.array(LockOptionSchema) }).optional(),
    build_prompt: z16.string(),
    formats: z16.array(z16.string()),
    debrief: z16.array(z16.string())
  }),
  story: z16.object({ title: z16.string(), intro: z16.string() }).optional(),
  behind_fallback: z16.enum(ROTATION_FALLBACKS),
  pretest_count: z16.number().int()
});

// apps/teaching/src/rotation/rules.ts
function unlockProblems(stations) {
  const ids = new Set(stations.map((s) => s.id));
  const out = [];
  for (const s of stations) {
    if ((s.unlock_after ?? []).some((id) => !ids.has(id))) out.push(`${s.title || "A station"} opens after a station that is no longer in the lesson.`);
    if ((s.unlock_after ?? []).includes(s.id)) out.push(`${s.title || "A station"} can\u2019t open after itself.`);
  }
  const after = new Map(stations.map((s) => [s.id, (s.unlock_after ?? []).filter((id) => ids.has(id) && id !== s.id)]));
  const state = /* @__PURE__ */ new Map();
  let loop = false;
  const visit = (id) => {
    if (state.get(id) === "done" || loop) return;
    if (state.get(id) === "seen") {
      loop = true;
      return;
    }
    state.set(id, "seen");
    for (const next of after.get(id) ?? []) visit(next);
    state.set(id, "done");
  };
  for (const s of stations) visit(s.id);
  if (loop) out.push("The unlocks go round in a loop, so some stations would never open.");
  return out;
}

// apps/teaching/src/rotation/model.ts
var MAX_STATIONS = 8;
var PRETEST_PER_STATION = 3;
var MAX_HINTS = 3;
var rotationStationOf = (b) => b.block_type === "section" && typeof b.content.rotation_station === "string" ? b.content.rotation_station : void 0;
var findStationSection = (blocks, stationId) => blocks.find((b) => rotationStationOf(b) === stationId);
var sectionBlocks = (section) => section?.block_type === "section" ? section.content.blocks : [];
var settingOf = (b, key) => b.settings?.[key];
function roleOf(b) {
  const role = settingOf(b, "rotation_role");
  return typeof role === "string" && ROTATION_ROLES.includes(role) ? role : "step";
}
var isHingeGate = (b) => b.block_type === "hinge_question" && roleOf(b) === "gate";
var filled2 = (s) => !!s && s.trim().length > 0;
var textOf = (b) => {
  if (b.block_type === "rich_text") return String(b.content.html ?? "").replace(/<[^>]+>/g, " ").trim();
  return "x";
};
var name = (s) => s.title.trim() || "A station";
function rotationIssues(lesson) {
  const r = lesson.rotation;
  if (!r) return ["Set up the rotation: add stations, a pretest and a class."];
  const out = [];
  const learning = r.stations.filter((s) => s.kind !== "teacher");
  const teachers = r.stations.filter((s) => s.kind === "teacher");
  if (!filled2(r.class_id)) out.push("Pick the class this rotation is for.");
  if (learning.length < 2) out.push("Add at least 2 stations.");
  if (learning.length > MAX_STATIONS) out.push(`A rotation can have at most ${MAX_STATIONS} stations, plus one teacher station.`);
  if (teachers.length > 1) out.push("Keep to one teacher station.");
  for (const s of r.stations) {
    if (!filled2(s.title)) out.push("Every station needs a title.");
    const section = findStationSection(lesson.blocks, s.id);
    if (!section) {
      out.push(`${name(s)} has no content yet. Open it with Edit.`);
      continue;
    }
    if (s.kind === "teacher") continue;
    const blocks = sectionBlocks(section);
    const goal = blocks.find((b) => roleOf(b) === "goal");
    if (!goal || !textOf(goal)) out.push(`${name(s)} needs a goal.`);
    const exits = blocks.filter((b) => roleOf(b) === "exit" && b.block_type === "quiz_question");
    if (exits.length === 0) out.push(`${name(s)} needs an exit check question.`);
    if (exits.length > 2) out.push(`${name(s)} has more than two exit check questions.`);
    if (blocks.filter((b) => roleOf(b) === "hint").length > MAX_HINTS) out.push(`${name(s)} has more than ${MAX_HINTS} hints.`);
    for (const b of blocks) {
      if (b.block_type !== "quiz_question") continue;
      if (!QuizQuestionSchema.safeParse(b.content.question).success) {
        out.push(`A question at ${name(s)} isn\u2019t finished.`);
        break;
      }
    }
    const hinges = blocks.filter(isHingeGate);
    const gates = hinges.length + (s.written_gate ? 1 : 0);
    if (gates > 1) out.push(`${name(s)} has more than one gate. Keep one.`);
    if (gates === 0 && blocks.some((b) => roleOf(b) === "after")) out.push(`${name(s)} has steps after a gate, but no gate.`);
    for (const h of hinges) {
      if (h.block_type !== "hinge_question") continue;
      const c = h.content;
      if (!filled2(c.prompt) || c.options.length < 2 || !c.options.some((o) => o.id === c.correct_id)) out.push(`The gate at ${name(s)} needs a question, options and a right answer.`);
    }
    if (blocks.some((b) => b.block_type === "quiz_question" && roleOf(b) === "gate")) out.push(`A gate at ${name(s)} must be a hinge question or a written answer.`);
    const g = s.written_gate ? WrittenGateSchema.parse(s.written_gate) : null;
    if (g) {
      if (!filled2(g.passage)) out.push(`The written gate at ${name(s)} needs a passage.`);
      if (!filled2(g.prompt)) out.push(`The written gate at ${name(s)} needs a question.`);
      if (!filled2(g.idea)) out.push(`The written gate at ${name(s)} needs the idea each point links to.`);
      if (g.checks.length === 0) out.push(`The written gate at ${name(s)} needs at least one check.`);
      if (g.pass_at > g.marks || (g.pass_at_support ?? 0) > g.marks) out.push(`The written gate at ${name(s)} can\u2019t pass at more marks than it has.`);
    }
    const asked = r.pretest.filter((p) => p.station === s.id);
    if (asked.length !== PRETEST_PER_STATION) out.push(`${name(s)} needs exactly ${PRETEST_PER_STATION} pretest questions (it has ${asked.length}).`);
    else if (asked.some((p) => !QuizQuestionSchema.safeParse(p.question).success)) out.push(`A pretest question for ${name(s)} isn\u2019t finished.`);
  }
  const orphans = r.pretest.filter((p) => !learning.some((s) => s.id === p.station));
  if (orphans.length) out.push("Some pretest questions belong to a station that is no longer in the lesson.");
  if (r.path === "choose_n" && (!r.choose_n || r.choose_n >= learning.length)) out.push("\u201CChoose some\u201D needs a number smaller than the number of stations.");
  if (r.path === "must_may" && !learning.some((s) => s.must_do)) out.push("Tick at least one must-do station.");
  if (r.path === "unlocks") out.push(...unlockProblems(r.stations));
  if (r.stations.some((s) => filled2(s.token))) {
    const lock = r.finale.lock;
    if (!lock || !filled2(lock.prompt) || lock.options.length < 2 || !lock.options.some((o) => o.id === lock.correct_id)) out.push("A breakout with letters needs a lock question with a right answer (Finale).");
  }
  return [...new Set(out)];
}

// apps/teaching/src/schemas/cover.ts
import { z as z17 } from "zod";
var CoverSchema = z17.object({
  url: z17.string().min(1).optional(),
  media_id: z17.string().min(1).optional(),
  alt_text: z17.string().optional()
}).superRefine((cover, ctx) => {
  if (!cover.url && !cover.media_id) {
    ctx.addIssue({
      code: z17.ZodIssueCode.custom,
      message: "Cover needs a url and/or media_id"
    });
  }
  if (cover.url !== void 0 && !isHttpUrl(cover.url)) {
    ctx.addIssue({
      code: z17.ZodIssueCode.custom,
      path: ["url"],
      message: "Cover url must be http(s)"
    });
  }
});
var CoverPatchSchema = CoverSchema.nullable();

// apps/teaching/src/schemas/source.ts
import { z as z18 } from "zod";
var SourceSchema = z18.object({
  system: z18.literal("notion"),
  page_id: z18.string().min(1).max(64),
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
      const name2 = attr.name.toLowerCase();
      if (name2.startsWith("on")) continue;
      if (!ALLOWED_ATTRS.has(name2)) continue;
      if ((name2 === "href" || name2 === "xlink:href") && !isSafeHref(attr.value)) continue;
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
    const faded = fadedContent(block);
    return faded.gate !== false && fadedWritingSteps(faded).length > 0;
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
  html_app: "Interactive app",
  question_set: "Written questions",
  question_drop: "Students write questions",
  done: "Done",
  brainstorm: "Brainstorm",
  hinge_question: "Hinge question",
  explainer: "Explainer",
  comparative_judgement: "Comparative judgement",
  continuum_line: "Continuum line",
  diamond_nine: "Diamond 9",
  venn: "Two-text Venn",
  curriculum_lines: "Curriculum lines",
  discern_confirm: "Discern Confirm",
  quiz_question: "Quiz question",
  self_check: "Self check",
  note_cue: "Note cue",
  with_teacher: "With teacher",
  faded_example: "Faded example",
  mind_map: "Map",
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
  if (block.block_type === "diamond_nine") {
    const ready = block.content.cards.filter((c) => c.kind === "image" ? c.url?.trim() : c.text.trim()).length;
    if (ready < 9) return `Diamond 9 needs nine cards; ${ready} have words or a picture`;
    if (!block.content.criterion.trim()) return "Diamond 9 needs a criterion to rank by";
  }
  if (block.block_type === "tabs" && block.content.style === "choice") {
    const pick = block.content.choice?.pick ?? 3;
    if (pick > block.content.tabs.length) return `This choice board asks for ${pick} picks but has ${block.content.tabs.length} tiles`;
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
  if (block.block_type === "continuum_line" && !block.content.returns_to) {
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
    if (block.content.oracy === "recite") {
      if (!block.content.recite_text?.trim()) return "Recite blocks need a text to publish";
    } else if (mode !== "listen" && !block.content.prompt?.trim()) {
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
  if (block.block_type === "outcomes" && !block.content.what?.trim()) {
    return "Write what the class is learning in this What, how, why block";
  }
  if (block.block_type === "note_cue" && !block.content.prompt.trim()) {
    return "Write the prompt for this note cue";
  }
  if (block.block_type === "faded_example") {
    const faded = fadedContent(block);
    if (faded.steps.some((s) => !s.extract.trim() || s.answers.some((a) => !a.trim()))) {
      return "Faded example needs an extract and a model answer for every part of every step.";
    }
    const written = new Set(faded.steps.flatMap((s) => s.blanks.map((i) => faded.part_labels[i])));
    if ([...written].some((label) => !faded.criteria[label]?.some((t) => t.trim()))) {
      return "Faded example needs a checklist for every part students write.";
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
var LessonSchema = z19.object({
  ...CommonFields,
  ...TrashFields,
  type: z19.literal("lesson"),
  unit_id: z19.string().min(1),
  sequence: z19.number().int(),
  blocks: z19.array(BlockSchema),
  published_at: IsoDateSchema.optional(),
  cover: CoverSchema.optional(),
  tags: z19.array(z19.string().min(1).max(40)).max(24).optional(),
  author_id: z19.string().min(1).optional(),
  review_status: z19.enum(["needs_review", "none"]).optional(),
  syllabus_outcomes: z19.array(z19.string().min(1).max(32)).max(24).optional(),
  outcome_ids: z19.array(z19.string().min(1).max(64)).max(24).optional(),
  /** Curriculum network: the subject lines this lesson serves, with depth for train and metro. */
  line_stops: z19.array(LineStopSchema).max(16).optional(),
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
  branch_from: z19.string().min(1).max(64).nullable().optional(),
  /** Taught before the unit officially starts: the unit map's weeks count from the first lesson after. */
  pre_unit: z19.boolean().nullable().optional(),
  /** Syllabus dot points this lesson teaches ("human:U2"); its outcomes and concepts follow from the alignment. */
  dot_points: z19.array(DotPointRefSchema).max(20).optional(),
  /** Knowledge pieces this lesson picks from its ticked U points. Teacher-only: they only decide which chips come first. */
  focus_pieces: z19.array(PieceIdSchema).max(24).optional(),
  /** Skills (`strand.sub`) this lesson picks from its ticked R points. Teacher-only, the same. */
  focus_skills: z19.array(z19.string().regex(SkillRefPattern)).max(12).optional(),
  /** What the dot points ask for that this lesson's activities already cover ("outcome:3", "concept:PER2", "process:UND", "skill:analysis"). */
  plan_covered: z19.array(z19.string().regex(/^(outcome|concept|process|skill):[A-Za-z0-9_]{1,40}$/)).max(120).optional(),
  /** Teacher planning metadata; optional for blob/version compatibility. */
  pedagogical_mode: PedagogicalModeSchema.optional(),
  /** Hides the student feedback dot on every block of this lesson. */
  feedback_off: z19.boolean().optional(),
  /** Learning conditions the teacher set aside for this lesson (src/conditions). Teacher-only. */
  conditions_off: z19.array(z19.enum(["activate", "chunks", "check", "worked", "close", "levels"])).max(6).optional(),
  /** The two questions after the finish tick: on or off (default by lesson type), questions left out, and the "still unclear" box. */
  end_questions: z19.object({
    on: z19.boolean().optional(),
    skip: z19.array(z19.string().regex(/^[a-z_]{1,40}$/)).max(12).optional(),
    unclear: z19.boolean().optional()
  }).optional(),
  /** Quiz lessons only: timer, attempts, feedback and other quiz settings. */
  quiz: QuizSettingsSchema.optional(),
  /** Tutorial lessons only: the class and its groups. */
  tutorial: TutorialSettingsSchema.optional(),
  /** Design Sprint lessons only: Kit, phases and groups. */
  sprint: SprintSettingsSchema.optional(),
  /** Case Study lessons only: purpose, documents, decision, outcome and the unseen case. */
  case: CaseSettingsSchema.optional(),
  /** Station Rotation lessons only: stations, pretest, path, dial, evidence board and finale. */
  rotation: RotationSettingsSchema.optional(),
  source: SourceSchema.optional()
});
var PublishableLessonSchema = LessonSchema.superRefine((lesson, ctx) => {
  if (lesson.title.trim().length === 0) {
    ctx.addIssue({
      code: z19.ZodIssueCode.custom,
      message: "Title is required to publish",
      path: ["title"]
    });
  }
  if (lesson.pedagogical_mode === "lecture" || lesson.pedagogical_mode === "design_sprint" || lesson.pedagogical_mode === "case_study") {
    let stray = false;
    visitBlocks(lesson.blocks, (block) => {
      if (block.block_type === "quiz_question") stray = true;
    });
    if (stray) {
      ctx.addIssue({
        code: z19.ZodIssueCode.custom,
        message: "Quiz questions don\u2019t run in a Lecture, Design Sprint or Case Study. Change the lesson type or remove them.",
        path: ["blocks"]
      });
    }
  }
  if (lesson.pedagogical_mode === "tutorial") {
    for (const message of tutorialIssues(lesson)) {
      ctx.addIssue({ code: z19.ZodIssueCode.custom, message, path: ["blocks"] });
    }
  }
  if (lesson.pedagogical_mode === "design_sprint") {
    for (const message of sprintIssues(lesson)) {
      ctx.addIssue({ code: z19.ZodIssueCode.custom, message, path: ["sprint"] });
    }
  }
  if (lesson.pedagogical_mode === "case_study") {
    for (const message of caseIssues(lesson)) {
      ctx.addIssue({ code: z19.ZodIssueCode.custom, message, path: ["case"] });
    }
  }
  if (lesson.pedagogical_mode === "station_rotation") {
    for (const message of rotationIssues(lesson)) {
      ctx.addIssue({ code: z19.ZodIssueCode.custom, message, path: ["rotation"] });
    }
  }
  for (const issue of listPublishBlockIssues(lesson.blocks, { lecture: lesson.pedagogical_mode === "lecture" || lesson.pedagogical_mode === "tutorial" })) {
    ctx.addIssue({
      code: z19.ZodIssueCode.custom,
      message: formatPublishBlockIssue(issue),
      path: ["blocks"]
    });
  }
});

// apps/teaching/src/schemas/unit.ts
import { z as z20 } from "zod";
var WalkthruTieSchema = z20.object({
  technique: z20.string().min(1).max(120),
  kind: z20.enum(["du", "organiser", "block"]),
  ref: z20.string().min(1).max(240),
  how: z20.string().max(200).optional()
});
var UnitSchema = z20.object({
  ...CommonFields,
  ...TrashFields,
  type: z20.literal("unit"),
  year_id: z20.string().min(1),
  subject_id: z20.string().min(1),
  lesson_ids: z20.array(z20.string().min(1)),
  primary_term: z20.number().int().positive().optional(),
  start_date: z20.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z20.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z20.string().optional(),
  cover: CoverSchema.optional(),
  blocks: z20.array(BlockSchema).optional(),
  outcome_ids: z20.array(z20.string().min(1)).max(24).optional(),
  /** Willingham deep understandings: the unit's 3–4 claims and their knowledge pieces (deep/schema.ts). */
  deep_understandings: z20.array(DeepUnderstandingDraftSchema).max(DEEP_LIMITS.perUnit).optional(),
  walkthru_ties: z20.array(WalkthruTieSchema).max(120).optional(),
  /** 'program': same level as a unit, never one of a class's active units. */
  kind: z20.enum(["program"]).optional(),
  source: SourceSchema.optional()
});

// apps/teaching/src/schemas/class.ts
import { z as z21 } from "zod";

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
var ClassTimetableSchema = z21.unknown().transform((value, ctx) => {
  try {
    return validateTimetable(value);
  } catch (error) {
    ctx.addIssue({ code: z21.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Invalid timetable" });
    return z21.NEVER;
  }
});
var ClassHomepageSchema = z21.object({
  announcements: z21.array(BlockSchema),
  resources: z21.array(BlockSchema),
  custom: z21.array(BlockSchema)
});
var ClassStudentSchema = z21.object({
  name: z21.string().min(1).max(80),
  skip_picker: z21.boolean().default(false),
  /** Never changes once saved, so renames keep a student's quiz results. */
  id: z21.string().regex(STUDENT_ID_PATTERN).optional(),
  /** What the student types to take a quiz. Unique within the class. */
  initials: z21.string().regex(INITIALS_PATTERN).optional()
});
var MAX_CLASS_STUDENTS = 60;
var ClassSchema = z21.object({
  ...CommonFields,
  ...TrashFields,
  type: z21.literal("class"),
  code: z21.string().min(1),
  display_name: z21.string().min(1).optional(),
  academic_year: z21.number().int(),
  year_id: z21.string().min(1),
  subject_id: z21.string().min(1),
  active_unit_ids: z21.array(z21.string().min(1)),
  current_unit_id: z21.string().min(1).optional(),
  current_scheduled_lesson_id: z21.string().min(1).optional(),
  meeting_days: z21.array(z21.number().int().min(1).max(7)).optional(),
  timetable: ClassTimetableSchema.optional(),
  homepage: ClassHomepageSchema.optional(),
  cover: CoverSchema.optional(),
  students: z21.array(ClassStudentSchema).max(MAX_CLASS_STUDENTS).optional(),
  source: SourceSchema.optional()
});

// apps/teaching/src/schemas/subject.ts
import { z as z22 } from "zod";
var SubjectSchema = z22.object({
  ...CommonFields,
  type: z22.literal("subject"),
  display_title: z22.string().min(1),
  scope_id: z22.string().min(1).optional(),
  unit_ids: z22.array(z22.string().min(1)),
  outcome_ids: z22.array(z22.string().min(1)),
  class_ids: z22.array(z22.string().min(1)),
  /** Curriculum network lines, in map column order: trains, metro, light rail. */
  network_lines: z22.array(NetworkLineSchema).max(24).optional(),
  /** Drag offsets on the year network, keyed by unit id. */
  network_nudges: NetworkNudgesSchema.optional()
});

// apps/teaching/src/schemas/document.ts
import { z as z23 } from "zod";
var DocumentKindSchema = z23.enum(["syllabus"]);
var DocumentSchema = z23.object({
  ...CommonFields,
  ...TrashFields,
  type: z23.literal("document"),
  kind: DocumentKindSchema,
  subject_id: z23.string().min(1),
  blocks: z23.array(BlockSchema),
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
