import { formatDisplayDate } from "../../../../packages/design-kit/js/format-display-date.js";
import { createViewOnMap } from "../../../../packages/design-kit/js/view-on-map.js";
import {
  liveVisits,
  journalHighlights,
  visitPhotos,
  visitRating,
  firstSentence,
  noteBlocks,
  plainNotes,
  visitTags,
  tagKey,
  tagLabel,
  HASHTAG,
  venueHistory,
  fixupQueue,
  isImport,
} from "./model.js";

// Painters for the magazine, timeline, entry and fix-up pages. The view owns
// state and writes; these only build DOM from the journal and call back.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const utc = (date) => new Date(`${date}T00:00:00Z`);
export const monthLabel = (date) =>
  new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc(date));
const weekday = (date) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" })
    .format(utc(date))
    .replace(".", "");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const dishes = (n) => plural(n, "dish", "dishes");
const unique = (values) => [...new Set(values.filter(Boolean))];
const headline = (visit) =>
  visit.editorial?.headline || visit.title || visit.dishes[0]?.title || "Meal";
const standfirst = (visit) =>
  visit.editorial?.standfirst || firstSentence(visit.notes);

function stars(value) {
  const span = el("span", "fj-stars");
  const halves = Math.round(value * 2),
    full = Math.floor(halves / 2),
    half = halves % 2;
  span.setAttribute("role", "img");
  span.setAttribute("aria-label", `${value} out of 5`);
  span.append("★".repeat(full));
  if (half) span.append(el("span", "fj-stars__half", "★"));
  span.append(el("span", "fj-stars__off", "★".repeat(5 - full - half)));
  return span;
}
// Whole-card click target that stays a real button inside the heading.
function tagButton(ctx, key) {
  const b = el("button", "fj-tag", tagLabel(key));
  b.type = "button";
  b.setAttribute("aria-label", `Show every ${tagLabel(key)} entry`);
  b.addEventListener("click", () => ctx.openTag(key));
  return b;
}
// Text with its #hashtags turned into tag buttons.
function withTags(ctx, node, text) {
  let last = 0;
  for (const m of text.matchAll(HASHTAG)) {
    const start = m.index + m[1].length;
    node.append(text.slice(last, start), tagButton(ctx, tagKey(m[2])));
    last = start + m[2].length + 1;
  }
  node.append(text.slice(last));
  return node;
}
function stretch(tag, cls, text, onOpen) {
  const heading = el(tag, cls);
  const b = el("button", "fj-stretch", text);
  b.type = "button";
  b.addEventListener("click", () => onOpen(b));
  heading.append(b);
  return heading;
}
function media(ctx, photo, cls) {
  const box = el("div", cls);
  if (photo) box.append(ctx.photoNode(photo));
  return box;
}
function kicker(text) {
  return el("p", "fj-kicker", text);
}

