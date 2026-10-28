import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transferCheckedData, createAtaData, memoData, usdcUnits, USDC_DECIMALS } from '../site/lib/solpay.mjs';
import { encodeRequest, decodeRequest, memoCode, newRef, isRef, isPayTo } from '../site/lib/terms.mjs';

test('TransferChecked bytes: index 12, u64 little-endian amount, decimals', () => {
  assert.deepEqual([...transferCheckedData(5_000_000n)], [12, 0x40, 0x4b, 0x4c, 0, 0, 0, 0, 0, 6]);
  assert.deepEqual([...transferCheckedData(1n, 0)], [12, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...transferCheckedData((1n << 64n) - 1n)].slice(1, 9), Array(8).fill(255));
  for (const bad of [0n, -1n, 1n << 64n]) assert.throws(() => transferCheckedData(bad), RangeError, String(bad));
  assert.equal(USDC_DECIMALS, 6);
  assert.equal(usdcUnits(2_000_000n), 2_000_000n);
});

test('create-account and memo bytes', () => {
  assert.deepEqual([...createAtaData()], [1]);
  assert.deepEqual([...memoData('0123456789abcdef')], [...'0123456789abcdef'].map((c) => c.charCodeAt(0)));
});

test('a request carries a random reference and an optional dollar address; the lock memo drops the address', () => {
  const ref = newRef();
  assert.ok(isRef(ref), ref);
  assert.notEqual(ref, newRef());
  const to = 'FMbu8WyM9RrFYDBqSLHDZZjWHit4dfzCeseXx22AWQx4';
  assert.ok(isPayTo(to));
  const code = encodeRequest(1_000_000n, 2_000_000n, ref, to);
  assert.equal(code, `trove1.1000000.200.${ref}.${to}`);
  const r = decodeRequest(code);
  assert.deepEqual([r.zat, r.principal, r.ref, r.payTo], [1_000_000n, 2_000_000n, ref, to]);
  assert.equal(memoCode(r), `trove1.1000000.200.${ref}`);
  const old = decodeRequest('trove1.1000000.200');
  assert.deepEqual([old.ref, old.payTo], ['', '']);
  assert.equal(memoCode(old), 'trove1.1000000.200');
  for (const bad of [`trove1.1000000.200.${ref.slice(0, 15)}`, `trove1.1000000.200.${ref.toUpperCase()}`, `trove1.1000000.200.${to}`,
    `trove1.1000000.200.${ref}.0OIl${to.slice(4)}`, `trove1.1000000.200.${ref}.${to}.x`, `trove1.1000000.200.trove-L1`])
    assert.equal(decodeRequest(bad), null, bad);
});
