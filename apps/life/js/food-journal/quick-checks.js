// Quick checks: answers prepared in advance for visits with an unsure venue
// and dishes with no cuisine or tags. Pure: the page, the server, the export
// script and the batch checker all share it.
//
// Codex writes the checks to private batch files. Adam answers them, and the
// answers reach the journal later. Each check keeps the values it was prepared
// against, so an answer never lands on a visit that has changed since.
import { withoutDeleted } from "../../../../packages/design-kit/js/record-liveness.js";
import {
  hasPoint,
  looksLikeAddress,
  metresBetween,
  NEAR_METRES,
  settleVenue,
} from "./venue-match.js";

export const CHECK_ID = /^chk_[a-z0-9_-]{1,60}$/;
const EVIDENCE_KINDS = ["note", "photo", "map", "web", "dayone"];
const MAX_GROUP = 40;
const MAX_ALTERNATIVES = 4;
const MAX_TAGS = 5;

const liveVisit = (journal, id) =>
  withoutDeleted(journal.visits).find((v) => v.id === id);
const liveDish = (journal, visitId, dishId) =>
  withoutDeleted(liveVisit(journal, visitId)?.dishes || []).find(
    (d) => d.id === dishId,
  );

const numberOrNull = (n) => (Number.isFinite(n) ? n : null);
function sameVenue(before, venue) {
  return (
    (before?.name || "") === (venue?.name || "") &&
    (before?.address || "") === (venue?.address || "") &&
    numberOrNull(before?.lat) === numberOrNull(venue?.lat) &&
    numberOrNull(before?.lon) === numberOrNull(venue?.lon)
  );
}
const tagKey = (tags) => [...(tags || [])].sort().join("|");
const sameDish = (before, dish) =>
  (before?.cuisine || "") === (dish?.cuisine || "") &&
  tagKey(before?.tags) === tagKey(dish?.tags);
const settled = (visit) => visit?.venue?.match?.basis === "picked";

// Rating cards need no batch: every live dish with no rating is one, newest
// first. Only Adam can answer them, so nothing is suggested. "Can't remember"
// is kept on the dish as rating_unknown, so it is never asked again.
const RATE_PREFIX = "chk_rate_";
export const rateCheckId = (dishId) => RATE_PREFIX + String(dishId);
export const isRateCheck = (id) => String(id || "").startsWith(RATE_PREFIX);
export const unrated = (dish) => dish?.rating == null && dish?.rating_unknown !== true;
export const validRating = (n) =>
  typeof n === "number" && Number.isInteger(n * 2) && n >= 1 && n <= 5;
export function openRatings(journal, answered = new Set()) {
  const cards = [];
  const visits = withoutDeleted(journal.visits).sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  );
  for (const visit of visits)
    for (const dish of withoutDeleted(visit.dishes || [])) {
      if (!unrated(dish)) continue;
      const id = rateCheckId(dish.id);
      if (CHECK_ID.test(id) && !answered.has(id))
        cards.push({ check: { id, kind: "rate" }, visit, dish });
    }
  return cards;
}
function findDish(journal, id) {
  const dishId = id.slice(RATE_PREFIX.length);
  for (const visit of withoutDeleted(journal.visits)) {
    const dish = withoutDeleted(visit.dishes || []).find((d) => d.id === dishId);
    if (dish) return dish;
  }
  return null;
}
// A rating lands only on a dish that is still unrated. Answered again with
// the same value it counts as applied, so a rerun changes nothing.
function applyRating(journal, answer) {
  const dish = findDish(journal, answer.check_id);
  if (!dish) return { applied: 0, held: 1, changed: false };
  const want = answer.pick === "rate" ? answer.rating : null;
  if (!unrated(dish)) {
    const same = want == null ? dish.rating_unknown === true && dish.rating == null : dish.rating === want;
    return same ? { applied: 1, held: 0, changed: false } : { applied: 0, held: 1, changed: false };
  }
  if (want == null) dish.rating_unknown = true;
  else dish.rating = want;
  // The card's "Wrong name?" fix travels with the score.
  if (typeof answer.title === "string") dish.title = answer.title.trim();
  return { applied: 1, held: 0, changed: true };
}

