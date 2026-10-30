import type { Origin } from "../domain/page";
import { mergeOrigins, normalizeOrigins, pageOrigins } from "./normalize";
type NotesPlaceKind = "notebook" | "book" | "pd";

/** Recovered Notion place map: label → Notion page ids, per kind. */
export type NotesPlace = Record<NotesPlaceKind, Record<string, string[]>>;

const KINDS: NotesPlaceKind[] = ["notebook", "book", "pd"];

/** Pull a Notion page hex out of a bare id, dashed UUID, page_notion_* id, or URL. */
export function extractNotionHex(value: string | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  const prefixed = lower.match(/page_notion_([0-9a-f]{32})/);
  if (prefixed?.[1]) return prefixed[1];
  const dashed = lower.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (dashed) return dashed[0].replace(/-/g, "");
  const compact = lower.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/.test(compact)) return compact;
  const embedded = lower.match(/[0-9a-f]{32}/g);
  return embedded?.[embedded.length - 1] ?? null;
}

/*
 * Which notes came from which notebook, book or PD event is personal (the PD list is a record of
 * what Adam attended), so the map lives in the private data repo (data/knowledge/notes-place.json)
 * and is installed at runtime by `loadPrivateSources()`. Until then no pills are recovered.
 */
const byId = new Map<string, Origin[]>();
let notebookLabels: string[] = [];

/** Replace the installed map. Malformed entries are skipped. */
export function installNotesPlace(data?: Partial<Record<NotesPlaceKind, unknown>> | null) {
  byId.clear();
  notebookLabels = [];
  for (const kind of KINDS) {
    const group = data?.[kind];
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;
    for (const [label, ids] of Object.entries(group as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      if (kind === "notebook") notebookLabels.push(label);
      for (const id of ids) {
        const hex = typeof id === "string" ? extractNotionHex(id) : null;
        if (!hex) continue;
        const list = byId.get(hex) ?? [];
        list.push({ kind, label });
        byId.set(hex, list);
      }
    }
  }
}

/** Notebook labels from the installed map, in its order. */
export function installedNotebooks(): string[] {
  return [...notebookLabels];
}

/** Recovered Notion notebook / book / PD pills, keyed by Notion page hex. */
export function originsFromNotesPlace(sourceNotionId?: string): Origin[] {
  const hex = extractNotionHex(sourceNotionId);
  if (!hex) return [];
  return normalizeOrigins(byId.get(hex) ?? []);
}

/** Stored pills plus recovered notebook / book / PD from the page’s Notion id. */
export function resolvedOrigins(page: {
  id?: string;
  origins?: Origin[];
  source_notion_id?: string;
  source_notion_url?: string;
}): Origin[] {
  return mergeOrigins(
    pageOrigins(page),
    originsFromNotesPlace(page.source_notion_id),
    originsFromNotesPlace(page.id),
    originsFromNotesPlace(page.source_notion_url),
  );
}
