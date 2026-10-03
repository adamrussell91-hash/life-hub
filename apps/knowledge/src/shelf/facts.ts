import type { BookFactsInput, Chapter } from "./schema";

type Parsed = { ok: true; facts: Omit<BookFactsInput, "label"> } | { ok: false; error: string };

/** The prompt Adam pastes into ChatGPT. The answer pastes straight back into Book facts. */
export function bookFactsPrompt(label: string, author?: string) {
  return `I own a copy of "${label}"${author ? ` by ${author}` : ""}. Give me its book facts as JSON only, no other text.

Use the edition most readers in Australia would own unless I tell you otherwise, and say which edition in "edition".
Page numbers must be the printed page numbers in that edition.

{
  "label": "${label}",
  "author": "Author name(s)",
  "edition": "Publisher, year, format",
  "pages": 0,
  "chapters": [
    { "label": "1", "title": "Chapter title", "start": 0 }
  ]
}

Rules: "pages" is the last printed page of the main text. List every chapter (and any introduction or prologue, with label "") in order, each with the page it starts on. If you are not sure of a page, give your best estimate rather than leaving it out.`;
}

function json(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1]! : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("There's no JSON object in what you pasted.");
  return JSON.parse(body.slice(start, end + 1));
}

function whole(value: unknown) {
  const n = typeof value === "string" ? Number(value.replace(/[^\d]/g, "")) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Accepts ChatGPT's JSON (fenced or not, with a few common key spellings) and checks it. */
export function parseBookFacts(text: string, label: string): Parsed {
  let raw: Record<string, unknown>;
  try {
    const value = json(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "The pasted JSON should be one object." };
    raw = value as Record<string, unknown>;
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxError ? "That isn't valid JSON. Ask ChatGPT for JSON only and paste it again." : (error as Error).message };
  }
  const pasted = typeof raw.label === "string" ? raw.label.trim().toLowerCase() : "";
  if (pasted && pasted !== label.trim().toLowerCase() && !label.toLowerCase().includes(pasted) && !pasted.includes(label.toLowerCase())) {
    return { ok: false, error: `These facts are for “${raw.label}”, not “${label}”.` };
  }
  const pages = whole(raw.pages ?? raw.page_count ?? raw.pageCount);
  if (raw.pages !== undefined && !pages) return { ok: false, error: "“pages” must be a whole number." };
  const list = Array.isArray(raw.chapters) ? raw.chapters : raw.chapters === undefined ? undefined : null;
  if (list === null) return { ok: false, error: "“chapters” must be a list." };
  let chapters: Chapter[] | undefined;
  if (list) {
    chapters = [];
    for (const [index, item] of list.entries()) {
      const row = (item ?? {}) as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const start = whole(row.start ?? row.page ?? row.start_page ?? row.startPage);
      if (!title || !start) return { ok: false, error: `Chapter ${index + 1} needs a title and a start page.` };
      if (pages && start > pages) return { ok: false, error: `Chapter ${index + 1} (“${title}”) starts on p.${start}, after the last page (${pages}).` };
      const prev = chapters[chapters.length - 1];
      if (prev && start < prev.start) return { ok: false, error: `Chapter ${index + 1} (“${title}”) starts before the chapter above it.` };
      const tag = row.label ?? row.number;
      const chapterLabel = tag === undefined || tag === null ? "" : String(tag).trim();
      chapters.push({ title, start, ...(chapterLabel ? { label: chapterLabel } : {}) });
    }
  }
  const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  return {
    ok: true,
    facts: {
      ...(str(raw.author) ? { author: str(raw.author) } : {}),
      ...(str(raw.edition) ? { edition: str(raw.edition) } : {}),
      ...(pages ? { pages } : {}),
      ...(chapters ? { chapters } : {}),
    },
  };
}
