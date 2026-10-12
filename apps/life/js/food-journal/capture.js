import { nearbyVenues } from "./model.js";
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
  if (!next.title) next.title = draft.title;
  if (!next.venue.name) next.venue.name = draft.venue.name;
  if (!next.venue.address) next.venue.address = draft.venue.address;
  if (!next.menu_text) next.menu_text = draft.menu_text;
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
          rating: null,
          photos: [],
        });
    }
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

export function captureBatches(images) {
  const menu = images.filter((i) => i.role === "menu").slice(-1);
  const dishes = images.filter((i) => i.role === "dish");
  if (!dishes.length) return menu.length ? [menu] : [];
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