export function paintMagazine(ctx, host) {
  const journal = ctx.journal();
  const h = journalHighlights(journal, ctx.today());
  if (!h.cover) {
    host.append(
      el("p", "canvas-status", "Add your first visit or import past meals."),
    );
    return;
  }
  const page = el("div", "fj-magazine");
  const mast = el("header", "fj-masthead");
  const word = el("p", "fj-masthead__word fj-serif");
  word.setAttribute("aria-hidden", "true");
  word.append("The Food ", el("em", "", "Journal"));
  const edition = el("p", "fj-masthead__edition");
  edition.append(
    el("span", "", `Entry No. ${h.total}`),
    el("span", "", monthLabel(`${h.month.key}-01`)),
    el("span", "", plural(h.places, "place", "places")),
  );
  mast.append(word, edition);
  page.append(mast, cover(ctx, h.cover));

  const tiles = el("section", "fj-tiles");
  tiles.setAttribute("aria-label", "This month at a glance");
  const month = monthLabel(`${h.month.key}-01`).split(" ")[0];
  const meals = el("div", "fj-tile fj-tile--navy");
  meals.append(
    kicker(`${month} so far`),
    el("p", "fj-tile__figure fj-serif", String(h.month.meals)),
    el(
      "p",
      "fj-tile__line",
      `${h.month.meals === 1 ? "meal" : "meals"} · ${h.month.newPlaces} new ${h.month.newPlaces === 1 ? "place" : "places"}`,
    ),
  );
  tiles.append(meals);
  if (h.month.best) {
    const { dish, visit } = h.month.best;
    const photo = dish.photos[0];
    const best = el(
      "article",
      `fj-tile fj-tile--best${photo ? " fj-tile--photo" : ""}`,
    );
    if (photo)
      best.append(
        media(ctx, photo, "fj-tile__media"),
        el("div", "fj-cover__shade"),
      );
    const body = el("div", "fj-tile__overlay");
    body.append(
      kicker(`Best of ${month}`),
      stretch("h3", "fj-tile__dish fj-serif", dish.title, () =>
        ctx.openEntry(visit.id),
      ),
    );
    const meta = el("p", "fj-tile__line");
    meta.append(`${visit.venue.name || "At home"} · `, stars(dish.rating));
    body.append(meta);
    best.append(body);
    tiles.append(best);
  }
  if (h.month.average != null) {
    const avg = el("div", "fj-tile fj-tile--peach");
    const prev = h.month.previousAverage;
    avg.append(
      kicker("Average rating"),
      el("p", "fj-tile__figure fj-serif fj-italic", String(h.month.average)),
      el(
        "p",
        "fj-tile__line",
        prev == null
          ? "this month"
          : prev === h.month.average
            ? "same as last month"
            : `${h.month.average > prev ? "up" : "down"} from ${prev} last month`,
      ),
    );
    tiles.append(avg);
  }
  if (h.cuisines.length) {
    const tile = el("div", "fj-tile fj-tile--line");
    const list = el("ol", "fj-ranks");
    for (const [name, count] of h.cuisines) {
      const li = el("li");
      li.append(
        el("span", "fj-serif", name),
        el("span", "fj-leader"),
        el("span", "", String(count)),
      );
      list.append(li);
    }
    tile.append(kicker("Most eaten this year"), list);
    tiles.append(tile);
  }
  page.append(tiles);

  if (h.recent.length) {
    const section = el("section", "fj-section");
    const head = el("div", "fj-section__head");
    const more = el("button", "fj-textlink", "See the timeline →");
    more.type = "button";
    more.addEventListener("click", () => ctx.setMode("timeline"));
    head.append(el("h2", "fj-section__title fj-serif", "Recently"), more);
    const grid = el("div", "fj-portraits");
    for (const visit of h.recent) grid.append(portrait(ctx, visit));
    section.append(head, grid);
    page.append(section);
  }

  const split = el("section", "fj-split");
  if (h.yearBest.length) {
    const best = el("div", "fj-split__main");
    const title = el("h2", "fj-section__title fj-serif");
    title.append("The year's best, ", el("em", "", "so far"));
    const list = el("ol", "fj-best");
    h.yearBest.forEach(({ dish, visit }, index) => {
      const li = el("li", "fj-best__item");
      const text = el("div", "fj-best__text");
      text.append(
        stretch("h3", "fj-best__dish fj-serif", dish.title, () =>
          ctx.openEntry(visit.id),
        ),
        el(
          "p",
          "fj-meta",
          `${visit.venue.name || "Cooked at home"} · ${formatDisplayDate(visit.date)}`,
        ),
      );
      li.append(el("span", "fj-best__n fj-serif", String(index + 1)), text);
      if (dish.photos[0])
        li.append(media(ctx, dish.photos[0], "fj-best__thumb"));
      list.append(li);
    });
    best.append(title, list);
    split.append(best);
  }
  const aside = el("aside", "fj-split__aside");
  if (h.onThisDay) {
    const v = h.onThisDay;
    const card = el("article", "fj-card fj-card--peach");
    card.append(kicker(`On this day · ${v.date.slice(0, 4)}`));
    const photo = visitPhotos(v)[0];
    if (photo) card.append(media(ctx, photo, "fj-card__media"));
    card.append(
      stretch("h3", "fj-card__title fj-serif", headline(v), () =>
        ctx.openEntry(v.id),
      ),
    );
    const quote = v.editorial?.pull_quote || firstSentence(v.notes);
    if (quote) card.append(el("p", "fj-card__quote fj-serif fj-italic", `“${quote}”`));
    aside.append(card);
  }
  const menu = el("div", "fj-card fj-card--outline");
  const open = el("button", "fj-textlink", "Open the menu →");
  open.type = "button";
  open.addEventListener("click", () => ctx.setMode("menu"));
  menu.append(
    kicker("The Custom Menu"),
    el(
      "p",
      "fj-card__lede fj-serif",
      "Craving something you've eaten before? Pick a dish, then cook it or find it again.",
    ),
    open,
  );
  aside.append(menu);
  split.append(aside);
  page.append(split);
  host.append(page);
}