// What still needs an answer, and the live records behind each check. Members
// that changed or were deleted drop out; a check with none left is not asked.
export function openChecks(checks, journal, answered = new Set()) {
  const cards = [];
  for (const check of checks) {
    if (answered.has(check.id)) continue;
    if (check.kind === "venue") {
      const visits = (check.visits || []).flatMap((member) => {
        const visit = liveVisit(journal, member.id);
        return visit && !settled(visit) && sameVenue(member.before, visit.venue)
          ? [{ member, visit }]
          : [];
      });
      if (visits.length) cards.push({ check, visits });
    } else if (check.kind === "dish") {
      const dishes = (check.dishes || []).flatMap((member) => {
        const dish = liveDish(journal, member.visit_id, member.dish_id);
        return dish && sameDish(member.before, dish)
          ? [{ member, dish, visit: liveVisit(journal, member.visit_id) }]
          : [];
      });
      if (dishes.length) cards.push({ check, dishes });
    }
  }
  return cards;
}

// Answers arrive before their check is read, so this checks the shape only.
// applyAnswers holds back anything that does not fit its check.
export function answerProblem(answer) {
  if (!answer || typeof answer !== "object") return "Answer is missing.";
  if (!CHECK_ID.test(answer.check_id || "")) return "Check is not recognised.";
  if (!/^(suggestion|alt:[0-3]|keep|typed|apply|reject|rate|unknown)$/.test(answer.pick || ""))
    return "Answer is not recognised.";
  if ((answer.pick === "rate" || answer.pick === "unknown") !== isRateCheck(answer.check_id))
    return "Answer is not recognised.";
  if (answer.pick === "rate" && !validRating(answer.rating))
    return "Rating must be 1 to 5, in half steps.";
  if (answer.title !== undefined) {
    const title = typeof answer.title === "string" ? answer.title.trim() : "";
    if (!isRateCheck(answer.check_id) || !title || title.length > 200)
      return "Type a dish name under 200 characters.";
  }
  if (answer.pick === "typed") {
    const name = typeof answer.name === "string" ? answer.name.trim() : "";
    if (!name || name.length > 200) return "Type a venue under 200 characters.";
  }
  if (
    answer.exclude != null &&
    (!Array.isArray(answer.exclude) ||
      answer.exclude.length > MAX_GROUP ||
      answer.exclude.some((id) => typeof id !== "string" || id.length > 100))
  )
    return "Answer is not recognised.";
  return null;
}

// The venue an answer chooses, or null when it does not fit the check.
function chosenVenue(check, answer, member) {
  const atPoint = hasPoint(member.point)
    ? { lat: member.point.lat, lon: member.point.lon }
    : {};
  const option =
    answer.pick === "suggestion"
      ? check.suggestion
      : answer.pick?.startsWith("alt:")
        ? check.alternatives?.[Number(answer.pick.slice(4))]
        : null;
  if (option?.name)
    return {
      name: option.name,
      ...(option.address ? { address: option.address } : {}),
      ...(hasPoint(option) ? { lat: option.lat, lon: option.lon } : atPoint),
    };
  if (answer.pick === "typed") return { name: answer.name.trim(), ...atPoint };
  if (answer.pick === "keep") return atPoint;
  return null;
}

