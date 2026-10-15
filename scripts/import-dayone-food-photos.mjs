#!/usr/bin/env node
/**
 * Attach Day One export photos to an already-imported food journal.
 * Runs on the machine that has the photos — do not ship a multi-GB zip
 * through chat. Streams each matched JPEG to private R2 (food/photos/…).
 *
 * Usage (on your Mac, after unzipping the Day One export):
 *   export R2_ACCOUNT_ID=… R2_BUCKET=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=…
 *   node scripts/import-dayone-food-photos.mjs \
 *     --photos "/path/to/Day One Export/photos" \
 *     --journal "/path/to/life-hub-data/data/food-journal/journal.json" \
 *     --write
 *
 * Without --write: dry-run match report only.
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { validateFoodJournal } from "../netlify/functions/_shared/food-journal-schema.mjs";
import { knowledgeR2Config } from "../netlify/functions/_shared/knowledge-r2.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const args = parseArgs(process.argv.slice(2));
if (!args.photos || !args.journal) {
  console.error(
    [
      "Usage:",
      '  node scripts/import-dayone-food-photos.mjs --photos "/path/to/photos" --journal journal.json [--write]',
      "",
      "Requires R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in the environment.",
    ].join("\n"),
  );
  process.exit(1);
}

const photosDir = resolve(args.photos);
const journalPath = resolve(args.journal);
if (!existsSync(photosDir) || !statSync(photosDir).isDirectory()) {
  console.error(`Photos folder not found: ${photosDir}`);
  process.exit(1);
}
if (!existsSync(journalPath)) {
  console.error(`Journal not found: ${journalPath}`);
  process.exit(1);
}

const index = indexPhotos(photosDir);
const journal = validateFoodJournal(
  JSON.parse(readFileSync(journalPath, "utf8")),
);

const plan = [];
let already = 0,
  missing = 0;
for (const visit of journal.visits) {
  const dish = visit.dishes?.[0];
  if (!dish) continue;
  for (const ref of visit.import_media || []) {
    if (dish.photos?.length) {
      already += 1;
      continue;
    }
    const file = matchPhoto(index, ref);
    if (!file) {
      missing += 1;
      continue;
    }
    plan.push({ visit, dish, ref, file });
  }
}

const summary = {
  photos_indexed: index.size,
  planned_uploads: plan.length,
  already_attached: already,
  unmatched_refs: missing,
  write: Boolean(args.write),
};

if (!args.write) {
  console.log(
    JSON.stringify(
      {
        ...summary,
        dry_run: true,
        sample: plan.slice(0, 5).map((p) => ({
          title: p.visit.title,
          file: basename(p.file),
          md5: p.ref.md5,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const env = process.env;
const config = knowledgeR2Config(env);
if (!config) {
  console.error(
    "R2 env not set (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).",
  );
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

const work = mkdtempSync(join(tmpdir(), "food-photos-"));
let uploaded = 0,
  failed = 0;
try {
  for (const item of plan) {
    try {
      const body = prepareJpeg(item.file, work);
      if (body.length > MAX_BYTES) {
        failed += 1;
        console.error(`too large after compress: ${basename(item.file)}`);
        continue;
      }
      const id = `photo_${randomUUID()}`;
      const key = `food/photos/${id}.jpg`;
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: "image/jpeg",
        }),
      );
      item.dish.photos.push({ id, key });
      uploaded += 1;
      if (uploaded % 25 === 0) {
        console.error(`uploaded ${uploaded}/${plan.length}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`failed ${basename(item.file)}: ${err.message}`);
    }
  }
  validateFoodJournal(journal);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  JSON.stringify({ ...summary, uploaded, failed, journal: journalPath }, null, 2),
);

function parseArgs(argv) {
  const result = { write: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") {
      result.write = true;
      continue;
    }
    if (arg === "--photos" || arg === "--journal") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing ${arg}`);
      result[arg.slice(2)] = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function indexPhotos(dir) {
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

function matchPhoto(index, ref) {
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

function prepareJpeg(sourcePath, workDir) {
  const raw = readFileSync(sourcePath);
  const lower = sourcePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    if (raw.length <= MAX_BYTES) return raw;
  }
  // ponytail: use macOS sips when present; otherwise require already-small JPEGs
  const out = join(workDir, `${randomUUID()}.jpg`);
  const sips = spawnSync(
    "sips",
    ["-s", "format", "jpeg", "-Z", "1600", sourcePath, "--out", out],
    { encoding: "utf8" },
  );
  if (sips.status !== 0 || !existsSync(out)) {
    if (raw.length <= MAX_BYTES && (lower.endsWith(".jpg") || lower.endsWith(".jpeg")))
      return raw;
    throw new Error(
      sips.stderr?.trim() ||
        "Need JPEG ≤4MB, or macOS sips to compress larger/HEIC photos.",
    );
  }
  return readFileSync(out);
}