function cover(ctx, visit) {
  const photos = visitPhotos(visit);
  const card = el(
    "article",
    `food-visit fj-cover${photos.length ? "" : " fj-cover--text"}`,
  );
  if (photos.length) {
    card.append(media(ctx, photos[0], "fj-cover__media"));
    card.append(el("div", "fj-cover__shade"));
  }
  const body = el("div", "fj-cover__body");
  body.append(
    kicker(
      `Latest entry · ${weekday(visit.date)} ${formatDisplayDate(visit.date)}`,
    ),
    stretch("h2", "fj-cover__title fj-serif", headline(visit), () =>
      ctx.openEntry(visit.id),
    ),
  );
  const lede = standfirst(visit);
  if (lede) body.append(el("p", "fj-cover__standfirst fj-serif fj-italic", lede));
  const meta = el("p", "fj-cover__meta");
  meta.append(
    el("strong", "", visit.venue.name || "At home"),
    el("span", "", unique(visit.dishes.map((d) => d.meal_type)).join(" · ")),
    el("span", "", dishes(visit.dishes.length)),
  );
  const rating = visitRating(visit);
  if (rating != null) meta.append(stars(rating));
  body.append(meta);
  card.append(body);
  if (photos.length > 1) {
    const thumbs = el("div", "fj-cover__thumbs");
    thumbs.setAttribute("aria-hidden", "true");
    for (const p of photos.slice(1, 4))
      thumbs.append(media(ctx, p, "fj-cover__thumb"));
    card.append(thumbs);
  }
  return card;
}

function portrait(ctx, visit) {
  const photo = visitPhotos(visit)[0];
  const card = el(
    "article",
    `food-visit fj-portrait${photo ? "" : " fj-portrait--text"}`,
  );
  if (photo) {
    card.append(media(ctx, photo, "fj-portrait__media"));
    card.append(el("div", "fj-cover__shade"));
  } else {
    const lede = visit.editorial?.pull_quote || firstSentence(visit.notes, 140);
    if (lede) card.append(el("p", "fj-portrait__quote fj-serif fj-italic", `“${lede}”`));
  }
  const body = el("div", "fj-portrait__body");
  body.append(
    kicker(
      unique([visit.dishes[0]?.cuisine, visit.dishes[0]?.meal_type]).join(
        " · ",
      ),
    ),
    stretch("h3", "fj-portrait__title fj-serif", headline(visit), () =>
      ctx.openEntry(visit.id),
    ),
    el(
      "p",
      "fj-portrait__meta",
      `${visit.venue.name || "At home"} · ${formatDisplayDate(visit.date)}`,
    ),
  );
  card.append(body);
  return card;
}

export function paintTimeline(ctx, list, query) {
  list.replaceChildren();
  const q = query.trim().toLowerCase();
  const tag = /^#\S+$/.test(q) ? tagKey(q) : "";
  const visits = liveVisits(ctx.journal()).filter(
    (visit) =>
      !q ||
      (tag ? visitTags(visit).includes(tag) : [
        ...visitTags(visit).map(tagLabel),
        visit.title,
        visit.editorial?.headline,
        visit.venue.name,
        visit.venue.address,
        visit.notes,
        visit.menu_text,
        ...visit.dishes.map((d) => d.title),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)),
  );
  if (!visits.length) {
    list.append(
      el(
        "p",
        "canvas-status",
        tag
          ? `No visits tagged ${tagLabel(tag)}.`
          : q
            ? "No visits match your search."
            : "Add your first visit or import past meals.",
      ),
    );
    return;
  }
  const months = new Map();
  for (const v of visits) {
    const key = v.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(v);
  }
  for (const [key, group] of months) {
    const section = el("section", "fj-month");
    const head = el("div", "fj-month__head");
    const [name, year] = monthLabel(`${key}-01`).split(" ");
    const title = el("h2", "fj-month__title fj-serif");
    title.append(`${name} `, el("em", "", year));
    head.append(
      title,
      el("span", "fj-kicker", `${group.length} ${group.length === 1 ? "entry" : "entries"}`),
    );
    section.append(head);
    for (const visit of group) section.append(row(ctx, visit));
    list.append(section);
  }
}

