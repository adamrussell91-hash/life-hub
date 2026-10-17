import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bmpIsBlack,
  toJpeg,
  pickOriginal,
  photoCandidates,
} from "../../scripts/lib/dayone-photos.mjs";

function bmp(width, height, pixel) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const b = Buffer.alloc(54 + row * height);
  b.write("BM", 0, "latin1");
  b.writeUInt32LE(54, 10);
  b.writeInt32LE(width, 18);
  b.writeInt32LE(height, 22);
  b.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, bl] = pixel(x, y);
      b[54 + y * row + x * 3] = bl;
      b[55 + y * row + x * 3] = g;
      b[56 + y * row + x * 3] = r;
    }
  return b;
}

test("black detection flags an all-black frame, not a dark photo", () => {
  assert.equal(bmpIsBlack(bmp(5, 3, () => [0, 0, 0])), true);
  assert.equal(bmpIsBlack(bmp(5, 3, (x, y) => (x === 4 && y === 2 ? [40, 20, 10] : [3, 3, 3]))), false);
  assert.equal(bmpIsBlack(Buffer.from("not a bmp")), false);
});

test("conversion skips a converter that writes black and keeps the first real picture", () => {
  const work = mkdtempSync(join(tmpdir(), "dayone-test-"));
  try {
    const source = join(work, "IMG.heic");
    writeFileSync(source, "heic");
    const calls = [];
    // Fake macOS tools: plain sips writes a black JPEG, sips with the sRGB
    // match writes a real one. "-s format bmp" previews whatever it is given.
    const run = (cmd, args) => {
      calls.push(`${cmd} ${args.includes("-m") ? "srgb" : args[2]}`);
      const out = args.at(-1);
      if (args.includes("bmp")) {
        const input = args.at(-3);
        const black = String(readText(input)).startsWith("BLACK");
        writeFileSync(out, bmp(4, 4, () => (black ? [0, 0, 0] : [120, 80, 40])));
      } else writeFileSync(out, args.includes("-m") ? "REAL jpeg" : "BLACK jpeg");
      return { status: 0, stdout: "" };
    };
    const { body, method } = toJpeg(source, work, run);
    assert.equal(method, "sips-srgb");
    assert.equal(String(body), "REAL jpeg");
    assert.deepEqual(calls, ["sips jpeg", "sips bmp", "sips srgb", "sips bmp"]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("a black photo is matched to the original taken at the same moment in its entry", () => {
  const index = new Map([
    ["aaa", "/x/aaa.heic"],
    ["bbb", "/x/bbb.heic"],
  ]);
  const journal = {
    visits: [
      {
        import_media: [{ md5: "aaa" }, { md5: "bbb" }, { md5: "missing" }],
        dishes: [{ photos: [{ key: "k1" }] }, { photos: [{ key: "k2" }] }],
      },
      { status: "deleted", import_media: [{ md5: "bbb" }], dishes: [{ photos: [{ key: "k2" }] }] },
    ],
  };
  const map = photoCandidates(journal, index);
  assert.deepEqual([...map.get("k1")], ["/x/aaa.heic", "/x/bbb.heic"]);
  const times = { "/x/aaa.heic": "2026:04:14 15:41:39", "/x/bbb.heic": "2026:04:14 15:41:45" };
  const timeOf = (f) => times[f];
  assert.equal(pickOriginal("2026:04:14 15:41:45", [...map.get("k1")], timeOf), "/x/bbb.heic");
  assert.equal(pickOriginal("2026:01:01 00:00:00", [...map.get("k1")], timeOf), null);
  assert.equal(pickOriginal("", ["/x/aaa.heic"], timeOf), "/x/aaa.heic");
});

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
