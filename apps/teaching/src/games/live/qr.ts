/**
 * A small QR code encoder for the board's join link (no dependency): byte
 * mode, error correction level M, versions 1–10 (up to 213 bytes), the mask
 * with the lowest penalty. Follows the ISO 18004 layout as set out in Project
 * Nayuki's reference encoder (MIT). Returns the module grid; `qrSvg` draws it
 * with a four-module quiet zone.
 */

/** Error-correction codewords per block, level M, versions 1–10 (index 0 unused). */
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
/** Error-correction blocks, level M, versions 1–10. */
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Format bits for level M. */
const ECL_M = 0;
export const QR_MAX_VERSION = 10;

function rawModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (ver: number) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < out.length; j += 1) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < out.length) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const out = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (out.shift() as number);
    out.push(0);
    divisor.forEach((coef, i) => {
      out[i] ^= gfMul(coef, factor);
    });
  }
  return out;
}

function utf8(text: string): number[] {
  if (typeof TextEncoder === 'function') return Array.from(new TextEncoder().encode(text));
  return Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));
}

/** The smallest version that holds `n` bytes in byte mode at level M, or 0 when too long. */
export function qrVersionFor(n: number): number {
  for (let v = 1; v <= QR_MAX_VERSION; v += 1) {
    const cc = v <= 9 ? 8 : 16;
    if (4 + cc + 8 * n <= dataCodewords(v) * 8) return v;
  }
  return 0;
}

/** The module grid (true = dark) for `text`. Throws when the text is longer than version 10 holds. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = utf8(text);
  const ver = qrVersionFor(bytes.length);
  if (!ver) throw new Error('That link is too long for the QR code.');
  const size = ver * 4 + 17;

  // Data bits.
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Error correction, interleaved.
  const numBlocks = BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const short = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const div = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < short ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < short) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= short) codewords.push(block[i]);
    });
  }

  // Function patterns.
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy += 1)
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
  }
  const formatBits = (mask: number) => {
    const d = (ECL_M << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  formatBits(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((b >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      set(a, c, dark);
      set(c, a, dark);
    }
  }

  // Codewords in the zigzag.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1)
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < codewords.length * 8) {
          modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i += 1;
        }
      }
  }

  const masked = (mask: number): boolean[][] => {
    const m = modules.map((row) => row.slice());
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        if (fixed[y][x]) continue;
        let inv: boolean;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (inv) m[y][x] = !m[y][x];
      }
    return m;
  };

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    // This mask's format bits go into the fixed cells, which `masked` copies as they are.
    formatBits(mask);
    const m = masked(mask);
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best as boolean[][];
}

/** Penalty rules 1–4 (runs, 2×2 blocks, finder-like patterns, balance). */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  const lines: string[] = [];
  for (let y = 0; y < size; y += 1) lines.push(m[y].map((d) => (d ? '1' : '0')).join(''));
  for (let x = 0; x < size; x += 1) lines.push(m.map((row) => (row[x] ? '1' : '0')).join(''));
  for (const line of lines) {
    for (const run of line.match(/0{5,}|1{5,}/g) ?? []) score += 3 + run.length - 5;
    const padded = `0000${line}0000`;
    for (const pat of ['10111010000', '00001011101']) {
      for (let at = padded.indexOf(pat); at !== -1; at = padded.indexOf(pat, at + 1)) score += 40;
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      if (m[y][x]) dark += 1;
      if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** An SVG of the code, one path, dark on light, with a four-module quiet zone. Scales to its box. */
export function qrSvg(text: string, label = 'QR code to join the game'): string {
  const m = qrMatrix(text);
  const n = m.length + 8;
  let d = '';
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    })
  );
  const safe = label.replace(/[<>&"]/g, '');
  return `<svg viewBox="0 0 ${n} ${n}" role="img" aria-label="${safe}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#0a1536"/></svg>`;
}