function row(ctx, visit) {
  const card = el("article", "food-visit fj-row");
  const date = el("div", "fj-row__date");
  date.append(
    el("span", "fj-row__dow", weekday(visit.date).toUpperCase()),
    el("span", "fj-row__day fj-serif", String(Number(visit.date.slice(8)))),
  );
  const body = el("div", "fj-row__body");
  body.append(
    stretch("h3", "fj-row__title fj-serif", visit.title || headline(visit), () =>
      ctx.openEntry(visit.id),
    ),
    el(
      "p",
      "fj-meta",
      unique([
        visit.venue.name || "At home",
        formatDisplayDate(visit.date),
        ...unique(visit.dishes.map((d) => d.cuisine)),
        ...(visitTags(visit).length
          ? [visitTags(visit).map(tagLabel).join(" ")]
          : unique(visit.dishes.map((d) => d.meal_type))),
      ]).join(" · "),
    ),
  );
  const lede = standfirst(visit);
  if (lede) body.append(el("p", "fj-row__excerpt fj-serif fj-italic", lede));
  if (isImport(visit) && !visit.reviewed)
    body.append(el("p", "fj-flag", "From Day One · needs fixing up"));
  card.append(date, body);
  const photo = visitPhotos(visit)[0];
  if (photo) {
    const box = media(ctx, photo, "fj-row__media");
    const rating = visitRating(visit);
    const label = el("span", "fj-row__label");
    label.append(dishes(visit.dishes.length));
    if (rating != null) label.append(" · ", stars(rating));
    box.append(label);
    card.append(box);
  }
  return card;
}

