import { nearbyVenues, newDish, unshoutVisit } from "./model.js";
export async function inspectPhoto(file, journal) {
  const exifr = await import("../../vendor/exifr.mjs");
  let raw = {};
  try {
    raw = (await exifr.parse(file, { reviveValues: false })) || {};
  } catch {
    /* metadata is optional */
  }
  const gps =
    Number.isFinite(raw.latitude) && Number.isFinite(raw.longitude)
      ? { lat: raw.latitude, lon: raw.longitude }
      : null;
  const wall =
    typeof raw.DateTimeOriginal === "string"
      ? raw.DateTimeOriginal.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})/)
      : null;
  const date = wall ? `${wall[1]}-${wall[2]}-${wall[3]}` : null;
  return { date, gps, suggestions: nearbyVenues(journal, gps) };
}
export async function compressPhoto(file, max = 1600) {
  let source = file;
  if (/heic|heif/i.test(file.type + file.name)) {
    const { heicTo } = await import("../../vendor/heic-to.mjs");
    source = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
  }
  const bitmap = await createImageBitmap(source, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob || blob.size > 4 * 1024 * 1024)
    throw new Error("Photo is too large. Choose a smaller image.");
  return blob;
}
export async function encodedPhoto(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
export function mergeCapture(visit, draft, photos = []) {
  const next = structuredClone(visit);
  draft = unshoutVisit(structuredClone(draft));
  if (!next.title) next.title = draft.title;
  if (!next.venue.name) next.venue.name = draft.venue.name;
  if (!next.venue.address) next.venue.address = draft.venue.address;
  if (!next.menu_text) next.menu_text = draft.menu_text;
  const items = next.menu_items || [];
  for (const item of draft.menu_items || [])
    if (!items.some((i) => sameName(i.name, item.name))) items.push(item);
  if (items.length) next.menu_items = items.slice(0, 200);
  for (const found of draft.dishes) {
    const old = next.dishes.find(
      (d) => d.title.trim().toLowerCase() === found.title.trim().toLowerCase(),
    );
    if (old) {
      for (const key of ["cuisine", "notes"])
        if (!old[key]) old[key] = found[key];
      if (!old.tags.length) old.tags = found.tags;
    } else {
      const blank = next.dishes.find((d) => !d.title.trim());
      if (blank) {
        blank.title = found.title;
        if (!blank.cuisine) blank.cuisine = found.cuisine;
        if (!blank.notes) blank.notes = found.notes;
        if (!blank.tags.length) blank.tags = found.tags;
        if (blank.meal_type === "Dinner") blank.meal_type = found.meal_type;
      } else
        next.dishes.push({
          ...found,
          id: `dish_${crypto.randomUUID()}`,
          ingredients: "",
          rating: null,
          photos: [],
        });
    }
  }
  for (const dish of next.dishes) {
    if (String(dish.ingredients || "").trim()) continue;
    const item = (next.menu_items || []).find(
      (i) => i.kind !== "extra" && sameName(i.name, dish.title),
    );
    if (item?.description) dish.ingredients = item.description;
  }
  for (const photo of photos) {
    const targets = draft.dishes
      .filter((found) => found.photo_ids?.includes(photo.id))
      .map((found) =>
        next.dishes.find(
          (d) =>
            d.title.trim().toLowerCase() === found.title.trim().toLowerCase(),
        ),
      )
      .filter(Boolean);
    if (!targets.length) continue;
    for (const dish of next.dishes)
      dish.photos = dish.photos.filter((p) => p.key !== photo.key);
    for (const dish of targets)
      if (!dish.photos.some((p) => p.key === photo.key))
        dish.photos.push(photo);
  }
  return next;
}

const sameName = (a, b) =>
  String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
// Extras (add bacon, a side of hash brown) ride on a dish as "+ name" lines.
const isExtra = (item) => item.kind === "extra";
const extraLine = (item) => `+ ${item.name}`;
// Older dishes carry extras in notes; new ones carry them in ingredients.
const lines = (dish) =>
  [dish.ingredients || "", dish.notes || ""].join("\n").split("\n");
const hasLine = (dish, line) => lines(dish).some((l) => sameName(l, line));
const dropLine = (value, line) =>
  String(value || "")
    .split("\n")
    .filter((l) => !sameName(l, line))
    .join("\n");
// The dish a menu item became, or -1. An extra is on the dish that carries
// its line, or is a dish of its own when nothing was ticked before it.
export const menuDishIndex = (visit, item) =>
  visit.dishes.findIndex(
    (d) =>
      sameName(d.title, item.name) ||
      (isExtra(item) && hasLine(d, extraLine(item))),
  );
// A ticked dish is untouched while Adam has added nothing of his own: no
// rating, tags, photos or notes, and ingredients still the menu's words.
const untouched = (dish, item) =>
  dish.rating == null &&
  !dish.tags.length &&
  !dish.photos.length &&
  !String(dish.notes || "").trim() &&
  [
    "",
    String(item.description || "").trim(),
    String(item.description_en || "").trim(),
  ].includes(
    String(dish.ingredients || "")
      .split("\n")
      .filter((l) => !l.startsWith("+ "))
      .join("\n")
      .trim(),
  );
// Ticking a menu item adds it as a dish, using the blank starter dish first,
// with the menu's ingredients in ingredients. Ticking an extra adds a line to
// the last dish's ingredients. Unticking removes it only while untouched.
// The last dish turns blank rather than going.
export function toggleMenuDish(visit, item) {
  const next = structuredClone(visit),
    index = menuDishIndex(next, item);
  if (index < 0) {
    const last = next.dishes.findLast((d) => d.title.trim());
    if (isExtra(item) && last) {
      last.ingredients = [
        String(last.ingredients || "").trimEnd(),
        extraLine(item),
      ]
        .filter(Boolean)
        .join("\n");
      return next;
    }
    const ingredients = String(item.description || "");
    const blank = next.dishes.find((d) => !d.title.trim());
    if (blank) {
      blank.title = item.name;
      if (!String(blank.ingredients || "").trim())
        blank.ingredients = ingredients;
    } else next.dishes.push({ ...newDish(), title: item.name, ingredients });
    return next;
  }
  const dish = next.dishes[index];
  if (!sameName(dish.title, item.name)) {
    dish.ingredients = dropLine(dish.ingredients, extraLine(item));
    dish.notes = dropLine(dish.notes, extraLine(item));
    return next;
  }
  if (!untouched(dish, item)) {
    if (!String(dish.ingredients || "").trim())
      dish.ingredients = String(item.description || "");
    return next;
  }
  if (next.dishes.length > 1) next.dishes.splice(index, 1);
  else Object.assign(dish, { title: "", notes: "", ingredients: "" });
  return next;
}

export function captureBatches(images) {
  const menus = images.filter((i) => i.role === "menu");
  const dishes = images.filter((i) => i.role === "dish");
  // Every page of a menu is read; with dish photos, the last page names them.
  if (!dishes.length) return budgeted(menus);
  const menu = menus.slice(-1);
  const batches = [];
  let batch = [...menu],
    size = menu.reduce((n, i) => n + i.data.length, 0);
  for (const image of dishes) {
    if (batch.length >= 6 || size + image.data.length > 3500000) {
      batches.push(batch);
      batch = [...menu];
      size = menu.reduce((n, i) => n + i.data.length, 0);
    }
    batch.push(image);
    size += image.data.length;
  }
  if (batch.some((i) => i.role === "dish")) batches.push(batch);
  return batches;
}

function budgeted(images) {
  const batches = [];
  let batch = [],
    size = 0;
  for (const image of images) {
    if (batch.length && (batch.length >= 6 || size + image.data.length > 3500000)) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(image);
    size += image.data.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
