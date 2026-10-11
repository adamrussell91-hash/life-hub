import {apiGet} from '@/api/client';
import type {GroveBookInput} from './wildlife';
/** Read the existing Bookshelf store; task titles and reading pages never imply completion. */
export async function groveBooks():Promise<GroveBookInput[]> {
  const shelf=await apiGet<{books?:GroveBookInput[]}>('/api/knowledge/shelf', {signal:AbortSignal.timeout(3000)});
  return Array.isArray(shelf.books)?shelf.books:[];
}
