import { formatDisplayDate } from "../../../../packages/design-kit/js/format-display-date.js";
import { withoutDeleted } from "../../../../packages/design-kit/js/record-liveness.js";
import { firstSentence, plainNotes } from "./model.js";
import { hasPoint, metresBetween } from "./venue-match.js";
import { openChecks } from "./quick-checks.js";

// Quick check: one prepared answer at a time, moving on the moment it is
// tapped. Answers go to their own small store through an outbox, so a slow
// network never holds up the next card. The journal catches up afterwards.

const OUTBOX_KEY = "fj-quick-check-outbox";
const RETRY_MS = 5000;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function createQuickCheckSession({ api, storage, journal, onChange }) {
  let checks = [],
    loaded = false,
    outbox = readOutbox(),
    flushing = false,
    retry = null,
    problem = "";
  let moved = false;
  const answered = new Set(outbox.map((a) => a.check_id)),
    skipped = [],
    history = [],
    unticked = new Map();

  function readOutbox() {
    try {
      const saved = JSON.parse(storage?.getItem(OUTBOX_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }
  function keepOutbox() {
    try {
      if (outbox.length) storage?.setItem(OUTBOX_KEY, JSON.stringify(outbox));
      else storage?.removeItem(OUTBOX_KEY);
    } catch {
      // Private windows can refuse storage; the outbox still runs in memory.
    }
  }
  function showProblem(text) {
    if (text === problem) return;
    problem = text;
    onChange();
  }
  async function flush() {
    if (flushing) return;
    flushing = true;
    clearTimeout(retry);
    try {
      // Repainting replaces the card, so a save that went fine must not: it
      // would wipe what is being typed on the card now showing.
      while (outbox.length) {
        const answer = outbox[0];
        try {
          await api.answerCheck(answer);
          showProblem("");
        } catch (e) {
          // Refused outright: resending would never work, so hand the card back.
          if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408 && e.status !== 429) {
            answered.delete(answer.check_id);
            problem = e.message;
            onChange();
          } else {
            showProblem("Answers are waiting to save. Keep going; they will retry.");
            retry = setTimeout(() => void flush(), RETRY_MS);
            return;
          }
        }
        // Undo may have taken this answer out while it was on its way.
        if (outbox[0] === answer) outbox.shift();
        keepOutbox();
      }
    } finally {
      flushing = false;
    }
  }
  function cards() {
    const open = openChecks(checks, journal(), answered);
    const later = (card) => skipped.indexOf(card.check.id);
    return [
      ...open.filter((c) => later(c) < 0),
      ...open.filter((c) => later(c) >= 0).sort((a, b) => later(a) - later(b)),
    ];
  }
  return {
    cards,
    // Members unticked on a card, kept if the page repaints under it.
    excluded(id) {
      if (!unticked.has(id)) unticked.set(id, new Set());
      return unticked.get(id);
    },
    get loaded() {
      return loaded;
    },
    get problem() {
      return problem;
    },
    get answeredNow() {
      return history.length;
    },
    get canGoBack() {
      return history.length > 0;
    },
    async load() {
      const data = await api.checks();
      checks = data.checks;
      loaded = true;
      void flush();
      onChange();
    },
    // True once after the card changes, so the page can show the new one's top.
    takeMoved() {
      const was = moved;
      moved = false;
      return was;
    },
    answer(check, answer) {
      const row = { check_id: check.id, ...answer };
      moved = true;
      answered.add(check.id);
      history.push(row);
      outbox.push(row);
      keepOutbox();
      onChange();
      void flush();
    },
    skip(check) {
      skipped.splice(skipped.indexOf(check.id) >>> 0, 1);
      skipped.push(check.id);
      moved = true;
      onChange();
    },
    async back() {
      const row = history.pop();
      if (!row) return;
      // An answer on its way must land, or fail, before it can be taken back.
      while (flushing && outbox[0] === row)
        await new Promise((r) => setTimeout(r, 100));
      const waiting = outbox.indexOf(row);
      if (waiting >= 0) {
        outbox.splice(waiting, 1);
        keepOutbox();
      } else {
        try {
          await api.undoCheck(row.check_id);
        } catch (e) {
          problem = e.message;
          onChange();
          return;
        }
      }
      answered.delete(row.check_id);
      problem = "";
      moved = true;
      onChange();
    },
    // Sends everything and folds it into the journal now. Reports whether the
    // journal changed, so the page can reload it.
    async settle() {
      if (!history.length && !outbox.length) return false;
      await flush();
      if (outbox.length) return false;
      await api.applyChecks();
      history.length = 0;
      return true;
    },
    reset() {
      clearTimeout(retry);
      outbox = [];
      keepOutbox();
      answered.clear();
      skipped.length = 0;
      history.length = 0;
      unticked.clear();
      checks = [];
      loaded = false;
      problem = "";
    },
  };
}

const dateLine = (visit) => formatDisplayDate(visit.date);
function firstPhoto(visit) {
  return withoutDeleted(visit.dishes).flatMap((d) => d.photos || [])[0] || null;
}
function dayOneLink(visit) {
  const uuid = /^dayone:([0-9a-f]{8,64})$/i.exec(visit.source_id || "")?.[1];
  if (!uuid) return null;
  const a = el("a", "fj-check__link", "Open in Day One");
  a.href = `dayone://view?entryId=${uuid}`;
  return a;
}
function why(check) {
  const box = el("div", "fj-check__why");
  box.append(el("p", "fj-meta", check.reason));
  for (const e of check.evidence || [])
    if (/^https?:\/\//.test(e.url || "")) {
      const a = el("a", "fj-check__link", e.text);
      a.href = e.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      box.append(a);
    }
  return box;
}
// Ticked members get the answer; unticked ones keep waiting.
function memberList(rows, excluded) {
  const list = el("ul", "fj-check__members");
  for (const { id, label, sub } of rows) {
    const li = el("li"),
      wrap = el("label", "fj-check__member"),
      tick = el("input");
    tick.type = "checkbox";
    tick.checked = !excluded.has(id);
    tick.addEventListener("change", () => {
      if (tick.checked) excluded.delete(id);
      else excluded.add(id);
    });
    const text = el("span", "fj-check__member-text");
    text.append(el("span", "", label), el("span", "fj-meta", sub));
    wrap.append(tick, text);
    li.append(wrap);
    list.append(li);
  }
  return list;
}
function choice(ctx, number, title, sub, kind, fn) {
  const b = ctx.button("", fn, kind);
  b.classList.add("fj-check__pick");
  b.dataset.key = String(number);
  const main = el("span", "fj-check__pick-main");
  main.append(el("span", "fj-check__key", String(number)), el("span", "", title));
  b.replaceChildren(main);
  if (sub) b.append(el("span", "fj-check__pick-sub", sub));
  return b;
}
function distanceText(option, visits) {
  const from = visits.find(({ member }) => hasPoint(member.point))?.member.point;
  if (!from || !hasPoint(option)) return "";
  return `${Math.round(metresBetween(from, option))} m away`;
}
function venueCard(ctx, session, card, excluded) {
  const { check, visits } = card;
  const first = visits[0].visit;
  const body = el("div", "fj-check__body");
  body.append(
    el("p", "fj-kicker", visits.length > 1 ? `${visits.length} meals, same spot` : dateLine(first)),
    el("h3", "fj-card__title fj-serif", visits.length > 1 ? `Were these all at ${check.suggestion.name}?` : first.title || "Where was this?"),
  );
  const said = visits.length === 1 && firstSentence(plainNotes(first.notes), 220);
  if (said) body.append(el("p", "fj-check__said fj-serif", said));
  const current = first.venue.name;
  body.append(el("p", "fj-meta", `Saved as ${current || "no venue"}`), why(check));
  if (visits.length > 1)
    body.append(
      memberList(
        visits.map(({ visit }) => ({
          id: visit.id,
          label: visit.title || "Untitled meal",
          sub: dateLine(visit),
        })),
        excluded,
      ),
    );
  const send = (pick, extra = {}) =>
    session.answer(check, {
      pick,
      ...extra,
      ...(excluded.size ? { exclude: [...excluded] } : {}),
    });
  const picks = el("div", "fj-check__picks");
  const option = (o) => [o.address, distanceText(o, visits)].filter(Boolean).join(" · ");
  picks.append(choice(ctx, 1, check.suggestion.name, option(check.suggestion), "primary", () => send("suggestion")));
  (check.alternatives || []).forEach((alt, i) =>
    picks.append(choice(ctx, i + 2, alt.name, option(alt), "ghost", () => send(`alt:${i}`))),
  );
  if (current)
    picks.append(
      choice(ctx, (check.alternatives?.length || 0) + 2, `Keep ${current}`, "", "ghost", () => send("keep")),
    );
  const own = el("form", "food-pair food-pair--end food-pair--keep");
  const wrap = el("div", "hub-field"),
    label = el("label", "hub-label", "Somewhere else"),
    input = el("input", "hub-input");
  input.id = `fj-check-${check.id}`;
  label.htmlFor = input.id;
  input.maxLength = 200;
  input.autocomplete = "off";
  wrap.append(label, input);
  const use = ctx.button("Use this venue", () => {}, "secondary");
  use.type = "submit";
  own.append(wrap, use);
  own.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (name) send("typed", { name });
    else input.focus();
  });
  body.append(picks, own);
  return { body, visit: first, photoVisits: visits.map((v) => v.visit) };
}
function dishCard(ctx, session, card, excluded) {
  const { check, dishes } = card;
  const { cuisine = "", tags = [] } = check.suggestion;
  const wanted = [cuisine && `Cuisine: ${cuisine}`, tags.length && `Tags: ${tags.join(", ")}`]
    .filter(Boolean)
    .join(" · ");
  const body = el("div", "fj-check__body");
  body.append(
    el("p", "fj-kicker", dishes.length > 1 ? `${dishes.length} dishes` : dateLine(dishes[0].visit)),
    el("h3", "fj-card__title fj-serif", dishes.length > 1 ? wanted : dishes[0].dish.title || "Untitled dish"),
  );
  if (dishes.length === 1) body.append(el("p", "fj-meta", wanted));
  body.append(why(check));
  if (dishes.length > 1)
    body.append(
      memberList(
        dishes.map(({ dish, visit }) => ({
          id: dish.id,
          label: dish.title || "Untitled dish",
          sub: `${visit.venue.name || "No venue"}, ${dateLine(visit)}`,
        })),
        excluded,
      ),
    );
  const picks = el("div", "fj-check__picks");
  picks.append(
    choice(ctx, 1, dishes.length > 1 ? "Yes to the ticked dishes" : "Yes, add it", "", "primary", () =>
      session.answer(check, { pick: "apply", ...(excluded.size ? { exclude: [...excluded] } : {}) }),
    ),
    choice(ctx, 2, "Not right", "", "ghost", () => session.answer(check, { pick: "reject" })),
  );
  body.append(picks);
  return { body, visit: dishes[0].visit, photoVisits: dishes.map((d) => d.visit) };
}

