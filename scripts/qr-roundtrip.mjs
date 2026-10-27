// Draws QR codes with site/lib/qr.mjs and reads them back with zbarimg (brew install zbar).
// node scripts/qr-roundtrip.mjs [count]   prints "ok=N bad=0" when every code decodes to its input.
import { qrMatrix } from '../site/lib/qr.mjs';
import { paymentUri } from '../site/lib/zip321.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const count = Number(process.argv[2] ?? 300), dir = mkdtempSync(join(tmpdir(), 'qr-'));
const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:?&=._-~/';
let seed = 12345;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

const payloads = [paymentUri('utest1' + 'q'.repeat(104), 25_000_000n, 'trove1.25000000.2000'), 'a'.repeat(666)];
for (let i = 0; i < count; i++) {
  let s = '';
  for (let j = 1 + rnd(666); j > 0; j--) s += chars[rnd(chars.length)];
  payloads.push(s);
}

let ok = 0, bad = 0;
for (const [i, p] of payloads.entries()) {
  const m = qrMatrix(p), n = m.length + 8, sc = 4, rows = [];
  for (let y = 0; y < n * sc; y++) {
    let r = '';
    for (let x = 0; x < n * sc; x++) r += m[Math.floor(y / sc) - 4]?.[Math.floor(x / sc) - 4] ? '1' : '0';
    rows.push(r);
  }
  const f = join(dir, `${i}.pbm`);
  writeFileSync(f, `P1\n${n * sc} ${n * sc}\n${rows.join('\n')}\n`);
  const got = execFileSync('zbarimg', ['-q', '--raw', f]).toString().replace(/\n$/, '');
  if (got === p) ok++; else { bad++; console.log('FAIL', i, p.length); }
}
console.log(`ok=${ok} bad=${bad}`);
process.exit(bad ? 1 : 0);
