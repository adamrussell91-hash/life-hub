#!/usr/bin/env node
/**
 * Replace Food Journal photos that were stored as all-black JPEGs.
 *
 * The first Day One photo import converted iPhone HEIC files with macOS sips,
 * which wrote black images for recent photos. This finds every stored photo
 * that is black, matches it to the Day One original from the same entry by
 * EXIF capture time, converts that original again with a converter that
 * yields a real picture, and overwrites the same R2 key. The journal is not
 * changed, so nothing else needs saving.
 *
 * Usage (on your Mac, with the Day One export unzipped and life-hub-data
 * pulled so the journal is current):
 *   export R2_ACCOUNT_ID=… R2_BUCKET=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=…
 *   node scripts/repair-dayone-food-photos.mjs \
 *     --photos "/path/to/Day One Export/photos" \
 *     --journal "/path/to/life-hub-data/data/food-journal/journal.json" \
 *     --write
 *
 * Without --write: reports what it would repair and uploads nothing.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  knowledgeR2Config,
  knowledgeR2ClientOptions,
} from "../netlify/functions/_shared/knowledge-r2.mjs";
import {
  indexPhotos,
  matchPhoto,
  looksBlack,
  captureTime,
  toJpeg,
  photoCandidates,
  pickOriginal,
} from "./lib/dayone-photos.mjs";

// A black 1600px JPEG is ~35 KB; real photos here are 300 KB and up. Only
// objects under this size are downloaded and checked.
const SUSPECT_BYTES = 150 * 1024;

const args = parseArgs(process.argv.slice(2));
if (!args.photos || !args.journal) {
  console.error(
    'Usage: node scripts/repair-dayone-food-photos.mjs --photos "/path/to/photos" --journal journal.json [--write]',
  );
  process.exit(1);
}
const photosDir = resolve(args.photos),
  journalPath = resolve(args.journal);
if (!existsSync(photosDir) || !statSync(photosDir).isDirectory()) {
  console.error(`Photos folder not found: ${photosDir}`);
  process.exit(1);
}
if (!existsSync(journalPath)) {
  console.error(`Journal not found: ${journalPath}`);
  process.exit(1);
}
const config = knowledgeR2Config(process.env);
if (!config) {
  console.error("R2 env not set (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
  process.exit(1);
}

const index = indexPhotos(photosDir);
const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const candidates = photoCandidates(journal, index);
const client = new S3Client(knowledgeR2ClientOptions(config));
const work = mkdtempSync(join(tmpdir(), "food-repair-"));
const report = {
  photos: candidates.size,
  healthy: 0,
  black: 0,
  repaired: 0,
  methods: {},
  unresolved: [],
  write: Boolean(args.write),
};
const timeCache = new Map();
const timeOf = (file) => {
  if (!timeCache.has(file)) timeCache.set(file, captureTime(file));
  return timeCache.get(file);
};

try {
  let n = 0;
  for (const [key, files] of candidates) {
    if (++n % 50 === 0) console.error(`checked ${n}/${candidates.size}`);
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
      if ((head.ContentLength || 0) > SUSPECT_BYTES) {
        report.healthy += 1;
        continue;
      }
      const stored = join(work, "stored.jpg");
      const got = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      writeFileSync(stored, Buffer.from(await got.Body.transformToByteArray()));
      if (!looksBlack(stored, work)) {
        report.healthy += 1;
        continue;
      }
      report.black += 1;
      const original = pickOriginal(timeOf(stored), [...files], timeOf);
      if (!original) {
        report.unresolved.push({ key, reason: files.size ? "no original with the same capture time" : "no original found in the export" });
        continue;
      }
      const { body, method } = toJpeg(original, work);
      report.methods[method] = (report.methods[method] || 0) + 1;
      if (args.write)
        await client.send(
          new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: "image/jpeg" }),
        );
      report.repaired += 1;
    } catch (err) {
      report.unresolved.push({ key, reason: err.message });
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
if (!args.write && report.repaired)
  console.log(`Dry run: ${report.repaired} photos would be replaced. Add --write to upload.`);

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
