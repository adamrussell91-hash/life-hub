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

export function draftFuture(body: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
  return apiPost('/api/career-futures?action=draft', body, { signal: options.signal });
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
