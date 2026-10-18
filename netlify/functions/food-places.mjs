import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE,
} from "./_shared/travel-http.mjs";
import { checkRateLimit } from "./_shared/travel-rate-limit.mjs";
import { lookupFoodPlaces } from "./_shared/food-places.mjs";
export const config = { path: "/api/food-places" };
// GET ?lat=&lon=&q= → { candidates, street }: food places near where a meal
// was eaten, for Find venue and Check venues.
export function createFoodPlacesHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== "GET")
      return errorResponse(405, "method_not_allowed", "Use GET.", false, PRIVATE_CACHE);
    const key = ctx.session?.token || ctx.session?.id || "anon";
    checkRateLimit(`food-places:${key}`, { now: ctx.now() });
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get("lat")),
      lon = Number(url.searchParams.get("lon"));
    const q = (url.searchParams.get("q") || "").slice(0, 200);
    if (
      !url.searchParams.get("lat") ||
      !url.searchParams.get("lon") ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return errorResponse(400, "validation_error", "A location is required.", false, PRIVATE_CACHE);
    try {
      const found = await lookupFoodPlaces(
        { lat, lon, q },
        { fetchImpl: deps.fetchImpl ?? fetch },
      );
      return okResponse(200, found, PRIVATE_CACHE);
    } catch {
      return errorResponse(
        503,
        "upstream_unavailable",
        "Venue search is unavailable right now. Type the venue instead.",
        true,
        PRIVATE_CACHE,
      );
    }
  }, deps);
}
export default createFoodPlacesHandler();
