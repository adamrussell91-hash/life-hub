import { apiGet, apiPost, apiPatch } from './client';
import type { CareerOverview } from '@/domain/types';

export function getCareer(options: { signal?: AbortSignal } = {}): Promise<CareerOverview> {
  return apiGet('/api/career', { signal: options.signal });
}

export function listAchievements(options: { signal?: AbortSignal } = {}) {
  return apiGet('/api/career-achievements', { signal: options.signal });
}

export function createAchievement(body: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
  return apiPost('/api/career-achievements', body, { signal: options.signal });
}

export function updateAchievement(
  id: string,
  body: Record<string, unknown>,
  options: { signal?: AbortSignal } = {}
) {
  return apiPatch(`/api/career-achievements?id=${encodeURIComponent(id)}`, body, {
    signal: options.signal
  });
}

export function listFutures(options: { signal?: AbortSignal } = {}) {
  return apiGet('/api/career-futures', { signal: options.signal });
}

export function createFuture(body: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
  return apiPost('/api/career-futures', body, { signal: options.signal });
}

export function updateFuture(
  id: string,
  body: Record<string, unknown>,
  options: { signal?: AbortSignal } = {}
) {
  return apiPatch(`/api/career-futures?id=${encodeURIComponent(id)}`, body, {
    signal: options.signal
  });
}

export function listStones(options: { signal?: AbortSignal } = {}) {
  return apiGet('/api/career-stones', { signal: options.signal });
}

export function createStone(body: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
  return apiPost('/api/career-stones', body, { signal: options.signal });
}

export function updateStone(
  id: string,
  body: Record<string, unknown>,
  options: { signal?: AbortSignal } = {}
) {
  return apiPatch(`/api/career-stones?id=${encodeURIComponent(id)}`, body, {
    signal: options.signal
  });
}

export function listScanProposals(options: { signal?: AbortSignal } = {}) {
  return apiGet('/api/career-scan', { signal: options.signal });
}

export function runCareerScan(options: { signal?: AbortSignal } = {}) {
  return apiPost('/api/career-scan?action=run-now', {}, { signal: options.signal });
}

export function keepScanProposal(
  id: string,
  body: Record<string, unknown> = {},
  options: { signal?: AbortSignal } = {}
) {
  return apiPost('/api/career-scan?action=keep', { id, ...body }, { signal: options.signal });
}

export function binScanProposal(id: string, options: { signal?: AbortSignal } = {}) {
  return apiPost('/api/career-scan?action=bin', { id }, { signal: options.signal });
}

export function listCareerMoves(options: { signal?: AbortSignal } = {}) {
  return apiGet('/api/career-moves', { signal: options.signal });
}

export function getAchievement(id: string) {
  return apiGet<{ achievement: import('@/views/career-skill-form').SkillCard }>(`/api/career-achievements?id=${encodeURIComponent(id)}`);
}

export type HistoryMonths = 6 | 12 | 24 | 36;
export type HistoryEstimate = {
  sources: number;
  batches: number;
  cost_aud: number;
  by_kind?: Record<string, number>;
};
export type HistoryStatus = {
  status: 'idle' | 'running' | 'done' | 'stopped' | 'failed';
  batch: number;
  batches: number;
  proposals_added?: number;
  message?: string;
};

/** Counts what a history scan would read. No model call. */
export function estimateHistoryScan(months: HistoryMonths) {
  return apiPost<HistoryEstimate>('/api/career-scan?action=history_estimate', { months });
}

export function startHistoryScan(months: HistoryMonths) {
  return apiPost<HistoryStatus>('/api/career-scan?action=history_start', { months });
}

export function historyScanStatus() {
  return apiGet<HistoryStatus>('/api/career-scan?action=history_status');
}

export function stopHistoryScan() {
  return apiPost<HistoryStatus>('/api/career-scan?action=history_stop', {});
}
