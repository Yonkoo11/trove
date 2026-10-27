/**
 * QR code (ISO/IEC 18004) for one byte-mode segment at error correction level M, versions 1-20.
 * Written here so the payment screen loads no outside code. Checked by decoding with zbarimg.
 */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
const MAX_VERSION = 20;

function rawModules(v) {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const a = Math.floor(v / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (v >= 7) n -= 36;
  }
  return n;
}
const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * BLOCKS[v];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < degree) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 2);
  }
  return r;
}

function rsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((d, i) => { r[i] ^= gfMul(d, f); });
  }
  return r;
}

/** Data bits for the smallest version that fits, padded to full capacity. */
function encodeData(bytes) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const cap = dataCodewords(v) * 8, countBits = v < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 > cap) continue;
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4);
    put(bytes.length, countBits);
    for (const b of bytes) put(b, 8);
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    return { v, data: out };
  }
  return null;
}

function interleave(v, data) {
  const nBlocks = BLOCKS[v], eccLen = ECC_PER_BLOCK[v], raw = Math.floor(rawModules(v) / 8);
  const nShort = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks);
  const div = rsDivisor(eccLen), blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++)
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) out.push(b[i]); });
  return out;
}

function alignmentPositions(v, size) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, pos = [6];
  for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
  return pos;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x, _y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Grid {
  constructor(v) {
    this.v = v;
    this.size = v * 4 + 17;
    this.m = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }
  set(x, y, dark) { this.m[y][x] = dark; this.fn[y][x] = true; }

  drawFunctionPatterns() {
    const s = this.size;
    for (let i = 0; i < s; i++) { this.set(6, i, i % 2 === 0); this.set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [s - 4, 3], [3, s - 4]])
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < s && y >= 0 && y < s) this.set(x, y, d !== 2 && d !== 4);
      }
    const al = alignmentPositions(this.v, s), last = al.length - 1;
    al.forEach((ay, i) => al.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        this.set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    this.drawFormat(0);
    if (this.v >= 7) {
      let rem = this.v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (this.v << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) === 1, a = s - 11 + (i % 3), b = Math.floor(i / 3);
        this.set(a, b, bit);
        this.set(b, a, bit);
      }
    }
  }

  /** Level M has format code 00. */
  drawFormat(mask) {
    const s = this.size, data = mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412, bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(s - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, s - 15 + i, bit(i));
    this.set(8, s - 8, true);
  }

  drawCodewords(cw) {
    const s = this.size;
    let i = 0;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < s; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? s - 1 - vert : vert;
        if (!this.fn[y][x] && i < cw.length * 8) {
          this.m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }

  applyMask(k) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++)
      if (!this.fn[y][x] && MASKS[k](x, y)) this.m[y][x] = !this.m[y][x];
  }

  /** Standard penalty score (rules N1-N4); lower scans better. */
  penalty() {
    const s = this.size, m = this.m, lines = [];
    for (let i = 0; i < s; i++) { lines.push(m[i]); lines.push(m.map((row) => row[i])); }
    let p = 0, dark = 0;
    for (const line of lines) {
      for (let i = 0, run = 1; i < s; i++, run++) {
        if (i + 1 < s && line[i + 1] === line[i]) continue;
        if (run >= 5) p += run - 2;
        run = 0;
      }
      const str = line.map((d) => (d ? '1' : '0')).join('');
      p += 40 * ((str.match(/(?=10111010000)/g) || []).length + (str.match(/(?=00001011101)/g) || []).length);
    }
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (m[y][x]) dark++;
      if (x + 1 < s && y + 1 < s && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    return p + 10 * Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s));
  }
}

/** Square boolean matrix (true = dark), no quiet zone. null when the text does not fit version 20. */
export function qrMatrix(text) {
  const enc = encodeData([...new TextEncoder().encode(text)]);
  if (!enc) return null;
  const g = new Grid(enc.v);
  g.drawFunctionPatterns();
  g.drawCodewords(interleave(enc.v, enc.data));
  let best = 0, bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    g.applyMask(k);
    g.drawFormat(k);
    const score = g.penalty();
    if (score < bestScore) { best = k; bestScore = score; }
    g.applyMask(k);
  }
  g.applyMask(best);
  g.drawFormat(best);
  return g.m;
}

/** SVG path for the dark modules, offset by a 4-module quiet zone. viewBox is 0 0 (n+8) (n+8). */
export function qrPath(matrix) {
  let d = '';
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let len = 1;
      while (row[x + len]) len++;
      d += `M${x + 4} ${y + 4}h${len}v1h-${len}z`;
      x += len - 1;
    }
  });
  return d;
}