export function paintEntry(ctx, host, visit) {
  const page = el("article", "fj-entry");
  const nav = el("div", "fj-entry__nav");
  const back = ctx.button("← Food Journal", () => ctx.openEntry(null), "ghost");
  const actions = el("div", "food-actions");
  actions.append(
    ctx.button("Edit", (e) => ctx.editVisit(visit, e.currentTarget)),
    ctx.button("Delete", (e) => ctx.deleteVisit(visit, e.currentTarget), "ghost"),
  );
  nav.append(back, actions);
  page.append(nav);

  const head = el("header", "fj-entry__head");
  const tags = visitTags(visit);
  const kick = unique([
    ...unique(visit.dishes.map((d) => d.cuisine)),
    ...(tags.length ? [] : unique(visit.dishes.map((d) => d.meal_type))),
    isImport(visit) ? "From Day One" : "",
  ]).join(" · ");
  if (kick) head.append(kicker(kick));
  head.append(el("h2", "fj-entry__title fj-serif", visit.title || headline(visit)));
  if (visit.editorial?.standfirst)
    head.append(
      el("p", "fj-entry__standfirst fj-serif fj-italic", visit.editorial.standfirst),
    );
  page.append(head);

  const facts = el("dl", "fj-facts");
  const rating = visitRating(visit);
  for (const [label, value] of [
    ["When", formatDisplayDate(visit.date)],
    ["Where", visit.venue.name || "At home"],
    tags.length
      ? ["Tags", tags]
      : ["Meal", unique(visit.dishes.map((d) => d.meal_type)).join(", ")],
    ["Cuisine", unique(visit.dishes.map((d) => d.cuisine)).join(", ")],
    ["Rating", rating],
  ]) {
    if (value == null || value === "") continue;
    const cell = el("div", "fj-facts__cell");
    const dd = el("dd", "fj-serif");
    if (label === "Rating") dd.append(stars(value), ` ${value}`);
    else if (label === "Tags") {
      dd.classList.add("fj-tags");
      dd.append(...value.map((key) => tagButton(ctx, key)));
    } else dd.textContent = value;
    cell.append(el("dt", "", label), dd);
    facts.append(cell);
  }
  page.append(facts);

  const shots = visit.dishes.flatMap((dish) =>
    dish.photos.map((photo) => ({ photo, dish })),
  );
  if (shots.length) {
    const figure = el("figure", "fj-hero");
    const stage = el("div", "fj-hero__stage");
    const caption = el("figcaption", "fj-hero__caption fj-serif");
    const strip = el("div", "fj-strip");
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "Photos from this meal");
    const show = (index) => {
      stage.replaceChildren(ctx.photoNode(shots[index].photo), el("div", "fj-cover__shade"), caption);
      caption.textContent = shots[index].dish.title;
      for (const [n, b] of [...strip.children].entries())
        b.setAttribute("aria-pressed", String(n === index));
    };
    shots.forEach(({ photo, dish }, index) => {
      const b = el("button", "fj-strip__shot");
      b.type = "button";
      b.setAttribute("aria-label", `Show ${dish.title}`);
      b.append(ctx.photoNode(photo));
      b.addEventListener("click", () => show(index));
      strip.append(b);
    });
    figure.append(stage);
    if (shots.length > 1) figure.append(strip);
    page.append(figure);
    show(0);
  }

  const columns = el("div", "fj-entry__columns");
  const prose = el("div", "fj-prose fj-serif");
  const blocks = noteBlocks(visit.notes, { title: headline(visit) });
  const paragraphs = blocks.filter((b) => b.kind === "para");
  for (const block of blocks) {
    if (block.kind === "heading") {
      prose.append(el("h3", "fj-prose__label", block.text));
      continue;
    }
    const index = paragraphs.indexOf(block);
    prose.append(withTags(ctx, el("p", index === 0 ? "fj-prose__first" : ""), block.text));
    if (index === Math.min(1, paragraphs.length - 1) && visit.editorial?.pull_quote)
      prose.append(el("blockquote", "fj-pull fj-italic", `“${visit.editorial.pull_quote}”`));
  }
  if (!paragraphs.length)
    prose.append(el("p", "fj-meta", "No notes yet. Edit this visit to add them."));
  columns.append(prose);

  const aside = el("aside", "fj-entry__aside");
  if (visit.venue.name || visit.venue.address) {
    const place = el("section", "fj-card fj-card--outline fj-place");
    place.append(
      el("h3", "fj-card__title fj-serif", visit.venue.name || "Venue"),
      el("p", "fj-meta", visit.venue.address || ""),
    );
    if (visit.venue.address) {
      // Search the venue in its suburb, not the suburb alone.
      const map = createViewOnMap({
        address: unique([visit.venue.name, visit.venue.address]).join(", "),
        locationName: visit.venue.name,
      });
      if (map) place.append(map.el);
    }
    aside.append(place);
  }
  const history = venueHistory(ctx.journal(), visit);
  if (history.visits.length) {
    const card = el("section", "fj-card fj-card--peach fj-history");
    const top = el("div", "fj-history__head");
    top.append(
      el("h3", "fj-card__title fj-serif", `You and ${visit.venue.name}`),
      kicker(`${history.visits.length + 1} visits`),
    );
    const list = el("ol", "fj-history__list");
    for (const v of history.visits.slice(0, 6)) {
      const li = el("li");
      li.append(
        kicker(formatDisplayDate(v.date)),
        stretch("p", "fj-history__title fj-serif", `${v.title || headline(v)} · ${dishes(v.dishes.length)}`, () =>
          ctx.openEntry(v.id),
        ),
      );
      list.append(li);
    }
    card.append(top, list);
    if (history.always)
      card.append(
        el("p", "fj-card__quote fj-serif fj-italic", `You've ordered the ${history.always.toLowerCase()} every time.`),
      );
    aside.append(card);
  }
  if (aside.children.length) columns.append(aside);
  page.append(columns);

  const menu = el("section", "fj-menu");
  menu.setAttribute("aria-label", "What we ate");
  const menuHead = el("div", "fj-menu__head");
  menuHead.append(
    el("p", "fj-menu__venue", visit.venue.name || "At home"),
    el("p", "fj-menu__sub fj-serif fj-italic", `what we ate · ${dishes(visit.dishes.length)}`),
  );
  const list = el("ol", "fj-menu__list");
  for (const dish of visit.dishes) list.append(menuDish(ctx, visit, dish));
  menu.append(menuHead, list);
  page.append(menu);

  if (visit.menu_text) {
    const saved = el("details", "fj-card fj-card--outline fj-saved-menu");
    saved.append(el("summary", "", "Saved menu"), el("pre", "food-menu-text", visit.menu_text));
    page.append(saved);
  }

  const favourite = [...visit.dishes]
    .filter((d) => d.rating != null && d.rating >= 4)
    .sort((a, b) => b.rating - a.rating || b.photos.length - a.photos.length)[0];
  if (favourite && visit.dishes.length > 1) {
    const band = el("section", "fj-favourite");
    if (favourite.photos[0]) band.append(media(ctx, favourite.photos[0], "fj-favourite__media"));
    const text = el("div", "fj-favourite__body");
    const row = el("div", "food-actions");
    row.append(
      ctx.button(ctx.hasRecipe(favourite.id) ? "Open recipe" : "Find a recipe", (e) =>
        ctx.openRecipe(favourite, e.currentTarget),
      "primary"),
      ctx.button("Eat it again", (e) => ctx.openRestaurant(visit, e.currentTarget, favourite)),
    );
    const k = kicker("Tonight's favourite · ");
    k.append(stars(favourite.rating));
    text.append(k, el("h3", "fj-favourite__title fj-serif", favourite.title), row);
    band.append(text);
    page.append(band);
  }
  host.append(page);
}

