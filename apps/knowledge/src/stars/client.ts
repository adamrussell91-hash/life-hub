import type { PageManifestEntry } from "../domain/page";
import type { ResearchResult } from "../research/schema";
import { API_BASE } from "../api/config";
import { USE_LOCAL_DATA, runChat, type ChatPhase } from "../api/client";
import { readApiError, unwrapApiPayload } from "../api/envelope";
import { buildLocalStarsProposal } from "./localProposal";
import {
  SavedConstellationSchema,
  parseStarsProposal,
  type SavedConstellation,
  type StarsProposal,
} from "./schema";

const LOCAL_KEY = "knowledge-hub:stars-preview-v1";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(readApiError(payload, response.status, path));
  return unwrapApiPayload<T>(payload);
}

function localSaved(): SavedConstellation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      const result = SavedConstellationSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function localPlacement(index: number) {
  const angle = index * 2.399963229728653;
  const ring = 0.16 + (index % 5) * 0.055;
  return {
    x: Math.max(0.08, Math.min(0.92, 0.5 + Math.cos(angle) * ring * 1.25)),
    y: Math.max(0.12, Math.min(0.84, 0.48 + Math.sin(angle) * ring)),
    rotation: ((index * 37) % 360) * Math.PI / 180,
    scale: 0.82 + (index % 4) * 0.1,
  };
}

export async function listSavedConstellations(): Promise<SavedConstellation[]> {
  if (USE_LOCAL_DATA) return localSaved();
  const data = await apiFetch<{ constellations: unknown[] }>("/stars");
  return data.constellations.flatMap(item => {
    const parsed = SavedConstellationSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function saveConstellation(proposal: StarsProposal): Promise<SavedConstellation> {
  if (USE_LOCAL_DATA) {
    const current = localSaved();
    const now = new Date().toISOString();
    const saved = SavedConstellationSchema.parse({
      ...proposal,
      id: `stars_${crypto.randomUUID().toLowerCase()}`,
      createdAt: now,
      updatedAt: now,
      sky: localPlacement(current.length),
    });
    localStorage.setItem(LOCAL_KEY, JSON.stringify([saved, ...current]));
    return saved;
  }
  const data = await apiFetch<{ constellation: unknown }>("/stars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposal),
  });
  return SavedConstellationSchema.parse(data.constellation);
}

function pause(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function groundStarsProposal(proposal: StarsProposal, entries: PageManifestEntry[]): StarsProposal {
  const archive = new Map(entries.map(entry => [entry.id, entry]));
  if (proposal.notes.some(note => !archive.has(note.pageId))) {
    throw new Error("Clementine included a note outside the current archive. Try the search again.");
  }
  return {
    ...proposal,
    notes: proposal.notes.map(note => ({
      ...note,
      title: archive.get(note.pageId)!.title,
    })),
  };
}

export async function researchStars(
  query: string,
  entries: PageManifestEntry[],
  onPhase?: (phase: ChatPhase) => void,
): Promise<StarsProposal> {
  if (USE_LOCAL_DATA) {
    onPhase?.({ status: "searching" });
    await pause(180);
    return buildLocalStarsProposal(query, entries);
  }

  let researchSessionId = "";
  let writeSessionId = "";
  let priorResearch: ResearchResult | undefined;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const result = await runChat(
      {
        hat: "stars",
        scope: "standard",
        depth: "iterative",
        messages: [{ role: "user", content: query }],
        researchSessionId: researchSessionId || undefined,
        writeSessionId: writeSessionId || undefined,
        priorResearch,
      },
      onPhase,
    );
    if (result.status === "done" && result.reply) {
      return groundStarsProposal(parseStarsProposal(result.reply), entries);
    }
    if (result.status === "external-unavailable") throw new Error(result.reason || "Stars research failed.");
    researchSessionId = result.status === "researching" ? result.researchSessionId ?? "" : "";
    writeSessionId = result.status === "writing" ? result.writeSessionId ?? "" : "";
    priorResearch = result.research ?? priorResearch;
    if (!researchSessionId && !writeSessionId) throw new Error("Clementine stopped before the constellation was complete.");
    await pause(1600);
  }
  throw new Error("Clementine did not finish this constellation in time.");
}
