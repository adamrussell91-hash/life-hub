import { apiGet } from './client';
import type { CareerOverview } from '@/domain/types';

export function getCareer(options: { signal?: AbortSignal } = {}): Promise<CareerOverview> {
  return apiGet('/api/career', { signal: options.signal });
}
