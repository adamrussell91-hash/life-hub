import { createHubFilter } from "../../../../packages/design-kit/js/hub-filter-menu.js";
import { formatDisplayDate } from "../../../../packages/design-kit/js/format-display-date.js";
import { openMorphingDialog } from "../../../../packages/design-kit/js/morphing-dialog.js";
import {
  createHubList,
  createHubMenuButton,
} from "../../../../packages/design-kit/js/hub-list.js";
import { showHubToast } from "../../../../packages/design-kit/js/hub-feedback.js";
import { isAtlasDoor, openAtlas } from "./atlas-door.js";
import {
  createViewOnMap,
  mapsSearchUrl,
} from "../../../../packages/design-kit/js/view-on-map.js";
import {
  emptyJournal,
  liveVisits,
  menuDishes,
  bookRecipes,
  newVisit,
  newDish,
  MEAL_TYPES,
  importDayOne,
  safeUrl,
  nearbyVenues,
  today,
  editorialBasis,
  needsEditorial,
  fixupQueue,
  venueQueue,
  applyFixup,
  plainNotes,
  tidyImports,
  unshoutVisit,
  knownTags,
  tagKey,
} from "./model.js";
import {
  paintMagazine,
  paintTimeline,
  paintEntry,
  paintFixup,
  paintVenueCheck,
  dishName,
  dishOriginal,
  dishIngredients,
  dishNotes,
} from "./pages.js";
import { paintRecipeBook } from "./recipe-book.js";
import { hasPoint, nameSimilarity, rankVenues, settleVenue, venueUnsure } from "./venue-match.js";
import {
  compressPhoto,
  inspectPhoto,
  encodedPhoto,
  mergeCapture,
  captureBatches,
  toggleMenuDish,
  menuDishIndex,
} from "./capture.js";
import { PORTION_CHIPS, portionOf } from "./portion.js";
import { handoffMessage, needsRecount } from "./brisket-handoff.js";
import {
  fileToChatAttachment,
  MAX_CHAT_IMAGE_BYTES,
} from "../../../../packages/design-kit/js/hub-chat-attachments.js";

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const button = (text, fn, kind = "secondary") => {
  const n = el("button", `btn btn--${kind}`, text);
  n.type = "button";
  n.addEventListener("click", () => fn({ currentTarget: n }));
  return n;
};
function field(
  label,
  value,
  change,
  { type = "text", options, max = 20000 } = {},
) {
  const wrap = el("div", "hub-field"),
    id = `food-field-${crypto.randomUUID()}`,
    lab = el("label", "hub-label", label);
  lab.htmlFor = id;
  const input = el(
    options ? "select" : type === "textarea" ? "textarea" : "input",
    options ? "hub-select" : type === "textarea" ? "hub-textarea" : "hub-input",
  );
  input.id = id;
  if (options)
    for (const v of options) {
      const o = el("option", "", v);
      o.value = v;
      input.append(o);
    }
  else if (type !== "textarea") input.type = type;
  input.value = value ?? "";
  input.maxLength = max;
  input.addEventListener("input", () => change(input.value));
  if (type === "date") {
    // iOS can paint its native date bezel beyond width/max-width. Keep the
    // native picker and accessible input, but let an ordinary box paint it.
    const control = el("div", "hub-input food-date"),
      display = el("span", "food-date__value");
    display.setAttribute("aria-hidden", "true");
    input.className = "food-date__native";
    const paint = () => { display.textContent = formatDisplayDate(input.value); };
    input.addEventListener("input", paint);
    input.addEventListener("change", () => {
      paint();
      change(input.value);
    });
    input.addEventListener("click", () => {
      // Also open the picker when tapping the middle of the field on desktop.
      try { input.showPicker?.(); } catch { /* native tap remains available */ }
    });
    paint();
    control.append(display, input);
    wrap.append(lab, control);
  } else wrap.append(lab, input);
  return wrap;
}
// The phone's location, or null when it is off or refused.
function whereAmI() {
  return new Promise((resolve) => {
    if (!globalThis.navigator?.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}
// Tags as chips. Tags used before show as suggestions, filtered as you type.
function tagField(tags, known, change) {
  const wrap = el("div", "hub-field food-tags"),
    id = `food-field-${crypto.randomUUID()}`,
    lab = el("label", "hub-label", "Tags"),
    chips = el("div", "hub-chips food-tags__chips"),
    input = el("input", "hub-input"),
    hints = el("div", "hub-chips food-tags__hints");
  lab.htmlFor = id;
  input.id = id;
  input.type = "text";
  input.maxLength = 100;
  input.enterKeyHint = "done";
  input.autocomplete = "off";
  input.placeholder = known.length ? "Type or pick a tag" : "Spicy, would order again";
  let current = [...tags];
  const has = (t) => current.some((c) => tagKey(c) === tagKey(t));
  const add = (raw) => {
    for (const part of raw.split(",")) {
      const t = part.replace(/^#/, "").trim().slice(0, 100);
      if (t && !has(t) && current.length < 40) current.push(t);
    }
    input.value = "";
    change([...current]);
    paint();
  };
  const paintHints = () => {
    const q = tagKey(input.value);
    hints.replaceChildren();
    for (const key of known.filter((k) => !has(k) && k.includes(q)).slice(0, 8)) {
      const b = button(key, () => add(key));
      b.className = "hub-chip food-tags__chip";
      b.setAttribute("aria-label", `Add tag ${key}`);
      // Keep focus in the field, so a half-typed tag is not added on blur.
      b.addEventListener("pointerdown", (e) => e.preventDefault());
      hints.append(b);
    }
    hints.hidden = !hints.childElementCount;
  };
  const paint = () => {
    chips.replaceChildren();
    for (const t of current) {
      const b = button(t, () => {
        current = current.filter((c) => c !== t);
        change([...current]);
        paint();
      });
      b.className = "hub-chip is-active food-tags__chip";
      b.setAttribute("aria-label", `Remove tag ${t}`);
      b.append(el("span", "food-tags__x", "×"));
      b.lastChild.setAttribute("aria-hidden", "true");
      chips.append(b);
    }
    chips.hidden = !current.length;
    paintHints();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (input.value.trim()) add(input.value);
    }
  });
  input.addEventListener("input", () =>
    input.value.includes(",") ? add(input.value) : paintHints(),
  );
  input.addEventListener("blur", () => {
    if (input.value.trim()) add(input.value);
  });
  paint();
  wrap.append(lab, chips, input, hints);
  return wrap;
}
export function createFoodJournalView({
  root = document,
  api,
  storage = globalThis.localStorage,
  sendToBrisket,
} = {}) {
  const host = root.querySelector("#food-journal-dashboard");
  let journal = emptyJournal(),
    version = null,
    loaded = false,
    busy = false,
    epoch = 0,
    mode = "magazine",
    entryId = null,
    fixIndex = 0,
    venueIndex = 0,
    dialog = null,
    // Brisket writes the counted link on confirm, so look again on return.
    sentToBrisket = false;
  let editorialRunning = false;
  const editorialFailed = new Set();
  let translating = false;
  let translateRerun = false;
  // dish id -> notes as loaded or last handled, so only edits are translated.
  const notesHandled = new Map();
  let filterControls = [],
    journalQuery = "",
    filters = {},
    book = { sort: "recent" },
    photoCache = new Map(),
    photoExpires = new Map(),
    photoObservers = new Set(),
    signQueue = new Map(),
    objectUrls = new Set();
  const draftKey = "life-food-journal-draft-v1";
  function readDraft() {
    try {
      const saved = JSON.parse(storage?.getItem(draftKey) || "null");
      return saved
        ? {
            ...(saved.visit || saved),
            __draft_version: saved.visit ? saved.version : null,
          }
        : null;
    } catch {
      return null;
    }
  }
  function writeDraft(v, baseVersion = version) {
    try {
      storage?.setItem(
        draftKey,
        JSON.stringify({ visit: v, version: baseVersion }),
      );
    } catch {
      /* storage full does not block server save */
    }
  }
  function clearDraft() {
    storage?.removeItem(draftKey);
  }
  function status(text, error = false) {
    const n = host.querySelector("[data-food-status]");
    if (n) {
      n.textContent = text;
      n.classList.toggle("food-error", error);
    }
  }
  function modal(title, trigger, { page = false } = {}) {
    const frame = el(
        "section",
        page ? "food-sheet food-sheet--page confirm-card" : "food-sheet confirm-card",
      ),
      heading = el("h2", "", title),
      fields = el("div", "food-sheet__fields"),
      error = el("p", "food-error");
    error.setAttribute("role", "alert");
    const actions = el("div", "food-sheet__actions");
    actions.dataset.part = "form-actions";
    frame.append(heading, fields, error, actions);
    let closed = false;
    const handle = page ? openPage(frame, trigger) : openMorphingDialog({
      frame,
      trigger,
      label: title,
      closeButton: false,
      onClose: () => {
        closed = true;
        if (dialog === handle) dialog = null;
        if (!trigger?.isConnected) host?.querySelector("button")?.focus();
      },
    });
    dialog = handle;
    return {
      frame,
      fields,
      error,
      actions,
      isOpen: () => !closed && dialog === handle && frame.isConnected,
      close: () => {
        closed = true;
        handle.close();
      },
    };
  }
  // A page sits in the Food Journal's own flow, so the browser scrolls it
  // and a phone keyboard simply covers its bottom. A fixed sheet or overlay
  // was moved by every keyboard open and close.
  function openPage(frame, trigger) {
    const scroll = window.scrollY,
      heading = frame.querySelector("h2");
    host.dataset.foodPage = "";
    host.prepend(frame);
    window.scrollTo(0, 0);
    // The title takes focus, not a field, so the keyboard waits for a tap.
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    frame.addEventListener("keydown", (e) => {
      if (e.key === "Escape") handle.close();
    });
    const handle = {
      close() {
        if (dialog === handle) dialog = null;
        frame.remove();
        delete host.dataset.foodPage;
        window.scrollTo(0, scroll);
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        else host?.querySelector("button")?.focus({ preventScroll: true });
      },
    };
    return handle;
  }
  // Counted dishes that a save drops, so the person can say whether their
  // nutrition log should lose the meal too.
  const countedPaths = (dishes) =>
    dishes.filter((d) => d.brisket?.meal_path).map((d) => d.brisket.meal_path);
  function askRemoveMeals(s) {
    return new Promise((resolve) => {
      const old = [...s.actions.childNodes];
      const watch = setInterval(() => {
        if (!s.isOpen()) answer(null);
      }, 200);
      const answer = (yes) => {
        clearInterval(watch);
        question.remove();
        s.actions.replaceChildren(...old);
        resolve(yes);
      };
      const question = el("p", "", "Also remove it from your nutrition log?");
      s.fields.append(question);
      s.actions.replaceChildren(
        button("No", () => answer(false), "ghost"),
        button("Yes", () => answer(true), "primary"),
      );
    });
  }
  async function persist(
    next,
    { quiet = false, removeMeals = [], clearRecount = [] } = {},
  ) {
    if (busy) throw new Error("A save is already running.");
    busy = true;
    const token = epoch;
    try {
      const value = await api.save(next, version, removeMeals, clearRecount);
      if (token !== epoch)
        throw new Error("Your session changed. Sign in again.");
      journal = value.journal;
      version = value.version;
      render();
      if (!quiet) {
        showHubToast("Saved.");
        void refreshEditorial();
        void refreshTranslations();
      }
      if (value.meals_removed === false)
        showHubToast(
          "The Food Journal saved, but a nutrition entry couldn't be removed. Delete it from Nutrition.",
        );
      return value;
    } finally {
      busy = false;
    }
  }
  // Headline, standfirst and pull quote are written by the API and saved
  // without review. Runs after saves, one visit at a time, never while the
  // person has a sheet open or another save is in flight.
  async function refreshEditorial() {
    if (editorialRunning || !loaded) return;
    editorialRunning = true;
    const token = epoch;
    try {
      for (let round = 0; round < 3; round++) {
        const target = liveVisits(journal).find(
          (v) =>
            needsEditorial(v) &&
            !editorialFailed.has(`${v.id}:${editorialBasis(v)}`),
        );
        if (!target) return;
        const basis = editorialBasis(target);
        let editorial;
        try {
          ({ editorial } = await api.assist({
            action: "editorial",
            visit_id: target.id,
            basis,
          }));
        } catch {
          editorialFailed.add(`${target.id}:${basis}`);
          continue;
        }
        for (let wait = 0; (busy || dialog) && wait < 600; wait++)
          await new Promise((resolve) => setTimeout(resolve, 1000));
        if (token !== epoch || busy || dialog) return;
        const next = structuredClone(journal),
          visit = next.visits.find((v) => v.id === target.id);
        if (!visit || editorialBasis(visit) !== basis) continue;
        visit.editorial = { ...editorial, basis };
        try {
          await persist(next, { quiet: true });
        } catch {
          editorialFailed.add(`${target.id}:${basis}`);
          return;
        }
      }
    } finally {
      editorialRunning = false;
    }
  }
  // Typed dish notes get an English copy after the save. Best effort: a
  // failed translation never touches the save, and a second save only
  // happens when notes_en actually changed.
  async function refreshTranslations() {
    if (!loaded) return;
    if (translating) {
      translateRerun = true;
      return;
    }
    translating = true;
    const token = epoch;
    try {
      const found = [];
      for (const v of liveVisits(journal))
        for (const d of v.dishes) {
          const notes = (d.notes || "").trim();
          if (notesHandled.get(d.id) === notes) continue;
          // Dishes seen at load are the baseline; an unseen dish is new.
          if (!notesHandled.has(d.id) && !notes) continue;
          found.push({ id: d.id, notes });
        }
      const changes = new Map();
      for (const { id, notes } of found) {
        let text_en = "";
        if (notes) {
          try {
            ({ text_en } = await api.translate(notes));
          } catch {
            // Leave it for the next save; the notes are already safe.
            continue;
          }
        }
        changes.set(id, { notes, text_en: text_en || "" });
      }
      if (token !== epoch || !changes.size) return;
      for (let wait = 0; (busy || dialog) && wait < 600; wait++)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      if (token !== epoch || busy || dialog) return;
      const next = structuredClone(journal);
      let changed = false;
      for (const v of next.visits)
        for (const d of v.dishes) {
          const c = changes.get(d.id);
          // Skip a dish whose notes were edited while we were translating.
          if (!c || (d.notes || "").trim() !== c.notes) continue;
          if ((d.notes_en || "") === c.text_en) continue;
          if (c.text_en) d.notes_en = c.text_en;
          else delete d.notes_en;
          changed = true;
        }
      if (changed) await persist(next, { quiet: true });
      // Handled only once saved, so a failed save is retried next time.
      for (const [id, c] of changes) notesHandled.set(id, c.notes);
    } catch {
      // Best effort only.
    } finally {
      translating = false;
      if (translateRerun) {
        translateRerun = false;
        void refreshTranslations();
      }
    }
  }
  async function load() {
    const token = epoch;
    status("Loading Food Journal.");
    try {
      const value = await api.load();
      if (token !== epoch) return;
      journal = value.journal;
      version = value.version;
      loaded = true;
      render();
      const tidy = tidyImports(journal);
      if (tidy.changed && !busy)
        await persist(tidy.journal, { quiet: true }).catch(() => {});
      if (token !== epoch) return;
      void refreshEditorial();
      // Loaded notes are the baseline; only later edits get translated.
      for (const v of journal.visits)
        for (const d of v.dishes) notesHandled.set(d.id, (d.notes || "").trim());
    } catch (e) {
      if (token !== epoch) return;
      status(e.message, true);
      const n = host.querySelector("[data-food-status]");
      n?.append(button("Retry", load));
    }
  }
  // Tap a star to rate; tap the same star again to clear.
  function stars(dish, onRate) {
    const row = el("div", "fj-rate food-stars");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", `Rate ${dish.title || "dish"}`);
    for (let n = 1; n <= 5; n++) {
      const fill =
        dish.rating == null
          ? ""
          : n <= dish.rating
            ? " is-on"
            : n - 0.5 === dish.rating
              ? " is-half"
              : "";
      const b = el("button", `fj-rate__star${fill}`, "★");
      b.type = "button";
      b.setAttribute("aria-label", `${n} out of 5`);
      b.setAttribute("aria-pressed", String(dish.rating === n));
      b.addEventListener("click", () => onRate(dish.rating === n ? null : n));
      row.append(b);
    }
    return row;
  }
  // Photos that come into view together are signed in one request.
  function signPhoto(key) {
    return new Promise((resolve, reject) => {
      if (!signQueue.size)
        setTimeout(() => {
          const batch = signQueue;
          signQueue = new Map();
          const keys = [...batch.keys()];
          for (let i = 0; i < keys.length; i += 50) {
            const chunk = keys.slice(i, i + 50);
            api
              .media({ action: "read", keys: chunk })
              .then(({ urls = {} }) => {
                for (const k of chunk)
                  for (const w of batch.get(k)) w.resolve(urls[k] || null);
              })
              .catch((e) => {
                for (const k of chunk) for (const w of batch.get(k)) w.reject(e);
              });
          }
        }, 50);
      const waiting = signQueue.get(key) || [];
      waiting.push({ resolve, reject });
      signQueue.set(key, waiting);
    });
  }
  function photoNode(photo) {
    const image = el("img", "food-photo");
    image.alt = "Dish photo";
    image.decoding = "async";
    const cached = photoCache.get(photo.key),
      token = epoch;
    let refreshed = false;
    const sign = (attempt = 0) =>
      signPhoto(photo.key)
        .then((url) => {
          if (token !== epoch) return;
          if (!url) return image.remove();
          photoCache.set(photo.key, url);
          photoExpires.set(photo.key, Date.now() + 240000);
          image.src = url;
        })
        .catch(() => {
          // A busy server is not a missing photo: try again before giving up.
          if (token === epoch && attempt < 3)
            setTimeout(() => void sign(attempt + 1), 2000 * 2 ** attempt);
          else image.remove();
        });
    image.addEventListener("error", () => {
      if (!refreshed && !cached?.startsWith("blob:") && token === epoch) {
        refreshed = true;
        void sign();
      } else image.remove();
    });
    if (
      cached &&
      (cached.startsWith("blob:") ||
        (photoExpires.get(photo.key) || 0) > Date.now())
    ) {
      image.src = cached;
      return image;
    }
    // iOS never fetches an image that is both loading=lazy and given a src
    // later. Watch visibility, then assign src with the browser's normal load.
    const watch = () => {
      if (token !== epoch || image.getAttribute("src")) return;
      if (typeof IntersectionObserver !== "function" || !image.isConnected) {
        void sign();
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer.disconnect();
            photoObservers.delete(observer);
            if (token === epoch) void sign();
          }
        },
        { rootMargin: "300px" },
      );
      photoObservers.add(observer);
      observer.observe(image);
    };
    if (image.isConnected) watch();
    else queueMicrotask(watch);
    return image;
  }
  function dishCard(dish, visit) {
    const card = el("article", "hub-card food-dish fj-menu-card");
    if (dish.photos[0]) {
      const box = el("div", "fj-menu-card__media");
      box.append(photoNode(dish.photos[0]));
      card.append(box);
    }
    const content = el("div", "food-card__body");
    content.append(el("h3", "food-dish__title fj-serif", dishName(dish)));
    content.append(...[dishOriginal(dish)].filter(Boolean));
    content.append(
      el(
        "p",
        "food-meta",
        [dish.cuisine, dish.meal_type, visit.venue.name]
          .filter(Boolean)
          .join(" · "),
      ),
    );
    content.append(...[dishIngredients(dish)].filter(Boolean));
    if (dish.rating != null) {
      const stars = el("p", "fj-stars");
      stars.setAttribute("role", "img");
      stars.setAttribute("aria-label", `${dish.rating} out of 5`);
      stars.append(
        "★".repeat(dish.rating),
        el("span", "fj-stars__off", "★".repeat(5 - dish.rating)),
      );
      content.append(stars);
    }
    if (dish.tags.length) {
      const tags = el("div", "hub-chips");
      for (const t of dish.tags) tags.append(el("span", "hub-chip", t));
      content.append(tags);
    }
    content.append(...dishNotes(dish, visit, "food-notes fj-serif fj-italic"));
    const actions = el("div", "food-actions");
    actions.append(
      ...brisketActions(visit, dish),
      button("Recipe", (e) => openRecipe(dish, e.currentTarget)),
      button(
        "Eat it again",
        (e) => openRestaurant(visit, e.currentTarget, dish),
        "ghost",
      ),
      button("Open entry", () => openEntry(visit.id), "ghost"),
    );
    content.append(actions);
    card.append(content);
    return card;
  }
  function brisketActions(visit, dish) {
    const open = (e) => openPortion(visit, dish, e.currentTarget);
    if (!sendToBrisket) return [];
    if (!dish.brisket) return [button("Send to Brisket", open, "primary")];
    if (dish.brisket.needs_recount)
      return [
        el("span", "hub-chip food-counted", "Counted in Brisket · needs a re-count"),
        button("Re-count", open, "primary"),
        button("Keep old numbers", (e) => keepOldNumbers(dish, e.currentTarget), "ghost"),
      ];
    return [
      el("span", "hub-chip food-counted", `Counted in Brisket · ${dish.brisket.portion}`),
      button("Change portion", open),
    ];
  }
  // The server clears the flag only while the dish matches what was counted.
  async function keepOldNumbers(dish, trigger) {
    trigger.disabled = true;
    try {
      const next = structuredClone(journal);
      const d = next.visits.flatMap((v) => v.dishes).find((x) => x.id === dish.id);
      if (d?.brisket) d.brisket.needs_recount = false;
      await persist(next, { clearRecount: [dish.id] });
    } catch (err) {
      showHubToast(err.message);
    } finally {
      trigger.disabled = false;
    }
  }
  // How much of the dish was eaten, then the hand-off goes to Brisket's chat.
  function openPortion(visit, dish, trigger) {
    const s = modal("Send to Brisket", trigger);
    const current = dish.brisket?.portion;
    const fixed = PORTION_CHIPS.some((c) => c.label === current);
    const piecesNow = !fixed && /^(\d+) of (\d+)$/.exec(current || "");
    let chip = piecesNow ? null : fixed ? current : "All",
      note = "",
      // Fetched once, so a retry sends the same photo without asking again.
      photo;
    const row = el("div", "hub-chips food-portion");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Portion");
    const pieces = el("div", "food-portion__pieces");
    const count = (label, value) => {
      const n = el("input", "hub-input food-portion__count");
      n.type = "number";
      n.inputMode = "numeric";
      n.min = "1";
      n.max = "99";
      n.step = "1";
      n.value = value ?? "";
      n.setAttribute("aria-label", label);
      n.addEventListener("input", paint);
      return n;
    };
    const eaten = count("Pieces eaten", piecesNow?.[1]),
      total = count("Pieces in total", piecesNow?.[2]);
    pieces.append(eaten, el("span", "", "of"), total);
    const choice = () =>
      portionOf(
        chip
          ? { chip }
          : { pieces: Number(eaten.value || NaN), of: Number(total.value || NaN) },
      );
    const chips = [...PORTION_CHIPS.map((c) => c.label), "Pieces"].map((label) => {
      const b = button(label, () => {
        chip = label === "Pieces" ? null : label;
        paint();
        if (!chip) eaten.focus();
      });
      b.className = "hub-chip food-portion__chip";
      b.dataset.portion = label;
      return b;
    });
    row.append(...chips);
    const send = button(
      "Send",
      async (e) => {
        const picked = choice();
        if (!picked) return;
        e.currentTarget.disabled = true;
        s.error.textContent = "Sending to Brisket.";
        const message = handoffMessage({
          visit,
          dish,
          portion: { ...picked, note: note.trim() },
          previous: dish.brisket || undefined,
        });
        if (photo === undefined) photo = await dishAttachment(dish);
        if (!s.isOpen()) return;
        const result = await Promise.resolve(
          sendToBrisket(message, photo ? [photo] : []),
        ).catch(() => ({ ok: false }));
        if (!s.isOpen()) return;
        if (result?.ok === false) {
          s.error.textContent = "Couldn't reach Brisket. Try again.";
          paint();
          return;
        }
        sentToBrisket = true;
        s.close();
      },
      "primary",
    );
    function paint() {
      for (const b of chips) {
        const on = chip ? b.dataset.portion === chip : b.dataset.portion === "Pieces";
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      }
      pieces.hidden = chip != null;
      send.disabled = !choice();
    }
    s.fields.append(
      row,
      pieces,
      field("Anything else", note, (v) => (note = v), { max: 200 }),
    );
    s.actions.append(button("Cancel", s.close, "ghost"), send);
    paint();
  }
  // The dish's first photo as a chat image, or null when it can't be had.
  async function dishAttachment(dish) {
    const key = dish.photos?.[0]?.key;
    if (!key) return null;
    try {
      const blob = await compressPhoto(
        new File([await api.photo(key)], "dish.jpg", { type: "image/jpeg" }),
        1200,
      );
      if (blob.size > MAX_CHAT_IMAGE_BYTES) return null;
      return await fileToChatAttachment(
        new File([blob], "dish.jpg", { type: "image/jpeg" }),
      );
    } catch {
      return null;
    }
  }
  function openEntry(id) {
    entryId = id;
    render();
    host?.scrollIntoView?.({ block: "start" });
  }
  function setMode(next) {
    mode = next;
    entryId = null;
    render();
  }
  async function rateDish(visit, dish, value) {
    if (busy) return;
    const next = structuredClone(journal);
    const target = next.visits
      .find((v) => v.id === visit.id)
      ?.dishes.find((d) => d.id === dish.id);
    if (!target) return;
    target.rating = value;
    try {
      await persist(next);
    } catch (e) {
      status(e.message, true);
    }
  }
  async function fixVisit(visit, trigger) {
    if (busy) return;
    trigger.disabled = true;
    status("Reading the original entry and splitting it into dishes.");
    let draft = visit;
    try {
      const result = await api.assist({ action: "fixup", visit_id: visit.id });
      draft = applyFixup(visit, result.draft);
      status("Check the dishes, rate them and add photos, then save.");
    } catch (e) {
      status(`${e.message} You can still fix it up by hand.`, true);
    }
    if (trigger.isConnected) trigger.disabled = false;
    editVisit(draft, trigger, { fixup: true });
  }
  // candidate null keeps the name it has.
  async function pickVenue(visit, candidate, trigger) {
    if (busy) return;
    trigger.disabled = true;
    const next = structuredClone(journal);
    const target = next.visits.find((v) => v.id === visit.id);
    // A candidate brings its own place; a typed name stays at the photo's point.
    target.venue = settleVenue(
      target.venue,
      !candidate
        ? {}
        : hasPoint(candidate)
          ? { name: candidate.name, address: candidate.address, lat: candidate.lat, lon: candidate.lon }
          : { name: candidate.name },
    );
    try {
      await persist(next);
    } catch (e) {
      status(e.message, true);
      if (trigger.isConnected) trigger.disabled = false;
    }
  }
  async function markReviewed(visit, trigger) {
    if (busy) return;
    trigger.disabled = true;
    const next = structuredClone(journal);
    next.visits.find((v) => v.id === visit.id).reviewed = true;
    try {
      await persist(next);
    } catch (e) {
      status(e.message, true);
      if (trigger.isConnected) trigger.disabled = false;
    }
  }
  const pageContext = {
    journal: () => journal,
    today,
    photoNode,
    button,
    openEntry,
    setMode,
    openTag(key) {
      journalQuery = `#${key}`;
      setMode("timeline");
      host?.scrollIntoView?.({ block: "start" });
    },
    editVisit,
    deleteVisit,
    openRecipe,
    brisketActions,
    openBookRecipe: (recipe, trigger) => recipeEditor(recipe, trigger),
    get book() {
      return book;
    },
    addControl: (control) => filterControls.push(control),
    openRestaurant,
    hasRecipe: (dishId) => journal.recipes.some((r) => r.dish_id === dishId),
    rate: rateDish,
    fixVisit,
    markReviewed,
    skipFixup: () => {
      fixIndex++;
      render();
    },
    pickVenue,
    skipVenue: () => {
      venueIndex++;
      render();
    },
  };
  function render() {
    if (!host) return;
    for (const c of filterControls) c.dispose();
    filterControls = [];
    // An open visit page stays put; the journal repaints behind it.
    for (const child of [...host.children])
      if (!child.classList.contains("food-sheet--page")) child.remove();
    const queue = loaded ? fixupQueue(journal).length : 0;
    if (mode === "fixup" && !queue) mode = "magazine";
    const unsure = loaded ? venueQueue(journal).length : 0;
    if (mode === "venues" && !unsure) mode = "magazine";
    const toolbar = el("div", "food-toolbar"),
      pills = el("div", "hub-pills");
    pills.setAttribute("role", "tablist");
    pills.setAttribute("aria-label", "Food Journal views");
    const tabs = [
      ["magazine", "Magazine"],
      ["timeline", "Timeline"],
      ["menu", "Custom Menu"],
      ["recipes", loaded ? `Recipes (${bookRecipes(journal).length})` : "Recipes"],
    ];
    if (queue) tabs.push(["fixup", `Fix up (${queue})`]);
    if (unsure) tabs.push(["venues", `Check venues (${unsure})`]);
    for (const [id, label] of tabs) {
      const b = button(label, () => setMode(id), "ghost");
      b.className = "hub-pills__btn";
      b.classList.toggle("is-active", mode === id);
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(mode === id));
      pills.append(b);
    }
    const more = createHubMenuButton(
      () => [
        { label: "Import", onSelect: () => openImport(more) },
        { label: "Backup", onSelect: () => void backup() },
        { label: "Restore", onSelect: () => restore(more) },
      ],
      { label: "Import, backup and restore" },
    );
    toolbar.append(
      pills,
      button(
        "Add visit",
        (e) => editVisit(newVisit(), e.currentTarget),
        "primary",
      ),
      more,
    );
    host.append(toolbar);
    const line = el("p", "canvas-status");
    line.dataset.foodStatus = "";
    line.setAttribute("role", "status");
    host.append(line);
    if (!loaded) {
      status("Loading Food Journal.");
      return;
    }
    const draft = readDraft();
    if (draft) {
      const row = el("div", "hub-row food-actions");
      row.append(
        el("span", "", "You have an unsaved visit."),
        button("Resume", (e) => editVisit(draft, e.currentTarget)),
        button(
          "Discard",
          () => {
            clearDraft();
            render();
          },
          "ghost",
        ),
      );
      host.append(row);
    }
    if (entryId) {
      const visit = liveVisits(journal).find((v) => v.id === entryId);
      if (visit) {
        paintEntry(pageContext, host, visit);
        return;
      }
      entryId = null;
    }
    if (mode === "magazine") {
      paintMagazine(pageContext, host);
      return;
    }
    if (mode === "fixup") {
      paintFixup(pageContext, host, fixIndex);
      return;
    }
    if (mode === "venues") {
      paintVenueCheck(pageContext, host, venueIndex);
      return;
    }
    if (mode === "recipes") {
      paintRecipeBook(pageContext, host);
      return;
    }
    if (mode === "timeline") {
      const search = el("input", "hub-search");
      search.placeholder = "Search visits and saved menus";
      search.setAttribute("aria-label", "Search Food Journal");
      search.value = journalQuery;
      const list = el("div", "fj-timeline");
      search.addEventListener("input", () => {
        if (isAtlasDoor(search.value)) return openAtlas();
        journalQuery = search.value;
        paintTimeline(pageContext, list, journalQuery);
      });
      host.append(search, list);
      paintTimeline(pageContext, list, journalQuery);
      return;
    }
    const grid = el("div", "food-grid");
    grid.dataset.foodGrid = "";
    const controls = el("div", "food-filters");
    const search = el("input", "hub-search");
    search.placeholder = "Search dishes, venues and menus";
    search.setAttribute("aria-label", "Search Custom Menu");
    search.value = filters.query || "";
    search.addEventListener("input", () => {
      if (isAtlasDoor(search.value)) return openAtlas();
      filters.query = search.value;
      paintMenu(grid);
    });
    controls.append(search);
    const all = menuDishes(journal);
    for (const [key, label, values] of [
      ["meal", "Meal type", MEAL_TYPES],
      [
        "cuisine",
        "Cuisine",
        [...new Set(all.map((x) => x.dish.cuisine).filter(Boolean))].sort(),
      ],
      [
        "tag",
        "Indicator",
        [...new Set(all.flatMap((x) => x.dish.tags))].sort(),
      ],
      ["rating", "Minimum rating", ["1", "2", "3", "4", "5"]],
    ]) {
      const control = createHubFilter({
        key,
        label,
        value: filters[key] || "",
        defaultValue: "",
        options: [
          { value: "", label },
          ...values.map((value) => ({ value, label: value })),
        ],
        onChange: (v) => {
          filters[key] = v;
          paintMenu(grid);
        },
      });
      filterControls.push(control);
      controls.append(control.el);
    }
    controls.append(
      button(
        "Reset",
        () => {
          filters = {};
          render();
        },
        "ghost",
      ),
    );
    host.append(controls);
    paintMenu(grid);
    host.append(grid);
  }
  function paintMenu(grid) {
    grid.replaceChildren();
    const found = menuDishes(journal, filters);
    for (const { dish, visit } of found) grid.append(dishCard(dish, visit));
    if (!found.length)
      grid.append(el("p", "canvas-status", "No dishes match your selection."));
  }
  function deleteVisit(visit, trigger) {
    const s = modal("Delete visit", trigger);
    s.fields.append(
      el(
        "p",
        "",
        `Delete ${visit.title || visit.dishes[0].title} and its dishes?`,
      ),
    );
    s.actions.append(
      button("Cancel", s.close, "ghost"),
      button(
        "Delete",
        async (e) => {
          e.currentTarget.disabled = true;
          try {
            const paths = countedPaths(visit.dishes);
            const yes = paths.length ? await askRemoveMeals(s) : false;
            if (yes === null) return;
            const removeMeals = yes ? paths : [];
            const next = structuredClone(journal);
            next.visits.find((v) => v.id === visit.id).status = "deleted";
            await persist(next, { removeMeals });
            s.close();
          } catch (err) {
            s.error.textContent = err.message;
            e.currentTarget.disabled = false;
          }
        },
        "primary",
      ),
    );
  }
  function openRestaurant(visit, trigger, dish) {
    const s = modal(visit.venue.name || "Eat out", trigger);
    s.fields.append(
      el("p", "", visit.venue.address || "No address saved."),
      el("p", "food-meta", formatDisplayDate(visit.date)),
    );
    if (visit.venue.address) {
      const map = el("div");
      const control = createViewOnMap({
        address: visit.venue.address,
        locationName: visit.venue.name,
      });
      if (control) map.append(control.el);
      s.fields.append(map);
    }
    if (visit.menu_text) {
      s.fields.append(
        el("h3", "", "Saved menu"),
        el("pre", "food-menu-text", visit.menu_text),
      );
    }
    let area = visit.venue.address || "";
    const find = el("a", "btn btn--secondary", "Find restaurants");
    find.target = "_blank";
    find.rel = "noopener noreferrer";
    const updateSearch = () =>
      (find.href = mapsSearchUrl(
        `${dish?.title || "Food"} restaurants ${area}`,
      ));
    s.fields.append(
      field("Search area", area, (value) => {
        area = value;
        updateSearch();
      }),
    );
    updateSearch();
    s.actions.append(button("Close", s.close, "ghost"), find);
  }
  function editVisit(original, trigger, { fixup = false } = {}) {
    const baseVersion = Object.hasOwn(original, "__draft_version")
      ? original.__draft_version
      : version;
    let visit = unshoutVisit(structuredClone(original));
    delete visit.__draft_version;
    // Saving a fix-up takes the import out of the queue, including from a resumed draft.
    if (fixup) visit.reviewed = true;
    const newerSavedVisit =
      baseVersion !== version
        ? journal.visits.find((v) => v.id === visit.id)
        : null;
    let reviewedNewerVisit = !newerSavedVisit;
    // A full page, not a sheet: a sheet jumps as the keyboard comes and goes.
    const s = modal(
      fixup ? "Fix up entry" : original.title ? "Edit visit" : "Add visit",
      trigger,
      { page: true },
    );
    let repaintMenu = () => {};
    let dishList = null,
      menuImages = [],
      photoGps = null,
      hereGps = null,
      dateEdited = false,
      captureBusy = false;
    const persistDraft = () => writeDraft(visit, baseVersion);
    const tags = knownTags(journal);
    const fields = () => {
      s.fields.replaceChildren();
      if (newerSavedVisit) {
        const current = el("details", "hub-row");
        current.append(
          el("summary", "", "Current saved visit"),
          el("p", "", newerSavedVisit.title),
          el(
            "p",
            "food-meta",
            [
              formatDisplayDate(newerSavedVisit.date),
              newerSavedVisit.venue.name,
              newerSavedVisit.venue.address,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
          el("p", "", newerSavedVisit.notes),
          el("pre", "food-menu-text", newerSavedVisit.menu_text),
        );
        for (const d of newerSavedVisit.dishes)
          current.append(
            el(
              "p",
              "",
              [
                d.title,
                d.cuisine,
                d.meal_type,
                d.rating ? `${d.rating} out of 5` : "",
                d.tags.join(", "),
                d.notes,
              ]
                .filter(Boolean)
                .join(". "),
            ),
          );
        const label = el("label", "food-check"),
          check = el("input", "hub-check");
        check.type = "checkbox";
        check.checked = reviewedNewerVisit;
        check.addEventListener(
          "change",
          () => (reviewedNewerVisit = check.checked),
        );
        label.append(
          check,
          el("span", "", "Replace the saved visit with this reviewed draft."),
        );
        s.fields.append(
          el(
            "p",
            "",
            "A newer visit is saved. Review the current visit and your draft before saving.",
          ),
          current,
          label,
        );
      }
      // A menu photo lists every item to tick off as a dish. Dish photos are
      // added inside each dish, so they land on that dish and nowhere else.
      const capture = el("div", "food-quick"),
        pick = el("label", "food-quick__pick btn btn--secondary"),
        input = el("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.setAttribute("aria-label", "Menu photo");
      input.addEventListener("change", () => {
        void readMenu([...input.files]);
        input.value = "";
      });
      pick.append(input, el("span", "", "Photo the menu"));
      capture.append(pick);
      s.fields.append(capture);
      repaintMenu = () => {};
      // The menu sits just above the dishes it fills, after the visit itself.
      let menuSection = null;
      if (visit.menu_items?.length) {
        const menu = el("section", "food-onmenu");
        menu.setAttribute("aria-label", "On the menu");
        const head = el("div", "food-onmenu__head");
        head.append(
          el("h3", "", "On the menu"),
          el("span", "food-meta", "Tick what you had"),
        );
        const list = el("div", "food-onmenu__list");
        let query = "";
        let checks = [];
        repaintMenu = () => {
          list.replaceChildren();
          checks = [];
          // Dishes first, then extras, which tick onto the last dish.
          const shown = visit.menu_items.filter((item) =>
            [item.name, item.name_en, item.description, item.description_en]
              .join(" ")
              .toLowerCase()
              .includes(query),
          );
          const extras = shown.filter((item) => item.kind === "extra");
          for (const item of [
            ...shown.filter((item) => item.kind !== "extra"),
            ...extras,
          ]) {
            if (item === extras[0]) {
              const group = el("div", "food-onmenu__group");
              group.append(
                el("span", "food-onmenu__name", "Extras and add-ons"),
                el("span", "food-meta", "Added to your last dish"),
              );
              list.append(group);
            }
            const row = el("label", "food-onmenu__item"),
              check = el("input", "hub-check");
            check.type = "checkbox";
            check.checked = menuDishIndex(visit, item) >= 0;
            check.addEventListener("change", () => {
              const had = menuDishIndex(visit, item) >= 0;
              visit = toggleMenuDish(visit, item);
              if (had && menuDishIndex(visit, item) >= 0) {
                check.checked = true;
                s.error.textContent = `${item.name} has your rating, notes or photos, so it stays. Remove it from the dishes below.`;
              }
              persistDraft();
              dishList.setItems(visit.dishes);
              // An extra ticks onto a dish, so other rows can change too.
              for (const [c, i] of checks)
                c.checked = menuDishIndex(visit, i) >= 0;
            });
            checks.push([check, item]);
            const text = el("span", "food-onmenu__text");
            text.append(
              el("span", "food-onmenu__name", item.name_en || item.name),
            );
            if (item.name_en)
              text.append(el("span", "food-original", item.name));
            if (item.description_en || item.description)
              text.append(
                el(
                  "span",
                  "food-meta",
                  item.description_en || item.description,
                ),
              );
            if (item.description_en && item.description)
              text.append(el("span", "food-original", item.description));
            row.append(check, text);
            if (item.price) row.append(el("span", "food-onmenu__price", item.price));
            list.append(row);
          }
        };
        menu.append(head);
        if (visit.menu_items.length > 12) {
          const find = el("input", "hub-search");
          find.placeholder = "Find on the menu";
          find.setAttribute("aria-label", "Find on the menu");
          find.addEventListener("input", () => {
            query = find.value.trim().toLowerCase();
            repaintMenu();
          });
          menu.append(find);
        }
        repaintMenu();
        menu.append(list);
        menuSection = menu;
      }
      s.fields.append(el("h3", "food-sheet__label", "The visit"));
      // Find venue sits by the Venue field and searches what is typed there.
      const where = el("div", "food-pair food-pair--end food-pair--keep");
      where.append(
        field(
          "Venue",
          visit.venue.name,
          (v) => {
            visit.venue.name = v;
            persistDraft();
          },
          { max: 200 },
        ),
      );
      s.fields.append(where);
      const suggestions = el("div", "food-actions");
      for (const item of nearbyVenues(journal, photoGps))
        suggestions.append(
          button(
            `Use ${item.venue.name}`,
            () => {
              visit.venue = structuredClone(item.venue);
              persistDraft();
              fields();
            },
            "ghost",
          ),
        );
      const findVenue = button(
        "Find venue",
        async (e) => {
          e.currentTarget.disabled = true;
          try {
            // Without photo GPS or a saved venue, search near the phone.
            if (!photoGps && !Number.isFinite(visit.venue.lat) && !hereGps)
              hereGps = await whereAmI();
            const point =
              photoGps || (Number.isFinite(visit.venue.lat) ? visit.venue : hereGps);
            // Food places at the point, nearest and best-named first; a plain
            // text search only when there is no point at all.
            const typed = visit.venue.name.trim();
            const found = hasPoint(point) ? await api.foodPlaces(point, typed) : null;
            const result = found
              ? { places: rankVenues(found.candidates, point, typed) }
              : await api.places(typed || "restaurant", {});
            suggestions.replaceChildren();
            // Not every venue is on the map. What Adam typed is always a
            // choice, at the point the photo was taken.
            if (typed && !result.places.some((p) => nameSimilarity(typed, p.name) >= 0.6))
              suggestions.append(
                button(
                  `Use ${typed}`,
                  () => {
                    visit.venue = settleVenue(visit.venue, {
                      name: typed,
                      address: found?.street || visit.venue.address,
                      ...(hasPoint(point) ? { lat: point.lat, lon: point.lon } : {}),
                    });
                    persistDraft();
                    fields();
                  },
                ),
              );
            for (const p of result.places)
              suggestions.append(
                button(
                  Number.isFinite(p.distance) ? `${p.name} · ${p.distance} m` : p.name,
                  () => {
                    visit.venue = settleVenue(visit.venue, {
                      name: p.name,
                      address: p.address,
                      lat: p.lat,
                      lon: p.lon,
                    });
                    persistDraft();
                    fields();
                  },
                  "ghost",
                ),
              );
            if (!result.places.length && !typed)
              s.error.textContent =
                "No venues found here. Type the venue, then Find venue.";
            else if (!photoGps && !Number.isFinite(visit.venue.lat) && !hereGps)
              s.error.textContent =
                "Location is off, so these may be far away. Allow location for Life Hub in Settings, or add the suburb to the venue.";
          } catch (err) {
            s.error.textContent = err.message;
          } finally {
            e.currentTarget.disabled = false;
          }
        },
        "ghost",
      );
      where.append(findVenue);
      const address = el("div", "food-pair");
      address.append(
        field(
          "Address",
          visit.venue.address,
          (v) => {
            visit.venue.address = v;
            persistDraft();
          },
          { max: 1000 },
        ),
        field(
          "Date",
          visit.date,
          (v) => {
            visit.date = v;
            dateEdited = true;
            persistDraft();
          },
          { type: "date" },
        ),
      );
      s.fields.append(suggestions, address);
      const visitNotes = field(
        "Visit notes",
        visit.notes,
        (v) => {
          visit.notes = v;
          persistDraft();
        },
        { type: "textarea" },
      );
      visitNotes.querySelector("textarea").placeholder =
        "The place, the service, the company";
      s.fields.append(visitNotes);
      if (menuSection) s.fields.append(menuSection);
      s.fields.append(el("h3", "food-sheet__label", "What you ate"));
      dishList?.dispose();
      dishList = createHubList({
        items: visit.dishes,
        getKey: (d) => d.id,
        noun: "dish",
        min: 1,
        max: 100,
        create: () => newDish(),
        onChange: (rows) => {
          visit.dishes = rows;
          persistDraft();
          repaintMenu();
        },
        renderItem: (d, ctx) => {
          const block = el("div", "food-dish-editor");
          const set = (key, v) => {
            d[key] = v;
            // An old translation never shows against new text.
            if (key === "notes") delete d.notes_en;
            ctx.update({ ...d });
            persistDraft();
            if (key === "title") repaintMenu();
          };
          const top = el("div", "food-dish-editor__top");
          const rates = el("div");
          const repaint = () => {
            rates.replaceChildren(
              stars(d, (v) => {
                set("rating", v);
                repaint();
              }),
            );
          };
          repaint();
          top.append(
            field("Dish title", d.title, (v) => set("title", v), { max: 200 }),
            rates,
          );
          const notes = field("Dish notes", d.notes, (v) => set("notes", v), {
            type: "textarea",
          });
          notes.classList.add("food-field--short");
          const more = el("div", "food-pair food-dish-editor__more");
          more.append(
            field("Cuisine", d.cuisine, (v) => set("cuisine", v), { max: 100 }),
            field("Meal type", d.meal_type, (v) => set("meal_type", v), {
              options: MEAL_TYPES,
            }),
            tagField(d.tags, tags, (v) => set("tags", v)),
          );
          const ingredients = field(
            "Ingredients",
            d.ingredients || "",
            (v) => set("ingredients", v),
            { type: "textarea", max: 2000 },
          );
          ingredients.classList.add("food-field--short");
          block.append(top, ingredients, notes, more);
          const photos = el("div", "food-thumbnails");
          const tile = (p) => {
            const wrap = el("div", "food-photo-wrap");
            wrap.append(
              photoCache.has(p.key)
                ? photoNode(p)
                : el("span", "food-meta", "Photo attached"),
              createHubMenuButton(
                () => [
                  {
                    label: "Delete photo",
                    hold: true,
                    danger: true,
                    onSelect: () => {
                      set(
                        "photos",
                        d.photos.filter((x) => x.key !== p.key),
                      );
                      wrap.remove();
                    },
                  },
                  ...visit.dishes
                    .filter((other) => other.id !== d.id)
                    .map((other) => ({
                      label: `Move to ${other.title || "another dish"}`,
                      onSelect: () => {
                        set(
                          "photos",
                          d.photos.filter((x) => x.key !== p.key),
                        );
                        if (!other.photos.some((x) => x.key === p.key))
                          other.photos.push(p);
                        persistDraft();
                        fields();
                      },
                    })),
                ],
                { label: "Photo options" },
              ),
            );
            return wrap;
          };
          for (const p of d.photos) photos.append(tile(p));
          // Photos chosen here belong to this dish. They are not read, so they
          // never add a dish; their date and place still fill in the visit.
          const add = el("label", "food-quick__pick food-quick__pick--small btn btn--ghost"),
            pick = el("input");
          pick.type = "file";
          pick.accept = "image/*";
          pick.multiple = true;
          pick.setAttribute("aria-label", "Add photos to this dish");
          add.append(pick, el("span", "", "Add photo"));
          pick.addEventListener("change", async () => {
            const files = [...pick.files];
            pick.value = "";
            if (!files.length) return;
            captureBusy = true;
            save.disabled = true;
            s.error.textContent = "Adding photos.";
            try {
              for (const file of files) {
                const metadata = await inspectPhoto(file, journal);
                if (metadata.date && !original.title && !dateEdited)
                  visit.date = metadata.date;
                if (metadata.gps) photoGps = metadata.gps;
                const blob = await compressPhoto(file),
                  p = await api.upload(blob),
                  url = URL.createObjectURL(blob);
                objectUrls.add(url);
                photoCache.set(p.key, url);
                d.photos.push(p);
                photos.append(tile(p));
              }
              set("photos", d.photos);
              s.error.textContent = "";
            } catch (err) {
              s.error.textContent = err.message;
            } finally {
              captureBusy = false;
              save.disabled = false;
            }
          });
          block.append(photos, add);
          return block;
        },
      });
      s.fields.append(dishList.el);
      s.fields.append(
        field(
          "Visit title",
          visit.title,
          (v) => {
            visit.title = v;
            persistDraft();
          },
          { max: 200 },
        ),
      );
      // The full menu text stays searchable; the ticks above are the fast path.
      const saved = el("details", "food-menu-fold");
      saved.append(
        el("summary", "", visit.menu_text ? "Menu text" : "Paste menu text"),
        field(
          "Menu text",
          visit.menu_text,
          (v) => {
            visit.menu_text = v;
            persistDraft();
          },
          { type: "textarea", max: 100000 },
        ),
      );
      s.fields.append(saved);
    };
    // A menu photo is read as soon as it is chosen: no separate extract step.
    async function readMenu(files) {
      if (!files.length) return;
      if (captureBusy) {
        s.error.textContent = "Still reading the last photos. Try again in a moment.";
        return;
      }
      captureBusy = true;
      save.disabled = true;
      s.error.textContent = "Preparing photos.";
      const added = [];
      try {
        for (const file of files) {
          if (menuImages.length >= 30)
            throw new Error("Choose up to 30 menu photos per visit.");
          const metadata = await inspectPhoto(file, journal);
          if (metadata.date && !original.title && !dateEdited)
            visit.date = metadata.date;
          if (metadata.gps) photoGps = metadata.gps;
          const blob = await compressPhoto(file, 1200);
          const image = {
            role: "menu",
            id: `menu_${crypto.randomUUID()}`,
            mime: blob.type,
            data: await encodedPhoto(blob),
          };
          menuImages.push(image);
          added.push(image);
        }
        persistDraft();
        fields();
      } catch (err) {
        s.error.textContent = err.message;
        return;
      } finally {
        captureBusy = false;
        save.disabled = false;
      }
      captureBusy = true;
      try {
        const results = [];
        for (const batch of captureBatches(added)) {
          s.error.textContent = "Reading the menu. This takes a moment.";
          results.push((await api.assist({ action: "capture", images: batch })).draft);
        }
        if (!s.isOpen()) return;
        for (const draft of results) visit = mergeCapture(visit, draft);
        persistDraft();
        fields();
        s.error.textContent = visit.menu_items?.length
          ? "Tick what you had."
          : "Check the details, then save.";
      } catch (err) {
        s.error.textContent = `${err.message} You can still fill it in yourself.`;
      } finally {
        captureBusy = false;
      }
    }
    const save = button(
      "Save visit",
      async (e) => {
        if (busy) return;
        if (captureBusy) {
          s.error.textContent = "Still reading your photos. Save when they are done.";
          return;
        }
        if (!reviewedNewerVisit) {
          s.error.textContent =
            "Review the current saved visit before replacing its details.";
          return;
        }
        if (visit.dishes.some((d) => !d.title.trim())) {
          s.error.textContent = "Give every dish a title.";
          return;
        }
        e.currentTarget.disabled = true;
        s.error.textContent = "Saving.";
        try {
          // Typing the venue yourself settles one Check venues was unsure of.
          if (
            venueUnsure(visit) &&
            (visit.venue.name !== original.venue.name ||
              visit.venue.address !== original.venue.address)
          )
            visit.venue = settleVenue(visit.venue);
          const next = structuredClone(journal),
            index = next.visits.findIndex((v) => v.id === visit.id);
          if (index < 0) next.visits.push(visit);
          else next.visits[index] = visit;
          const ids = new Set(
            next.visits.flatMap((v) => v.dishes.map((d) => d.id)),
          );
          next.recipes = next.recipes.filter((r) => ids.has(r.dish_id));
          const kept = new Set(visit.dishes.map((d) => d.id));
          const saved = journal.visits.find((v) => v.id === visit.id);
          for (const d of visit.dishes) {
            const before = saved?.dishes.find((b) => b.id === d.id);
            if (d.brisket && needsRecount(before, d)) d.brisket.needs_recount = true;
          }
          const paths = countedPaths(
            (saved?.dishes ?? []).filter((d) => !kept.has(d.id)),
          );
          const yes = paths.length ? await askRemoveMeals(s) : false;
          if (yes === null) {
            persistDraft();
            return;
          }
          const removeMeals = yes ? paths : [];
          await persist(next, { removeMeals });
          clearDraft();
          s.close();
          render();
        } catch (err) {
          s.error.textContent = err.message;
        } finally {
          e.currentTarget.disabled = false;
        }
      },
      "primary",
    );
    s.actions.append(
      button(
        "Close",
        () => {
          persistDraft();
          s.close();
          render();
        },
        "ghost",
      ),
      save,
    );
    fields();
    return s;
  }
  async function openRecipe(dish, trigger) {
    const token = epoch;
    const existing = journal.recipes.find((r) => r.dish_id === dish.id);
    if (existing) {
      recipeEditor(existing, trigger);
      return;
    }
    const s = modal("Create recipe", trigger);
    s.fields.append(
      el(
        "p",
        "",
        `Research ${dish.title}, compare ten recipes, and prepare your cooking card.`,
      ),
    );
    s.actions.append(
      button("Cancel", s.close, "ghost"),
      button(
        "Research recipe",
        async (e) => {
          e.currentTarget.disabled = true;
          s.error.textContent = "Researching recipes. This takes a moment.";
          try {
            const { recipe } = await api.assist({
              action: "recipe",
              dish_id: dish.id,
            });
            if (token !== epoch || !s.isOpen()) return;
            s.close();
            recipeEditor(recipe, trigger);
          } catch (err) {
            s.error.textContent = err.message;
            e.currentTarget.disabled = false;
          }
        },
        "primary",
      ),
    );
  }
  function recipeEditor(original, trigger) {
    const r = structuredClone(original),
      s = modal(r.title, trigger);
    let portions = r.servings;
    s.fields.append(
      field("Recipe title", r.title, (v) => (r.title = v), { max: 200 }),
      field(
        "Servings",
        r.servings,
        (v) => {
          const n = Number(v);
          r.servings = n;
          portions = n;
        },
        { type: "number" },
      ),
    );
    const cooking = el("div", "hub-row food-cooking");
    const paintCooking = () => {
      cooking.replaceChildren(el("h3", "", "Cooking checklist"));
      for (const step of r.steps) {
        const label = el("label", "food-check"),
          check = el("input", "hub-check");
        check.type = "checkbox";
        label.append(check, el("span", "", step));
        cooking.append(label);
      }
    };
    for (const [key, noun] of [
      ["ingredients", "ingredient"],
      ["steps", "step"],
    ]) {
      const section = el("div");
      section.append(
        el("h3", "", key === "ingredients" ? "Ingredients" : "Steps"),
      );
      const list = createHubList({
        items: r[key].map((text) => ({ id: crypto.randomUUID(), text })),
        getKey: (item) => item.id,
        noun,
        min: 1,
        max: 100,
        create: () => ({ id: crypto.randomUUID(), text: "" }),
        onChange: (rows) => {
          r[key] = rows.map((row) => row.text.trim()).filter(Boolean);
          paintCooking();
        },
        renderItem: (item, ctx) =>
          field(
            noun === "ingredient" ? "Ingredient" : "Step",
            item.text,
            (value) => ctx.update({ ...item, text: value }),
            { max: 2000 },
          ),
      });
      section.append(list.el);
      s.fields.append(section);
    }
    paintCooking();
    s.fields.append(cooking);
    const scaled = el("div");
    s.fields.append(
      field(
        "Cook for",
        portions,
        (v) => {
          portions = Number(v);
          scaled.replaceChildren();
          if (!Number.isFinite(portions) || portions < 1 || !r.servings) return;
          for (const line of r.ingredients) {
            scaled.append(
              el("p", "", scaleIngredient(line, portions / r.servings)),
            );
          }
        },
        { type: "number" },
      ),
      scaled,
    );
    s.fields.append(el("h3", "", "Sources"));
    for (const source of r.sources) {
      const a = el("a", "", source.title);
      a.href = safeUrl(source.url);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      s.fields.append(a);
    }
    if (r.candidates) {
      const details = el("details");
      details.append(el("summary", "", "Recipe research"));
      for (const c of r.candidates)
        details.append(
          el(
            "p",
            "",
            `${r.shortlist?.includes(c.url) ? "Selected. " : ""}${c.title}. ${c.reason}`,
          ),
        );
      s.fields.append(details);
    }
    s.actions.append(
      button("Close", s.close, "ghost"),
      button(
        "Save recipe",
        async (e) => {
          e.currentTarget.disabled = true;
          try {
            const next = structuredClone(journal);
            // The book's Recently added order: kept from the first save.
            const earlier = next.recipes.find((x) => x.dish_id === r.dish_id);
            r.added_at =
              original.added_at || earlier?.added_at || new Date().toISOString();
            next.recipes = next.recipes.filter((x) => x.dish_id !== r.dish_id);
            next.recipes.push(r);
            await persist(next);
            s.close();
          } catch (err) {
            s.error.textContent = err.message;
            e.currentTarget.disabled = false;
          }
        },
        "primary",
      ),
    );
  }
  function openImport(trigger) {
    const s = modal("Import past meals", trigger);
    let review = null;
    const selected = new Set();
    const summary = el("p", "food-meta");
    const toolbar = el("div", "food-import-toolbar");
    const list = el("div", "food-import-list");
    const importBtn = el("button", "btn btn--primary", "Import");
    importBtn.type = "button";
    const paintSelection = () => {
      const n = selected.size;
      importBtn.textContent =
        n === 0
          ? "Import"
          : `Import ${n} ${n === 1 ? "meal" : "meals"}`;
      importBtn.disabled = !review || n === 0;
      if (!review) {
        summary.textContent = "";
        return;
      }
      const photos = review.visits.reduce(
        (count, v) => count + (v.import_media?.length || 0),
        0,
      );
      summary.textContent = `${review.visits.length} food entries ready. ${review.skipped.length} skipped.${photos ? ` ${photos} photo references optional — skip them.` : ""} ${n} selected.`;
    };
    const setAll = (on) => {
      selected.clear();
      if (on && review) for (const v of review.visits) selected.add(v.id);
      for (const c of list.querySelectorAll("input[type=checkbox]"))
        c.checked = on;
      paintSelection();
      s.error.textContent = "";
    };
    toolbar.append(
      button("Select all", () => setAll(true), "ghost"),
      button("Select none", () => setAll(false), "ghost"),
    );
    s.fields.append(
      el(
        "p",
        "",
        "Choose a Day One JSON export. Everything is selected for you — one Import click. Photos are optional.",
      ),
      field("Day One JSON export", "", () => {}, { type: "file" }),
      summary,
      toolbar,
      list,
    );
    const input = s.fields.querySelector("input");
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      try {
        const file = input.files[0];
        if (!file || file.size > 20 * 1024 * 1024)
          throw new Error("Choose a JSON file under 20 MB.");
        review = importDayOne(JSON.parse(await file.text()), journal);
        selected.clear();
        list.replaceChildren();
        for (const v of review.visits) {
          selected.add(v.id);
          const label = el("label", "food-check"),
            c = el("input", "hub-check");
          c.type = "checkbox";
          c.checked = true;
          c.addEventListener("change", () => {
            c.checked ? selected.add(v.id) : selected.delete(v.id);
            paintSelection();
          });
          label.append(
            c,
            el("span", "", `${formatDisplayDate(v.date)}. ${v.title}`),
          );
          list.append(label);
        }
        paintSelection();
        s.error.textContent = review.visits.length
          ? ""
          : "No new food entries in that file.";
      } catch (e) {
        review = null;
        selected.clear();
        list.replaceChildren();
        paintSelection();
        s.error.textContent = e.message;
      }
    });
    const media = field(
      "Optional photo files (skip for text-only import)",
      "",
      () => {},
      { type: "file" },
    );
    media.querySelector("input").multiple = true;
    media.querySelector("input").accept = "image/*";
    s.fields.append(media);
    importBtn.addEventListener("click", async (ev) => {
      if (!review || !selected.size) {
        s.error.textContent = "Select at least one food entry.";
        return;
      }
      const target = ev.currentTarget;
      target.disabled = true;
      try {
        const next = structuredClone(journal),
          files = [...media.querySelector("input").files],
          chosen = structuredClone(
            review.visits.filter((v) => selected.has(v.id)),
          );
        let matched = 0,
          missing = 0;
        for (const v of chosen) {
          for (const ref of v.import_media || []) {
            const stem = (name) => name.replace(/\.[^.]+$/, "");
            const file = files.find((f) => {
              const base = stem(f.name);
              return (
                (ref.filename && f.name === ref.filename) ||
                (ref.identifier && base === ref.identifier) ||
                (ref.md5 && (base === ref.md5 || f.name === `${ref.md5}.jpg` || f.name === `${ref.md5}.jpeg`))
              );
            });
            if (file) {
              v.dishes[0].photos.push(
                await api.upload(await compressPhoto(file)),
              );
              matched += 1;
            } else missing += 1;
          }
          next.visits.push(v);
        }
        await persist(tidyImports(next).journal);
        s.close();
        const photoNote = files.length
          ? matched
            ? ` ${matched} photos attached.${missing ? ` ${missing} unmatched.` : ""}`
            : missing
              ? ` ${missing} photo references left unmatched.`
              : ""
          : missing
            ? ` ${missing} photo references skipped (text-only).`
            : "";
        status(
          `${chosen.length} ${chosen.length === 1 ? "visit" : "visits"} imported.${photoNote}`,
        );
      } catch (err) {
        s.error.textContent = err.message;
        paintSelection();
      }
    });
    paintSelection();
    s.actions.append(button("Cancel", s.close, "ghost"), importBtn);
  }
  async function backup() {
    if (!loaded) {
      status("Load your journal before backing up.", true);
      return;
    }
    if (busy) return;
    const token = epoch;
    status("Preparing backup with photos.");
    try {
      const assets = {};
      for (const p of liveVisits(journal).flatMap((v) =>
        v.dishes.flatMap((d) => d.photos),
      )) {
        if (assets[p.key]) continue;
        const { url } = await api.media({ action: "read", key: p.key }),
          res = await fetch(url);
        if (!res.ok) throw new Error("Photo download failed. Retry backup.");
        assets[p.key] = await encodedPhoto(await res.blob());
        if (JSON.stringify(assets).length > 100 * 1024 * 1024)
          throw new Error("Photo backup exceeds 100 MB.");
      }
      if (token !== epoch) return;
      download(
        { format: "life-food-backup", version: 1, journal, assets },
        "food-journal-backup.json",
      );
      status("Backup downloaded with photos.");
    } catch (e) {
      status(e.message, true);
    }
  }
  function restore(trigger) {
    const s = modal("Restore backup", trigger);
    let backup = null;
    s.fields.append(
      field("Food Journal backup", "", () => {}, { type: "file" }),
    );
    const input = s.fields.querySelector("input");
    input.accept = ".json";
    input.addEventListener("change", async () => {
      try {
        const file = input.files[0];
        if (!file || file.size > 120 * 1024 * 1024)
          throw new Error("Choose a backup under 120 MB.");
        backup = JSON.parse(await file.text());
        if (
          backup.format !== "life-food-backup" ||
          backup.version !== 1 ||
          backup.journal?.schema_version !== 1 ||
          !Array.isArray(backup.journal.visits) ||
          !Array.isArray(backup.journal.recipes)
        )
          throw new Error("Invalid Food Journal backup.");
        s.error.textContent = `Review: ${backup.journal.visits.length} visits and ${backup.journal.recipes.length} recipes. Existing records stay unchanged.`;
      } catch (e) {
        backup = null;
        s.error.textContent = e.message;
      }
    });
    s.actions.append(
      button("Cancel", s.close, "ghost"),
      button(
        "Restore",
        async (e) => {
          if (!backup) {
            s.error.textContent = "Choose a valid backup.";
            return;
          }
          e.currentTarget.disabled = true;
          try {
            const imported = structuredClone(backup.journal),
              next = structuredClone(journal),
              ids = new Set([
                ...next.visits.map((v) => v.id),
                ...(next.reserved_visit_ids || []),
              ]),
              sources = new Set([
                ...next.visits.map((v) => v.source_id).filter(Boolean),
                ...(next.reserved_source_ids || []),
              ]);
            const photos = new Map();
            for (const v of imported.visits) {
              if (ids.has(v.id) || (v.source_id && sources.has(v.source_id)))
                continue;
              for (const d of v.dishes)
                for (let n = 0; n < d.photos.length; n++) {
                  const p = d.photos[n];
                  if (!photos.has(p.key)) {
                    const data = backup.assets?.[p.key];
                    if (
                      typeof data !== "string" ||
                      data.length > 6 * 1024 * 1024
                    )
                      throw new Error("A photo is missing from this backup.");
                    const bytes = Uint8Array.from(atob(data), (c) =>
                      c.charCodeAt(0),
                    );
                    photos.set(
                      p.key,
                      await api.upload(
                        new Blob([bytes], { type: "image/jpeg" }),
                      ),
                    );
                  }
                  d.photos[n] = photos.get(p.key);
                }
              next.visits.push(v);
              ids.add(v.id);
              if (v.source_id) sources.add(v.source_id);
            }
            const dishIds = new Set(
              next.visits.flatMap((v) => v.dishes.map((d) => d.id)),
            );
            for (const r of imported.recipes)
              if (
                dishIds.has(r.dish_id) &&
                !next.recipes.some(
                  (x) => x.id === r.id || x.dish_id === r.dish_id,
                )
              )
                next.recipes.push(r);
            await persist(next);
            s.close();
          } catch (err) {
            s.error.textContent = err.message;
            e.currentTarget.disabled = false;
          }
        },
        "primary",
      ),
    );
  }
  root.querySelector("#refresh-button")?.addEventListener("click", () => {
    if (host?.hidden === false) void load();
  });
  function reset() {
    epoch++;
    for (const c of filterControls) c.dispose();
    filterControls = [];
    dialog?.close();
    dialog = null;
    journal = emptyJournal();
    version = null;
    loaded = false;
    entryId = null;
    fixIndex = 0;
    book = { sort: "recent" };
    editorialFailed.clear();
    photoCache.clear();
    photoExpires.clear();
    for (const observer of photoObservers) observer.disconnect();
    photoObservers.clear();
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.clear();
    host?.replaceChildren();
  }
  return {
    show() {
      if (!host) return;
      if (!loaded || sentToBrisket) {
        sentToBrisket = false;
        render();
        void load();
      } else render();
    },
    reset,
    reload: load,
  };
}
export function scaleIngredient(line, factor) {
  if (!Number.isFinite(factor) || factor <= 0) return line;
  const fractions = {
    "¼": 0.25,
    "½": 0.5,
    "¾": 0.75,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
  };
  const parse = (value) => {
    if (fractions[value] != null) return fractions[value];
    let match = value.match(/^(\d+)([¼½¾⅓⅔⅛⅜⅝⅞])$/);
    if (match) return Number(match[1]) + fractions[match[2]];
    match = value.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (match) return Number(match[1]) + Number(match[2]) / Number(match[3]);
    match = value.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (match) return Number(match[1]) / Number(match[2]);
    return Number(value);
  };
  const quantity = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?|\.\d+|[¼½¾⅓⅔⅛⅜⅝⅞])`;
  const scaled = (value) => {
    const n = parse(value) * factor;
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : value;
  };
  const range = new RegExp(
    `^(${quantity})\\s*(to|or|[-–—])\\s*(${quantity})(?=\\s|$|[a-zA-Z])`,
    "i",
  );
  if (range.test(line))
    return line.replace(
      range,
      (_, a, separator, b) =>
        `${scaled(a)} ${separator.toLowerCase() === "or" ? "or" : "to"} ${scaled(b)}`,
    );
  return line.replace(new RegExp(`^(${quantity})(?=\\s|$|[a-zA-Z])`), (value) =>
    scaled(value),
  );
}

function download(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
