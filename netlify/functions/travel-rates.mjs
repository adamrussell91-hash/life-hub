import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { createRatesClient } from './_shared/travel-rates.mjs';

export const config = { path: '/api/travel-rates' };

export function createTravelRatesHandler(deps = {}) {
  const rates = deps.rates ?? createRatesClient({ fetchImpl: deps.fetchImpl ?? fetch });

  return createTravelOperatorHandler(async (request) => {
    if (request.method !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'Use GET.', false, PRIVATE_CACHE);
    }
    const from = new URL(request.url).searchParams.get('from');
    if (!from) {
      return errorResponse(400, 'validation_error', 'from is required.', false, PRIVATE_CACHE);
    }
    try {
      const quote = await rates.getRate(from);
      return okResponse(200, quote, PRIVATE_CACHE);
    } catch (error) {
      return errorResponse(
        503,
        'upstream_unavailable',
        error.message || 'Exchange rates unavailable.',
        true,
        PRIVATE_CACHE
      );
    }
  }, deps);
}

export default createTravelRatesHandler();
