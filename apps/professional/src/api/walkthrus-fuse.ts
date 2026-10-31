import { apiGet, apiPost } from '@/api/client';
import { normalizeFusions } from '../../../../packages/walkthrus/fusions.mjs';
import type { Fusion } from '../../../../packages/walkthrus/board/fused';

export type { Fusion, FusionDrawing, FusionStep } from '../../../../packages/walkthrus/board/fused';

export interface DrawResult { fusion: Fusion; cost_usd: number | null; failed?: boolean; errors?: string[] }
export interface DrawEstimate { low_aud: number; high_aud: number }

/** Saves the whole fusion list into the board document (the server keeps arrows, picked and the rest). */
export async function saveFusions(fusions: Fusion[]): Promise<Fusion[]> {
  const r = await apiPost<{ board: { fusions?: unknown } }>('/api/walkthrus-board', { fusions });
  return normalizeFusions(r.board.fusions) as Fusion[];
}

/** Asks Claude to draw (or redraw, with a note) one fusion's figure. Can take a while: one or two model calls. */
export function drawFusion(id: string, note?: string): Promise<DrawResult> {
  const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(60_000) : undefined;
  return apiPost<DrawResult>('/api/walkthrus-fusion-draw', { fusion_id: id, ...(note ? { note } : {}) }, { signal });
}

export function loadDrawEstimate(): Promise<DrawEstimate> {
  return apiGet<DrawEstimate>('/api/walkthrus-fusion-draw?estimate=1');
}
