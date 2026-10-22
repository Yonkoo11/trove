import test from 'node:test';
import assert from 'node:assert/strict';
import { readPrice, signedReading, SOURCES } from '../src/keeper.mjs';
import { newKeeperKey, verifyReading } from '../src/signed-price.mjs';

const ok = (p) => async () => p;
const bad = async () => { throw new Error('down'); };

test('median of agreeing sources', async () => {
  const r = await readPrice({ sources: { a: ok(50_000_000n), b: ok(50_500_000n), c: ok(50_200_000n) } });
  assert.equal(r.priceMicroUsd, 50_200_000n);
  assert.equal(r.source, 'a+b+c');
});
test('one source down is fine when two remain', async () => {
  const r = await readPrice({ sources: { a: ok(50_000_000n), b: bad, c: ok(50_100_000n) } });
  assert.equal(r.source, 'a+c');
});
test('refuses with fewer than two answers', async () => {
  await assert.rejects(readPrice({ sources: { a: ok(1n), b: bad, c: bad } }), /only 1/);
});
test('refuses when sources disagree by more than 3% and fewer than two agree', async () => {
  await assert.rejects(readPrice({ sources: { a: ok(50_000_000n), b: ok(60_000_000n) } }), /refusing to sign/);
  await assert.rejects(readPrice({ sources: { a: ok(50_000_000n), b: ok(60_000_000n), c: ok(70_000_000n) } }), /refusing to sign/);
});
test('one outlier is dropped, the agreeing sources still sign', async () => {
  const r = await readPrice({ sources: { a: ok(50_000_000n), b: ok(50_100_000n), c: ok(60_000_000n) } });
  assert.equal(r.source, 'a+b'); assert.equal(r.priceMicroUsd, 50_050_000n);
});
test('zero or negative price is dropped', async () => {
  await assert.rejects(readPrice({ sources: { a: ok(0n), b: ok(50_000_000n) } }), /only 1/);
});
test('signed reading verifies and carries the host time', async () => {
  const k = newKeeperKey();
  const s = await signedReading({ loanId: 'L1', privateKeyPem: k.privateKeyPem, now: 1234, sources: { a: ok(50_000_000n), b: ok(50_000_000n) } });
  assert.equal(s.ts, 1234);
  assert.equal(verifyReading(s, k.publicKeyHex), true);
});
test('live-source parsers handle each API shape and reject garbage', async () => {
  const f = (body, status = 200) => async () => ({ ok: status === 200, status, json: async () => body });
  assert.equal(await SOURCES.coingecko(f({ zcash: { usd: 1258.68 } })), 1_258_680_000n);
  assert.equal(await SOURCES.coinbase(f({ data: { amount: '1258.5' } })), 1_258_500_000n);
  assert.equal(await SOURCES.kraken(f({ error: [], result: { XZECZUSD: { c: ['1258.40', '1'] } } })), 1_258_400_000n);
  await assert.rejects(SOURCES.kraken(f({ error: ['EQuery:Unknown asset pair'] })), /Unknown/);
  await assert.rejects(SOURCES.coinbase(f({}, 500)), /HTTP 500/);
  await assert.rejects(SOURCES.coingecko(f({ zcash: { usd: 'abc' } })), /bad price/);
});
