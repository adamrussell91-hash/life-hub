import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const PNG_AVATARS = [
  'apps/life/assets/agents/clementine.png',
  'apps/life/assets/agents/ann.png',
  'apps/life/assets/agents/clare.png',
  'apps/knowledge/public/assets/agents/clementine.png',
  'apps/knowledge/public/assets/agents/ann.png',
  'apps/teaching/public/assets/agents/clementine.png',
  'apps/teaching/public/assets/agents/ann.png',
  'apps/teaching/public/assets/agents/clare.png',
  'apps/teaching/public/assets/agents/hammond.png',
  'apps/tasks/public/assets/agents/clare.png'
];

function decodePngRgba(buf) {
  assert.equal(buf[0], 0x89, 'expected PNG signature');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  assert.equal(colorType, 6, 'expected 8-bit RGBA PNG avatars');
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(stride * height);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = raw.subarray(src, src + stride);
    src += stride;
    const dest = pixels.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bpp ? dest[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let recon = row[i];
      if (filter === 1) recon = (recon + left) & 255;
      else if (filter === 2) recon = (recon + up) & 255;
      else if (filter === 3) recon = (recon + ((left + up) >> 1)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        recon = (recon + pred) & 255;
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
      dest[i] = recon;
    }
    prev = Buffer.from(dest);
  }
  return { width, height, pixels };
}

function isBlack(pixels, width, x, y) {
  const i = (y * width + x) * 4;
  return pixels[i + 3] < 12 || (pixels[i] < 22 && pixels[i + 1] < 22 && pixels[i + 2] < 22);
}

test('PNG personality portraits are square and fill the top of their frame', async () => {
  for (const relative of PNG_AVATARS) {
    const buf = await readFile(new URL(`../../${relative}`, import.meta.url));
    const { width, height, pixels } = decodePngRgba(buf);
    assert.equal(width, height, `${relative} should be square`);
    assert.ok(width >= 512, `${relative} should be at least 512px`);

    const band = Math.max(2, Math.round(height * 0.03));
    let content = 0;
    for (let y = 0; y < band; y += 1) {
      for (let x = Math.floor(width * 0.35); x < Math.ceil(width * 0.65); x += 1) {
        if (!isBlack(pixels, width, x, y)) content += 1;
      }
    }
    const sampled = band * Math.ceil(width * 0.3);
    assert.ok(
      content / sampled > 0.5,
      `${relative} has a black band at the top of the square (${content}/${sampled} content pixels)`
    );
  }
});
