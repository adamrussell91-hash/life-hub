/**
 * In-session Clare schedule-diff ghost overlays for the Tasks calendar.
 * Kit ghosts still load from workflow-state; these helpers keep proposal-scoped
 * preview state for Clare confirm cards (not a second calendar skin).
 */
import type { WorkBlock } from '@/schemas/work-block';

/** Pending schedule-diff ghosts keyed by immutable proposal id (preview only — no write). */
const ghostBlocksByProposalId = new Map<string, WorkBlock[]>();

function rebuildCalendarGhostBlocks(): WorkBlock[] {
  const merged: WorkBlock[] = [];
  for (const blocks of ghostBlocksByProposalId.values()) merged.push(...blocks);
  return merged;
}

let pendingGhostBlocks: WorkBlock[] = [];

/** Replace all ghosts (legacy). Prefer proposal-scoped helpers for Productivity OS. */
export function setCalendarGhostBlocks(blocks: WorkBlock[]): void {
  ghostBlocksByProposalId.clear();
  if (blocks.length) ghostBlocksByProposalId.set('__legacy__', blocks);
  pendingGhostBlocks = rebuildCalendarGhostBlocks();
}

export function setCalendarGhostBlocksForProposal(proposalId: string, blocks: WorkBlock[]): void {
  const id = proposalId.trim();
  if (!id) return;
  if (!blocks.length) ghostBlocksByProposalId.delete(id);
  else ghostBlocksByProposalId.set(id, blocks);
  pendingGhostBlocks = rebuildCalendarGhostBlocks();
}

export function clearCalendarGhostBlocksForProposal(proposalId: string): void {
  const id = proposalId.trim();
  if (!id) return;
  ghostBlocksByProposalId.delete(id);
  pendingGhostBlocks = rebuildCalendarGhostBlocks();
}

export function getCalendarGhostBlocks(): WorkBlock[] {
  return pendingGhostBlocks;
}

export function getCalendarGhostBlocksForProposal(proposalId: string): WorkBlock[] {
  return ghostBlocksByProposalId.get(proposalId.trim()) ?? [];
}
