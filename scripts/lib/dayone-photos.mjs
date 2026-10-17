// Shared by the Day One photo import and repair scripts. Runs on the Mac that
// holds the Day One export; conversion uses macOS tools only.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

export const MAX_BYTES = 4 * 1024 * 1024;
const SRGB = "/System/Library/ColorSync/Profiles/sRGB Profile.icc";

export const defaultRun = (cmd, args) =>
  spawnSync(cmd, args, { encoding: "utf8" });

export function indexPhotos(dir) {
  // Day One names files {md5}.jpeg — index stems/names only; no full-file hash of a multi-GB folder.
  const map = new Map();
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!/\.(jpe?g|heic|heif|png|webp)$/i.test(name)) continue;
      const stem = basename(name, extname(name)).toLowerCase();
      map.set(stem, full);
      map.set(name.toLowerCase(), full);
    }
  }
  return map;
}

export function matchPhoto(index, ref) {
  for (const key of [
    ref.md5,
    ref.identifier,
    ref.filename,
    ref.filename && basename(ref.filename, extname(ref.filename)),
  ]) {
    if (!key) continue;
    const hit = index.get(String(key).toLowerCase());
    if (hit) return hit;
  }
  return null;
}

// A 24/32-bit BMP whose every pixel is near black. Real photos, even dark
// ones, have some channel well above this.
export function bmpIsBlack(buffer) {
  if (buffer.length < 54 || buffer.toString("latin1", 0, 2) !== "BM") return false;
  const offset = buffer.readUInt32LE(10),
    width = buffer.readInt32LE(18),
    height = Math.abs(buffer.readInt32LE(22)),
    bytes = buffer.readUInt16LE(28) / 8;
  if (bytes !== 3 && bytes !== 4) return false;
  const row = Math.ceil((width * bytes) / 4) * 4;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = offset + y * row + x * bytes;
      if (buffer[at] > 12 || buffer[at + 1] > 12 || buffer[at + 2] > 12) return false;
    }
  return true;
}

export function looksBlack(path, work, run = defaultRun) {
  const out = join(work, `${randomUUID()}.bmp`);
  const r = run("sips", ["-s", "format", "bmp", "-Z", "32", path, "--out", out]);
  if (r.status !== 0 || !existsSync(out)) return false;
  return bmpIsBlack(readFileSync(out));
}

// EXIF capture time as sips reports it, e.g. "2026:04:14 15:41:39".
export function captureTime(path, run = defaultRun) {
  const r = run("sips", ["-g", "creation", path]);
  const m = String(r.stdout || "").match(/creation:\s*(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})/);
  return m ? m[1] : "";
}

// macOS sips turned recent iPhone HEIC photos into all-black JPEGs. Try each
// converter in turn and keep the first result that is a real picture.
export function toJpeg(source, work, run = defaultRun) {
  const lower = source.toLowerCase();
  const raw = readFileSync(source);
  if (/\.jpe?g$/.test(lower) && raw.length <= MAX_BYTES && !looksBlack(source, work, run))
    return { body: raw, method: "original" };
  const attempts = [
    ["sips", (out) => ["sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", "-Z", "1600", source, "--out", out]]],
    ["sips-srgb", (out) => ["sips", ["-m", SRGB, "-s", "format", "jpeg", "-s", "formatOptions", "85", "-Z", "1600", source, "--out", out]]],
    ["magick", (out) => ["magick", [source, "-auto-orient", "-colorspace", "sRGB", "-resize", "1600x1600>", "-quality", "85", out]]],
  ];
  for (const [method, command] of attempts) {
    const out = join(work, `${randomUUID()}.jpg`);
    const [cmd, args] = command(out);
    const r = run(cmd, args);
    if (r.status !== 0 || !existsSync(out)) continue;
    const body = readFileSync(out);
    if (body.length <= MAX_BYTES && !looksBlack(out, work, run)) return { body, method };
  }
  // Quick Look renders the way Finder previews do; convert its PNG to JPEG.
  const dir = join(work, randomUUID());
  const ql = run("qlmanage", ["-t", "-s", "1600", "-o", dir, source]);
  const png = join(dir, `${basename(source)}.png`);
  if (ql.status === 0 && existsSync(png)) {
    const out = join(work, `${randomUUID()}.jpg`);
    const r = run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", png, "--out", out]);
    if (r.status === 0 && existsSync(out)) {
      const body = readFileSync(out);
      if (body.length <= MAX_BYTES && !looksBlack(out, work, run)) return { body, method: "quicklook" };
    }
  }
  throw new Error("every converter produced a black or oversized image");
}

// Every photo key with the Day One originals of the entry it sits in. Deleted
// (merged-away) visits are included so a merged visit's photos still find
// their originals.
export function photoCandidates(journal, photoIndex) {
  const map = new Map();
  for (const visit of journal.visits || []) {
    const files = (visit.import_media || [])
      .map((ref) => matchPhoto(photoIndex, ref))
      .filter(Boolean);
    for (const dish of visit.dishes || [])
      for (const photo of dish.photos || []) {
        const set = map.get(photo.key) || new Set();
        for (const f of files) set.add(f);
        map.set(photo.key, set);
      }
  }
  return map;
}

// The original taken at the same moment, or the only original in the entry.
export function pickOriginal(storedTime, files, timeOf) {
  if (storedTime) {
    const same = files.filter((f) => timeOf(f) === storedTime);
    if (same.length) return same[0];
  }
  return files.length === 1 ? files[0] : null;
}
