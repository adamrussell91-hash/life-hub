import type { AutoApproved, PendingProposal } from "../curator/schema";
import { USE_LOCAL_DATA } from "./client";
import { API_BASE } from "./config";
import { readApiError, unwrapApiPayload } from "./envelope";

export { USE_LOCAL_DATA };

export const WIKI_NEEDS_NETLIFY = "Wiki proposals need the live API (netlify dev or production).";

export type CuratorAction = "approve" | "dismiss" | "approve-all" | "dismiss-all" | "unlink" | "run";

export type CuratorReview = {
  pending: PendingProposal[];
  autoApproved: AutoApproved[];
};

async function wikiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(readApiError(payload, response.status, path));
  }
  return unwrapApiPayload<T>(payload);
}

export async function listCuratorReview(): Promise<CuratorReview> {
  if (USE_LOCAL_DATA) throw new Error(WIKI_NEEDS_NETLIFY);
  const payload = await wikiFetch<{ pending?: PendingProposal[]; autoApproved?: AutoApproved[] }>("/curator");
  return { pending: payload.pending ?? [], autoApproved: payload.autoApproved ?? [] };
}

export async function listCuratorPending(): Promise<PendingProposal[]> {
  return (await listCuratorReview()).pending;
}

export async function curatorAction(
  action: CuratorAction,
  id?: string,
): Promise<{ pending?: PendingProposal[]; autoApproved?: AutoApproved[]; status?: string }> {
  if (USE_LOCAL_DATA) throw new Error(WIKI_NEEDS_NETLIFY);
  return wikiFetch<{ pending?: PendingProposal[]; autoApproved?: AutoApproved[]; status?: string }>("/curator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, id }),
  });
}