// Folds answers into a copy of the journal. Each result says what happened to
// one answer: applied (with how many records), held (the journal moved on) or
// rejected (Adam said no). Running it twice changes nothing the second time.
export function applyAnswers(journal, checks, answers) {
  const next = structuredClone(journal);
  const byId = new Map(checks.map((c) => [c.id, c]));
  const results = [];
  let changed = false;
  for (const answer of answers) {
    const check = byId.get(answer.check_id);
    const exclude = new Set(answer.exclude || []);
    let applied = 0,
      held = 0;
    if (answer.pick === "reject") {
      results.push({ check_id: answer.check_id, pick: answer.pick, outcome: "rejected", applied, held });
      continue;
    }
    if (isRateCheck(answer.check_id)) {
      const r = applyRating(next, answer);
      ({ applied, held } = r);
      changed ||= r.changed;
    } else if (check?.kind === "venue") {
      for (const member of check.visits) {
        if (exclude.has(member.id)) continue;
        const visit = liveVisit(next, member.id);
        const chosen = chosenVenue(check, answer, member);
        if (!visit || !chosen) {
          held++;
        } else if (settled(visit) && visit.venue.name === (chosen.name ?? member.before?.name)) {
          applied++;
        } else if (settled(visit) || !sameVenue(member.before, visit.venue)) {
          held++;
        } else {
          visit.venue = settleVenue(visit.venue, chosen);
          applied++;
          changed = true;
        }
      }
    } else if (check?.kind === "dish" && answer.pick === "apply") {
      const { cuisine = "", tags = [] } = check.suggestion || {};
      for (const member of check.dishes) {
        if (exclude.has(member.dish_id)) continue;
        const dish = liveDish(next, member.visit_id, member.dish_id);
        if (!dish) {
          held++;
        } else if (
          (!cuisine || dish.cuisine === cuisine) &&
          tags.every((t) => dish.tags.includes(t))
        ) {
          applied++;
        } else if (!sameDish(member.before, dish)) {
          held++;
        } else {
          dish.cuisine = dish.cuisine || cuisine;
          dish.tags = [...new Set([...dish.tags, ...tags])];
          applied++;
          changed = true;
        }
      }
    } else {
      held++;
    }
    results.push({
      check_id: answer.check_id,
      pick: answer.pick,
      outcome: applied || !held ? "applied" : "held",
      applied,
      held,
    });
  }
  return { journal: next, results, changed };
}

