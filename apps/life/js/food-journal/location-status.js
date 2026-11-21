// What the Where step says about a visit's location: is the venue on the
// map, did the photos carry a location, and do the two agree. Pure, so the
// wording is tested without a browser.

import { NEAR_METRES, hasPoint, metresBetween } from "./venue-match.js";

export function formatDistance(metres) {
  if (!Number.isFinite(metres)) return "";
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  const km = metres / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

// photos: { read, located } counts photos inspected this session and those
// that carried GPS. photoGps: the last photo point, or null.
export function locationStatus({ venue = {}, photoGps = null, photos = { read: 0, located: 0 } } = {}) {
  const name = String(venue.name || "").trim();
  const address = String(venue.address || "").trim();
  const pinned = hasPoint(venue);
  const fromPhoto = hasPoint(photoGps);
  const distance = pinned && fromPhoto ? metresBetween(venue, photoGps) : null;

  let tone, title, detail;
  if (pinned && venue.match?.confidence === "check") {
    tone = "warn";
    title = "Venue not confirmed";
    detail = "Tap Find venue and pick the right place.";
  } else if (pinned && distance !== null && distance > NEAR_METRES) {
    tone = "warn";
    title = `On the map, ${formatDistance(distance)} from your photo`;
    detail = "That is a long way from where the photo was taken. Check it is the right place.";
  } else if (pinned) {
    tone = "ok";
    title = distance !== null ? `On the map, ${formatDistance(distance)} from your photo` : "On the map";
    detail = address || "Pinned, no street address saved.";
  } else if (name) {
    tone = "warn";
    title = "Not on the map yet";
    detail = "Tap Find venue and pick it to pin it.";
  } else {
    tone = "muted";
    title = "No venue yet";
    detail = fromPhoto ? "Tap Find venue to see places near your photo." : "Type the venue, or tap Find venue.";
  }

  let photoLine = "";
  if (fromPhoto) photoLine = "Photo location found. Find venue searches around it.";
  else if (photos.read > 0)
    photoLine =
      photos.read === 1
        ? "This photo has no location, so Find venue uses your phone's location."
        : "These photos have no location, so Find venue uses your phone's location.";

  return { pinned, fromPhoto, distance, tone, title, detail, photoLine, showMap: pinned || fromPhoto };
}

// One line for the Check step's place row.
export function pinSummary(venue = {}) {
  if (!hasPoint(venue)) return "Not on the map";
  if (venue.match?.confidence === "check") return "On the map, not confirmed";
  return "On the map";
}
