import { createHubFilter } from "../../../../packages/design-kit/js/hub-filter-menu.js";
import { formatDisplayDate } from "../../../../packages/design-kit/js/format-display-date.js";
import { openMorphingDialog } from "../../../../packages/design-kit/js/morphing-dialog.js";
import {
  createHubList,
  createHubMenuButton,
} from "../../../../packages/design-kit/js/hub-list.js";
import { showHubToast } from "../../../../packages/design-kit/js/hub-feedback.js";
import {
  createViewOnMap,
  mapsSearchUrl,
} from "../../../../packages/design-kit/js/view-on-map.js";
import {
  emptyJournal,
  liveVisits,
  menuDishes,
  newVisit,
  newDish,
  MEAL_TYPES,
  importDayOne,
  safeUrl,
  nearbyVenues,
} from "./model.js";
import {
  compressPhoto,
  inspectPhoto,
  encodedPhoto,
  mergeCapture,
  captureBatches,
} from "./capture.js";

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
  wrap.append(lab, input);
  return wrap;
}
export function createFoodJournalView({
  root = document,
  api,
  storage = globalThis.localStorage,
} = {}) {
  const host = root.querySelector("#food-journal-dashboard");
  let journal = emptyJournal(),
    version = null,
    loaded = false,
    busy = false,
    epoch = 0,
    mode = "journal",
    dialog = null;
  let filterControls = [],
    journalQuery = "",
    filters = {},
    photoCache = new Map(),
    photoExpires = new Map(),
    photoObservers = new Set(),
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
  function modal(title, trigger) {
    const frame = el("section", "food-sheet confirm-card"),
      heading = el("h2", "", title),
      fields = el("div", "food-sheet__fields"),
      error = el("p", "food-error");
    error.setAttribute("role", "alert");
    const actions = el("div", "food-sheet__actions");
    actions.dataset.part = "form-actions";
    frame.append(heading, fields, error, actions);
    let closed = false;
    const handle = openMorphingDialog({
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
  async function persist(next) {
    if (busy) throw new Error("A save is already running.");
    busy = true;
    const token = epoch;
    try {
      const value = await api.save(next, version);
      if (token !== epoch)
        throw new Error("Your session changed. Sign in again.");
      journal = value.journal;
      version = value.version;
      render();
      showHubToast("Saved.");
      return value;
    } finally {
      busy = false;
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
    } catch (e) {
      if (token !== epoch) return;
      status(e.message, true);
      const n = host.querySelector("[data-food-status]");
      n?.append(button("Retry", load));
    }
  }
  function rating(dish, onRate) {
    const row = el("div", "food-rating");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", `Rate ${dish.title || "dish"}`);
    for (let n = 1; n <= 5; n++) {
      const b = button(String(n), () => onRate(n));
      b.setAttribute("aria-label", `${n} out of 5`);
      b.setAttribute("aria-pressed", String(dish.rating === n));
      row.append(b);
    }
    if (dish.rating != null)
      row.append(button("Clear", () => onRate(null), "ghost"));
    return row;
  }
  function photoNode(photo) {
    const image = el("img", "food-photo");
    image.alt = "Dish photo";
    image.loading = "lazy";
    const cached = photoCache.get(photo.key),
      token = epoch;
    let refreshed = false;
    const sign = () =>
      api
        .media({ action: "read", key: photo.key })
        .then(({ url }) => {
          if (token !== epoch) return;
          photoCache.set(photo.key, url);
          photoExpires.set(photo.key, Date.now() + 240000);
          image.src = url;
        })
        .catch(() => image.remove());
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
    )
      image.src = cached;
    else if (typeof IntersectionObserver === "function") {
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
    } else void sign();
    return image;
  }
  function dishCard(dish, visit, custom = false) {
    const card = el("article", "hub-card food-dish");
    if (dish.photos[0]) card.append(photoNode(dish.photos[0]));
    const content = el("div", "food-card__body");
    content.append(el("h3", "food-dish__title", dish.title));
    content.append(
      el(
        "p",
        "food-meta",
        [dish.cuisine, dish.meal_type, custom ? visit.venue.name : ""]
          .filter(Boolean)
          .join(" · "),
      ),
    );
    if (dish.tags.length) {
      const tags = el("div", "hub-chips");
      for (const t of dish.tags) tags.append(el("span", "hub-chip", t));
      content.append(tags);
    }
    content.append(
      rating(dish, async (value) => {
        if (busy) return;
        const next = structuredClone(journal);
        next.visits
          .find((v) => v.id === visit.id)
          .dishes.find((d) => d.id === dish.id).rating = value;
        try {
          await persist(next);
        } catch (e) {
          status(e.message, true);
        }
      }),
    );
    if (dish.notes) content.append(el("p", "food-notes", dish.notes));
    const actions = el("div", "food-actions");
    actions.append(
      button("Recipe", (e) => openRecipe(dish, e.currentTarget)),
      button(
        "Restaurant",
        (e) => openRestaurant(visit, e.currentTarget, dish),
        "ghost",
      ),
    );
    content.append(actions);
    card.append(content);
    return card;
  }
  function visitCard(visit) {
    const card = el("article", "hub-card food-visit");
    const photo = visit.dishes.flatMap((d) => d.photos)[0];
    if (photo) card.append(photoNode(photo));
    const body = el("div", "food-card__body");
    body.append(
      el(
        "h2",
        "food-visit__title",
        visit.title || visit.dishes[0]?.title || "Meal",
      ),
      el(
        "p",
        "food-meta",
        [
          visit.venue.name || "At home",
          formatDisplayDate(visit.date),
          `${visit.dishes.length} ${visit.dishes.length === 1 ? "dish" : "dishes"}`,
        ].join(" · "),
      ),
    );
    const preview = el(
      "p",
      "food-preview",
      visit.dishes
        .slice(0, 2)
        .map((d) => d.title)
        .join(", ") +
        (visit.dishes.length > 2 ? ` and ${visit.dishes.length - 2} more` : ""),
    );
    body.append(preview);
    body.append(
      rating(visit.dishes[0], async (value) => {
        if (busy) return;
        const next = structuredClone(journal);
        next.visits.find((v) => v.id === visit.id).dishes[0].rating = value;
        try {
          await persist(next);
        } catch (e) {
          status(e.message, true);
        }
      }),
    );
    const details = el("details", "food-stack"),
      summary = el(
        "summary",
        "",
        `View ${visit.dishes.length === 1 ? "dish" : "dishes"}`,
      ),
      stack = el("div", "food-stack__dishes");
    details.append(summary, stack);
    let painted = false;
    details.addEventListener("toggle", () => {
      if (details.open && !painted) {
        painted = true;
        for (const d of visit.dishes) stack.append(dishCard(d, visit));
      }
    });
    body.append(details);
    const actions = el("div", "food-actions");
    actions.append(
      button("Edit", (e) => editVisit(visit, e.currentTarget)),
      button("Delete", (e) => deleteVisit(visit, e.currentTarget), "ghost"),
    );
    body.append(actions);
    card.append(body);
    return card;
  }
  function render() {
    if (!host) return;
    for (const c of filterControls) c.dispose();
    filterControls = [];
    host.replaceChildren();
    const toolbar = el("div", "food-toolbar"),
      pills = el("div", "hub-pills");
    pills.setAttribute("role", "tablist");
    for (const [id, label] of [
      ["journal", "Journal"],
      ["menu", "Custom Menu"],
    ]) {
      const b = button(
        label,
        () => {
          mode = id;
          render();
        },
        "ghost",
      );
      b.className = "hub-pills__btn";
      b.classList.toggle("is-active", mode === id);
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(mode === id));
      pills.append(b);
    }
    toolbar.append(
      pills,
      button(
        "Add visit",
        (e) => editVisit(newVisit(), e.currentTarget),
        "primary",
      ),
      button("Import", (e) => openImport(e.currentTarget)),
      button("Backup", () => backup()),
      button("Restore", (e) => restore(e.currentTarget)),
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
    const grid = el("div", "food-grid");
    grid.dataset.foodGrid = "";
    if (mode === "journal") {
      const search = el("input", "hub-search");
      search.placeholder = "Search visits and saved menus";
      search.setAttribute("aria-label", "Search Food Journal");
      search.value = journalQuery;
      search.addEventListener("input", () => {
        journalQuery = search.value;
        paintVisits(grid);
      });
      host.append(search);
    }
    if (mode === "menu") {
      const controls = el("div", "food-filters");
      const search = el("input", "hub-search");
      search.placeholder = "Search dishes, venues and menus";
      search.setAttribute("aria-label", "Search Custom Menu");
      search.value = filters.query || "";
      search.addEventListener("input", () => {
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
    } else {
      paintVisits(grid);
    }
    host.append(grid);
  }
  function paintVisits(grid) {
    grid.replaceChildren();
    for (const visit of liveVisits(journal)) {
      const text = [
        visit.title,
        visit.venue.name,
        visit.venue.address,
        visit.notes,
        visit.menu_text,
        ...visit.dishes.map((d) => d.title),
      ]
        .join(" ")
        .toLowerCase();
      if (
        !journalQuery.trim() ||
        text.includes(journalQuery.toLowerCase().trim())
      )
        grid.append(visitCard(visit));
    }
    if (!grid.children.length)
      grid.append(
        el(
          "p",
          "canvas-status",
          journalQuery
            ? "No visits match your search."
            : "Add your first visit or import past meals.",
        ),
      );
  }
  function paintMenu(grid) {
    grid.replaceChildren();
    const found = menuDishes(journal, filters);
    for (const { dish, visit } of found)
      grid.append(dishCard(dish, visit, true));
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
            const next = structuredClone(journal);
            next.visits.find((v) => v.id === visit.id).status = "deleted";
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
  function editVisit(original, trigger) {
    const baseVersion = Object.hasOwn(original, "__draft_version")
      ? original.__draft_version
      : version;
    let visit = structuredClone(original);
    delete visit.__draft_version;
    const newerSavedVisit =
      baseVersion !== version
        ? journal.visits.find((v) => v.id === visit.id)
        : null;
    let reviewedNewerVisit = !newerSavedVisit;
    const s = modal(original.title ? "Edit visit" : "Add visit", trigger);
    let dishList = null,
      captureImages = [],
      pendingPhotos = [],
      photoGps = null,
      dateEdited = false,
      captureBusy = false;
    const persistDraft = () => writeDraft(visit, baseVersion);
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
      const place = el("div", "food-pair");
      place.append(
        field(
          "Venue",
          visit.venue.name,
          (v) => {
            visit.venue.name = v;
            persistDraft();
          },
          { max: 200 },
        ),
        field(
          "Address",
          visit.venue.address,
          (v) => {
            visit.venue.address = v;
            persistDraft();
          },
          { max: 1000 },
        ),
      );
      s.fields.append(place);
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
      s.fields.append(
        suggestions,
        button(
          "Find venue",
          async (e) => {
            e.currentTarget.disabled = true;
            try {
              const result = await api.places(
                visit.venue.name || "restaurant",
                photoGps || visit.venue,
              );
              suggestions.replaceChildren();
              for (const p of result.places)
                suggestions.append(
                  button(
                    p.name,
                    () => {
                      visit.venue = {
                        name: p.name,
                        address: p.address,
                        lat: p.lat,
                        lon: p.lon,
                      };
                      persistDraft();
                      fields();
                    },
                    "ghost",
                  ),
                );
              if (!result.places.length)
                s.error.textContent =
                  "No matching venues. Enter the address yourself.";
            } catch (err) {
              s.error.textContent = err.message;
            } finally {
              e.currentTarget.disabled = false;
            }
          },
          "ghost",
        ),
      );
      const capture = el("div", "hub-row food-capture");
      capture.append(el("h3", "", "Fill from photos"));
      for (const [role, label] of [
        ["dish", "Dish photos"],
        ["menu", "Menu photo"],
      ]) {
        const f = field(label, "", () => {}, { type: "file" }),
          input = f.querySelector("input");
        input.accept = "image/*";
        input.multiple = role === "dish";
        input.addEventListener("change", () =>
          captureFiles([...input.files], role),
        );
        capture.append(f);
      }
      const captureStatus = el(
        "p",
        "food-meta",
        `${captureImages.length} photos ready for extraction.`,
      );
      capture.append(
        captureStatus,
        button(
          "Extract details",
          async (e) => {
            if (captureBusy) return;
            if (!captureImages.length) {
              s.error.textContent = "Choose photos first.";
              return;
            }
            captureBusy = true;
            e.currentTarget.disabled = true;
            s.error.textContent = "Reading photos and menu.";
            try {
              const batches = captureBatches(captureImages),
                results = [];
              for (let index = 0; index < batches.length; index++) {
                s.error.textContent = `Reading photos ${index + 1} of ${batches.length}.`;
                const draft = (
                  await api.assist({
                    action: "capture",
                    images: batches[index],
                  })
                ).draft;
                results.push(draft);
              }
              for (const draft of results)
                visit = mergeCapture(visit, draft, pendingPhotos);
              attachPending();
              persistDraft();
              fields();
              s.error.textContent = "Review the extracted fields, then save.";
            } catch (err) {
              s.error.textContent = err.message;
            } finally {
              captureBusy = false;
              if (e.currentTarget) e.currentTarget.disabled = false;
            }
          },
          "secondary",
        ),
      );
      s.fields.append(capture);
      s.fields.append(
        field(
          "Menu text",
          visit.menu_text,
          (v) => {
            visit.menu_text = v;
            persistDraft();
          },
          { type: "textarea", max: 100000 },
        ),
        field(
          "Visit notes",
          visit.notes,
          (v) => {
            visit.notes = v;
            persistDraft();
          },
          { type: "textarea" },
        ),
      );
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
        },
        renderItem: (d, ctx) => {
          const block = el("div", "food-dish-editor");
          const set = (key, v) => {
            d[key] = v;
            ctx.update({ ...d });
            persistDraft();
          };
          block.append(
            field("Dish title", d.title, (v) => set("title", v), { max: 200 }),
            field("Cuisine", d.cuisine, (v) => set("cuisine", v), { max: 100 }),
            field("Meal type", d.meal_type, (v) => set("meal_type", v), {
              options: MEAL_TYPES,
            }),
            field("Indicators, separated by commas", d.tags.join(", "), (v) =>
              set(
                "tags",
                v
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 40),
              ),
            ),
            field("Dish notes", d.notes, (v) => set("notes", v), {
              type: "textarea",
            }),
          );
          const rates = el("div");
          const repaint = () => {
            rates.replaceChildren(
              rating(d, (v) => {
                set("rating", v);
                repaint();
              }),
            );
          };
          repaint();
          block.append(rates);
          const photos = el("div", "food-thumbnails");
          for (const p of d.photos) {
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
                      pendingPhotos = pendingPhotos.filter(
                        (x) => x.key !== p.key,
                      );
                      captureImages = captureImages.filter(
                        (x) => x.id !== p.id,
                      );
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
            photos.append(wrap);
          }
          block.append(photos);
          const f = field("Add photos to this dish", "", () => {}, {
            type: "file",
          });
          f.querySelector("input").accept = "image/*";
          f.querySelector("input").multiple = true;
          f.querySelector("input").addEventListener("change", async (e) => {
            captureBusy = true;
            save.disabled = true;
            try {
              for (const file of [...e.target.files]) {
                const blob = await compressPhoto(file),
                  p = await api.upload(blob);
                d.photos.push(p);
                const url = URL.createObjectURL(blob);
                objectUrls.add(url);
                photoCache.set(p.key, url);
                photos.append(photoNode(p));
              }
              set("photos", d.photos);
            } catch (err) {
              s.error.textContent = err.message;
            } finally {
              captureBusy = false;
              save.disabled = false;
            }
          });
          block.append(f);
          return block;
        },
      });
      s.fields.append(dishList.el);
    };
    function attachPending() {
      for (const p of pendingPhotos) {
        if (visit.dishes.some((d) => d.photos.some((x) => x.key === p.key)))
          continue;
        visit.dishes[0].photos.push(p);
      }
    }
    async function captureFiles(files, role) {
      if (captureBusy) return;
      captureBusy = true;
      save.disabled = true;
      s.error.textContent = "Preparing photos.";
      try {
        for (const file of files) {
          if (captureImages.length >= 30)
            throw new Error("Choose up to 30 photos per visit.");
          const metadata = await inspectPhoto(file, journal);
          if (metadata.date && !original.title && !dateEdited)
            visit.date = metadata.date;
          if (metadata.gps) {
            photoGps = metadata.gps;
            for (const item of metadata.suggestions)
              s.fields.append(
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
          }
          const blob = await compressPhoto(file, 1200);
          const data = await encodedPhoto(blob);
          if (role === "dish") {
            const p = await api.upload(blob);
            captureImages.push({ role, id: p.id, mime: blob.type, data });
            pendingPhotos.push(p);
            const u = URL.createObjectURL(blob);
            objectUrls.add(u);
            photoCache.set(p.key, u);
          } else {
            captureImages.push({
              role,
              id: `menu_${crypto.randomUUID()}`,
              mime: blob.type,
              data,
            });
          }
        }
        attachPending();
        persistDraft();
        fields();
        s.error.textContent =
          "Photos ready. Extract details or enter fields yourself.";
      } catch (err) {
        s.error.textContent = err.message;
      } finally {
        captureBusy = false;
        save.disabled = false;
      }
    }
    const save = button(
      "Save visit",
      async (e) => {
        if (captureBusy || busy) return;
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
          attachPending();
          const next = structuredClone(journal),
            index = next.visits.findIndex((v) => v.id === visit.id);
          if (index < 0) next.visits.push(visit);
          else next.visits[index] = visit;
          const ids = new Set(
            next.visits.flatMap((v) => v.dishes.map((d) => d.id)),
          );
          next.recipes = next.recipes.filter((r) => ids.has(r.dish_id));
          await persist(next);
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
    const selected = new Set(),
      list = el("div", "food-import-list");
    s.fields.append(
      el(
        "p",
        "",
        "Choose a Day One JSON export. Select the entries containing food.",
      ),
      field("Day One JSON export", "", () => {}, { type: "file" }),
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
        list.append(
          el(
            "p",
            "food-meta",
            `${review.visits.length} entries available. ${review.skipped.length} skipped.`,
          ),
        );
        for (const v of review.visits) {
          const label = el("label", "food-check"),
            c = el("input", "hub-check");
          c.type = "checkbox";
          c.addEventListener("change", () =>
            c.checked ? selected.add(v.id) : selected.delete(v.id),
          );
          label.append(
            c,
            el("span", "", `${formatDisplayDate(v.date)}. ${v.title}`),
          );
          list.append(label);
        }
        s.error.textContent = "Select food entries before importing.";
      } catch (e) {
        review = null;
        s.error.textContent = e.message;
      }
    });
    const media = field("Exported photo files", "", () => {}, { type: "file" });
    media.querySelector("input").multiple = true;
    media.querySelector("input").accept = "image/*";
    s.fields.append(media);
    s.actions.append(
      button("Cancel", s.close, "ghost"),
      button(
        "Import selected",
        async (e) => {
          if (!review || !selected.size) {
            s.error.textContent = "Select at least one food entry.";
            return;
          }
          e.currentTarget.disabled = true;
          try {
            const next = structuredClone(journal),
              files = [...media.querySelector("input").files],
              chosen = structuredClone(
                review.visits.filter((v) => selected.has(v.id)),
              );
            let missing = [];
            for (const v of chosen) {
              for (const ref of v.import_media) {
                const file = files.find(
                  (f) =>
                    f.name === ref.filename ||
                    f.name.replace(/\.[^.]+$/, "") === ref.identifier,
                );
                if (file) {
                  v.dishes[0].photos.push(
                    await api.upload(await compressPhoto(file)),
                  );
                } else missing.push(ref.filename || ref.identifier);
              }
              next.visits.push(v);
            }
            await persist(next);
            s.close();
            status(
              `${chosen.length} ${chosen.length === 1 ? "visit" : "visits"} imported.${missing.length ? ` ${missing.length} unmatched photos: ${missing.join(", ")}.` : ""}`,
            );
          } catch (err) {
            s.error.textContent = err.message;
            e.currentTarget.disabled = false;
          }
        },
        "primary",
      ),
    );
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
      if (!loaded) {
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
