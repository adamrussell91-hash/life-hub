// Food places around a point, from Photon (OpenStreetMap). Shared by
// /api/food-places and the venue backfill script.
const PHOTON = "https://photon.komoot.io";
const USER_AGENT = "LifeHubFood/1 (+https://life-hub.adam-russell.com)";
export const FOOD_TAGS = [
  "amenity:restaurant",
  "amenity:cafe",
  "amenity:fast_food",
  "amenity:pub",
  "amenity:bar",
  "amenity:ice_cream",
  "amenity:food_court",
  "amenity:biergarten",
  "shop:bakery",
];

function streetLine(p) {
  const road = [p.housenumber, p.street].filter(Boolean).join(" ");
  const area = p.district || p.locality || p.city || "";
  return [road, area].filter(Boolean).join(", ");
}
function asPlace(feature) {
  const p = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [];
  return { name: p.name || "", address: streetLine(p), lat, lon };
}
async function photon(path, params, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${PHOTON}${path}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok)
      throw Object.assign(new Error("Place search is unavailable."), {
        code: "upstream_unavailable",
      });
    return (await response.json()).features || [];
  } finally {
    clearTimeout(timer);
  }
}
const foodParams = (extra) => {
  const params = new URLSearchParams(extra);
  for (const tag of FOOD_TAGS) params.append("osm_tag", tag);
  return params;
};

// candidates: food places within ~250 m, plus places matching `q` nearby.
// street: the street address at the point itself.
export async function lookupFoodPlaces(
  { lat, lon, q = "", street = true },
  { fetchImpl = fetch, timeoutMs = 8000 } = {},
) {
  const opts = { fetchImpl, timeoutMs };
  const at = { lat: String(lat), lon: String(lon) };
  const [around, named, here] = await Promise.all([
    photon("/reverse", foodParams({ ...at, radius: "0.25", limit: "20" }), opts),
    q.trim()
      ? photon("/api/", foodParams({ q: q.trim(), ...at, limit: "8", lang: "en" }), opts)
      : [],
    street ? photon("/reverse", new URLSearchParams({ ...at, limit: "1" }), opts) : [],
  ]);
  const candidates = [...around, ...named].map(asPlace).filter((p) => p.name);
  const p = here[0]?.properties || {};
  return { candidates, street: p.street ? streetLine(p) : "" };
}