function evidenceProblems(check, where) {
  const out = [];
  const reason = typeof check.reason === "string" ? check.reason.trim() : "";
  if (!reason || reason.length > 200) out.push(`${where}: reason must be 1 to 200 characters.`);
  if (!Array.isArray(check.evidence) || !check.evidence.length)
    out.push(`${where}: cite at least one piece of evidence.`);
  for (const e of Array.isArray(check.evidence) ? check.evidence : []) {
    if (!EVIDENCE_KINDS.includes(e?.kind))
      out.push(`${where}: evidence kind must be one of ${EVIDENCE_KINDS.join(", ")}.`);
    if (typeof e?.text !== "string" || !e.text.trim() || e.text.length > 300)
      out.push(`${where}: evidence text must be 1 to 300 characters.`);
    if (e?.url != null && !/^https?:\/\//.test(String(e.url)))
      out.push(`${where}: evidence url must be a web address.`);
  }
  return out;
}
function optionProblems(option, where) {
  const out = [];
  const name = typeof option?.name === "string" ? option.name.trim() : "";
  if (!name || name.length > 200) out.push(`${where}: name must be 1 to 200 characters.`);
  else if (looksLikeAddress(name)) out.push(`${where}: "${name}" is an address, not a venue.`);
  if (option?.address != null && (typeof option.address !== "string" || option.address.length > 1000))
    out.push(`${where}: address is invalid.`);
  const coords = [option?.lat, option?.lon].filter((n) => n != null);
  if (coords.length && !hasPoint(option)) out.push(`${where}: give both lat and lon, or neither.`);
  return out;
}
const CHECK_KEYS = {
  venue: ["id", "kind", "visits", "suggestion", "alternatives", "reason", "evidence", "far_reason"],
  dish: ["id", "kind", "dishes", "suggestion", "reason", "evidence"],
};

// Every rule a new batch must pass before Adam sees it. Returns problems.
export function batchProblems(batch, journal, { takenIds = new Set() } = {}) {
  const out = [];
  if (batch?.schema_version !== 1) out.push("schema_version must be 1.");
  if (!Array.isArray(batch?.checks) || !batch.checks.length)
    return [...out, "checks must be a non-empty list."];
  const ids = new Set(takenIds);
  for (const [index, check] of batch.checks.entries()) {
    const where = check?.id || `check ${index + 1}`;
    if (!CHECK_ID.test(check?.id || "")) out.push(`${where}: id must look like chk_name.`);
    else if (ids.has(check.id)) out.push(`${where}: id is already used.`);
    else if (isRateCheck(check.id)) out.push(`${where}: chk_rate_ ids belong to rating cards.`);
    ids.add(check?.id);
    const allowed = CHECK_KEYS[check?.kind];
    if (!allowed) {
      out.push(`${where}: kind must be venue or dish.`);
      continue;
    }
    for (const key of Object.keys(check))
      if (!allowed.includes(key)) out.push(`${where}: field ${key} is not allowed.`);
    out.push(...evidenceProblems(check, where));
    if (check.kind === "venue") out.push(...venueProblems(check, journal, where));
    else out.push(...dishProblems(check, journal, where));
  }
  return out;
}
function venueProblems(check, journal, where) {
  const out = [];
  const members = check.visits;
  if (!Array.isArray(members) || !members.length || members.length > MAX_GROUP)
    return [`${where}: visits must list 1 to ${MAX_GROUP} visits.`];
  out.push(...optionProblems(check.suggestion, `${where} suggestion`));
  const alternatives = check.alternatives ?? [];
  if (!Array.isArray(alternatives) || alternatives.length > MAX_ALTERNATIVES)
    out.push(`${where}: give at most ${MAX_ALTERNATIVES} alternatives.`);
  else
    alternatives.forEach((a, i) => out.push(...optionProblems(a, `${where} alternative ${i + 1}`)));
  const seen = new Set();
  for (const member of members) {
    const visit = liveVisit(journal, member?.id);
    if (!visit) {
      out.push(`${where}: visit ${member?.id} is not in the journal.`);
      continue;
    }
    if (seen.has(member.id)) out.push(`${where}: visit ${member.id} is listed twice.`);
    seen.add(member.id);
    if (settled(visit)) out.push(`${where}: Adam already picked the venue of ${member.id}.`);
    if (!sameVenue(member.before, visit.venue))
      out.push(`${where}: before does not match the journal for ${member.id}.`);
    if (member.point != null && !hasPoint(member.point))
      out.push(`${where}: point for ${member.id} is invalid.`);
    if (
      hasPoint(member.point) &&
      hasPoint(check.suggestion) &&
      metresBetween(member.point, check.suggestion) > NEAR_METRES &&
      !String(check.far_reason || "").trim()
    )
      out.push(`${where}: suggestion is over ${NEAR_METRES} m from ${member.id}; explain in far_reason.`);
  }
  return out;
}
function dishProblems(check, journal, where) {
  const out = [];
  const members = check.dishes;
  if (!Array.isArray(members) || !members.length || members.length > MAX_GROUP)
    return [`${where}: dishes must list 1 to ${MAX_GROUP} dishes.`];
  const cuisine = check.suggestion?.cuisine ?? "";
  const tags = check.suggestion?.tags ?? [];
  if (typeof cuisine !== "string" || cuisine.length > 100) out.push(`${where}: cuisine is invalid.`);
  if (
    !Array.isArray(tags) ||
    tags.length > MAX_TAGS ||
    tags.some((t) => typeof t !== "string" || !t.trim() || t.length > 100)
  )
    out.push(`${where}: give at most ${MAX_TAGS} tags.`);
  else if (!cuisine.trim() && !tags.length) out.push(`${where}: suggest a cuisine or tags.`);
  for (const member of members) {
    const dish = liveDish(journal, member?.visit_id, member?.dish_id);
    if (!dish) {
      out.push(`${where}: dish ${member?.dish_id} is not in the journal.`);
      continue;
    }
    if (!sameDish(member.before, dish))
      out.push(`${where}: before does not match the journal for ${member.dish_id}.`);
    if (cuisine && dish.cuisine && dish.cuisine !== cuisine)
      out.push(`${where}: ${member.dish_id} already has a cuisine; checks only fill blanks.`);
  }
  return out;
}