function menuDish(ctx, visit, dish) {
  const li = el("li", "fj-dish");
  if (dish.photos[0]) li.append(media(ctx, dish.photos[0], "fj-dish__thumb"));
  const body = el("div", "fj-dish__body");
  const line = el("div", "fj-dish__line");
  line.append(el("h3", "fj-dish__title fj-serif", dish.title), el("span", "fj-leader"));
  const rate = el("div", "fj-rate");
  rate.setAttribute("role", "group");
  rate.setAttribute("aria-label", `Rate ${dish.title}`);
  for (let n = 1; n <= 5; n++) {
    const fill = dish.rating == null ? "" : n <= dish.rating ? " is-on" : n - 0.5 === dish.rating ? " is-half" : "";
    const b = el("button", `fj-rate__star${fill}`, "★");
    b.type = "button";
    b.setAttribute("aria-label", `${n} out of 5`);
    b.setAttribute("aria-pressed", String(dish.rating === n));
    b.addEventListener("click", () => ctx.rate(visit, dish, dish.rating === n ? null : n));
    rate.append(b);
  }
  line.append(rate);
  body.append(line);
  if (dish.notes && dish.notes !== visit.notes && plainNotes(dish.notes))
    body.append(el("p", "fj-dish__note fj-serif fj-italic", plainNotes(dish.notes)));
  const dishTags = unique(dish.tags.map(tagKey));
  if (dish.cuisine || dishTags.length) {
    const meta = el("p", "fj-meta fj-tags");
    if (dish.cuisine) meta.append(dish.cuisine);
    meta.append(...dishTags.map((key) => tagButton(ctx, key)));
    body.append(meta);
  }
  const actions = el("div", "fj-dish__actions");
  actions.append(
    ctx.button(ctx.hasRecipe(dish.id) ? "Open recipe" : "Find a recipe", (e) => ctx.openRecipe(dish, e.currentTarget), ctx.hasRecipe(dish.id) ? "primary" : "secondary"),
    ctx.button("Eat it again", (e) => ctx.openRestaurant(visit, e.currentTarget, dish), "ghost"),
  );
  body.append(actions);
  li.append(body);
  return li;
}

export function paintFixup(ctx, host, index) {
  const queue = fixupQueue(ctx.journal());
  const page = el("section", "fj-fixup");
  const head = el("header", "fj-fixup__head");
  head.append(
    el("h2", "fj-section__title fj-serif", "Fix up your Day One imports"),
    el(
      "p",
      "fj-meta",
      queue.length
        ? `${queue.length} left. The AI splits each entry into dishes; you check them, rate and add photos. Your original text is kept.`
        : "All imports are fixed up.",
    ),
  );
  page.append(head);
  if (!queue.length) {
    host.append(page);
    return;
  }
  const visit = queue[index % queue.length];
  const card = el("article", "fj-card fj-card--outline fj-fixup__card");
  card.append(
    kicker(`${weekday(visit.date)} ${formatDisplayDate(visit.date)}${visit.venue.name ? ` · ${visit.venue.name}` : ""}`),
    el("h3", "fj-card__title fj-serif", visit.title),
    el("p", "fj-fixup__original fj-serif", visit.notes),
  );
  const photos = visit.import_media?.length || 0;
  if (photos)
    card.append(
      el("p", "fj-meta", `${photos} photo ${photos === 1 ? "reference" : "references"} in Day One. Add the photos while you edit.`),
    );
  const actions = el("div", "food-actions");
  actions.append(
    ctx.button("Fix this entry", (e) => ctx.fixVisit(visit, e.currentTarget), "primary"),
    ctx.button("Skip for now", () => ctx.skipFixup(), "ghost"),
    ctx.button("Mark as done", (e) => ctx.markReviewed(visit, e.currentTarget), "ghost"),
  );
  card.append(actions);
  page.append(card);
  host.append(page);
}
