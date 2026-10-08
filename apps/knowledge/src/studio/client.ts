import { API_BASE } from "../api/config";
import { USE_LOCAL_DATA } from "../api/client";
import { readApiError, unwrapApiPayload } from "../api/envelope";
import { applyStudioOp } from "../../../../netlify/functions/_shared/knowledge-studio-ops.mjs";
import { parseStudioData, type StudioData, type StudioStage } from "./schema";

export type StudioOp =
  | { op: "stage"; bookId: string; stage: StudioStage }
  | { op: "idea"; title: string }
  | { op: "link" | "unlink"; bookId: string; chapter: number; ref: string; title?: string; words?: number }
  | { op: "decide"; insightId: string; choice: string };

const LOCAL_KEY = "knowledge-hub:studio-preview-v1";

async function apiFetch(init?: RequestInit): Promise<StudioData> {
  const path = "/studio";
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(readApiError(payload, response.status, path));
  return parseStudioData(unwrapApiPayload<{ studio: unknown }>(payload).studio);
}

// Local preview: start from the seeded data repo copy, keep edits in this browser.
async function readLocal(): Promise<StudioData> {
  try {
    const saved = localStorage.getItem(LOCAL_KEY);
    if (saved) return parseStudioData(JSON.parse(saved));
  } catch {
    // fall through to the seed
  }
  try {
    const response = await fetch("/local-data/studio/books.json");
    if (response.ok) return parseStudioData(await response.json());
  } catch {
    // no seed on this machine
  }
  return parseStudioData({ schema_version: 1, books: [] });
}

export async function getStudio(): Promise<StudioData> {
  return USE_LOCAL_DATA ? readLocal() : apiFetch();
}

export async function changeStudio(op: StudioOp): Promise<StudioData> {
  if (!USE_LOCAL_DATA) {
    return apiFetch({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
  }
  const next = parseStudioData(applyStudioOp(await readLocal(), op, { now: new Date().toISOString() }));
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    // preview only
  }
  return next;
}