let keys = null;
export function paintQuickCheck(ctx, host, session) {
  keys?.abort();
  keys = null;
  const cards = session.cards();
  const page = el("section", "fj-fixup fj-check");
  const head = el("header", "fj-fixup__head");
  head.append(
    el("h2", "fj-section__title fj-serif", "Quick check"),
    el(
      "p",
      "fj-meta",
      cards.length
        ? `${cards.length} left. Answers save as you go, then reach the journal in the background.`
        : "All done. Your answers are on their way to the journal.",
    ),
  );
  if (session.problem) {
    const note = el("p", "fj-check__problem", session.problem);
    note.setAttribute("role", "status");
    head.append(note);
  }
  page.append(head);
  const backButton = ctx.button("Back", () => void session.back(), "ghost");
  backButton.disabled = !session.canGoBack;
  if (!cards.length) {
    if (session.canGoBack) page.append(backButton);
    host.append(page);
    return;
  }
  const card = cards[0];
  const excluded = session.excluded(card.check.id);
  const built = (card.check.kind === "venue" ? venueCard : dishCard)(ctx, session, card, excluded);
  const article = el("article", "fj-card fj-card--outline fj-check__card");
  const photos = el("div", "fj-check__photos");
  const shots = [...new Set(built.photoVisits)].map(firstPhoto).filter(Boolean);
  for (const photo of shots.slice(0, 6)) photos.append(ctx.photoNode(photo));
  photos.dataset.count = String(Math.min(shots.length, 6));
  if (shots.length) article.append(photos);
  article.append(built.body);
  const actions = el("div", "food-actions fj-check__actions");
  const skip = ctx.button("Skip for now", () => session.skip(card.check), "ghost");
  actions.append(backButton, skip);
  const link = dayOneLink(built.visit);
  if (link) actions.append(link);
  built.body.append(actions);
  page.append(article);
  host.append(page);
  if (session.takeMoved()) article.scrollIntoView?.({ block: "start" });
  // Sign the next card's photo now so it is there when the answer lands.
  const nextVisit = cards[1]?.visits?.[0]?.visit || cards[1]?.dishes?.[0]?.visit;
  const nextPhoto = nextVisit && firstPhoto(nextVisit);
  if (nextPhoto) ctx.photoNode(nextPhoto);
  // Number keys pick, S skips, B goes back. Typing in the box stays typing.
  keys = new AbortController();
  document.addEventListener(
    "keydown",
    (e) => {
      if (!article.isConnected) return keys?.abort();
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.target?.closest?.("input, textarea, select")) return;
      if (e.key === "s" || e.key === "S") skip.click();
      else if ((e.key === "b" || e.key === "B") && !backButton.disabled) backButton.click();
      else page.querySelector(`.fj-check__pick[data-key="${CSS.escape(e.key)}"]`)?.click();
    },
    { signal: keys.signal },
  );
}
