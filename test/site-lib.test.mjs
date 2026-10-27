import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const f of ['money.mjs', 'defaults.mjs']) {
  test(`site/lib/${f} is byte-identical to src/${f}`, () => {
    assert.ok(readFileSync(new URL(`../site/lib/${f}`, import.meta.url)).equals(readFileSync(new URL(`../src/${f}`, import.meta.url))));
  });
}

test('terms the site copies open a loan once a keeper key is added', async () => {
  const { buildTerms, interestMicro } = await import('../site/lib/terms.mjs');
  const { openLoan } = await import('../src/loan.mjs');
  const { newKeeperKey } = await import('../src/signed-price.mjs');
  const loan = openLoan({ id: 'L', createdAt: 1, terms: { ...JSON.parse(JSON.stringify(buildTerms(100_000_000n, 200_000_000n))), keeperPubKey: newKeeperKey().publicKeyHex } });
  assert.equal(loan.terms.principal, 200_000_000n);
  assert.equal(interestMicro(200_000_000n) % 10_000n, 0n);
});

test('a request code round-trips and rebuilds the same terms; junk and oversized codes are refused', async () => {
  const { encodeRequest, decodeRequest, buildTerms } = await import('../site/lib/terms.mjs');
  const code = encodeRequest(100_000_000n, 200_000_000n);
  assert.equal(code, 'trove1.100000000.20000');
  const r = decodeRequest(code);
  assert.deepEqual(r.terms, buildTerms(100_000_000n, 200_000_000n));
  for (const bad of ['', 'trove1.0.5', 'trove1.5.0', 'trove1.-5.5', 'trove2.5.5', 'trove1.5.5.5', 'trove1.1e3.5', 'trove1.' + '9'.repeat(19) + '.5', '{"principal":"1"}'])
    assert.equal(decodeRequest(bad), null, bad);
});

test('ZIP 321 amounts: at most 8 decimals, no trailing dot, nothing at zero or above 21M ZEC', async () => {
  const { zecAmount, MAX_ZAT } = await import('../site/lib/zip321.mjs');
  const cases = [[1n, '0.00000001'], [25_000_000n, '0.25'], [100_000_000n, '1'], [123_456_789n, '1.23456789'], [MAX_ZAT, '21000000']];
  for (const [zat, want] of cases) assert.equal(zecAmount(zat), want);
  for (const bad of [0n, -1n, MAX_ZAT + 1n]) assert.equal(zecAmount(bad), null);
});

test('QR picks the smallest size that fits and refuses text over the version 20 limit', async () => {
  const { qrMatrix } = await import('../site/lib/qr.mjs');
  assert.equal(qrMatrix('HELLO').length, 21);
  assert.equal(qrMatrix('a'.repeat(666)).length, 97);
  assert.equal(qrMatrix('a'.repeat(667)), null);
});

test('ZIP 321 link carries the request code as an unpadded base64url memo; bad input gets no link', async () => {
  const { paymentUri, memoParam } = await import('../site/lib/zip321.mjs');
  assert.equal(paymentUri('utest1abc', 25_000_000n, 'trove1.25000000.2000'), 'zcash:utest1abc?amount=0.25&memo=dHJvdmUxLjI1MDAwMDAwLjIwMDA');
  assert.equal(Buffer.from(memoParam('é?>~'), 'base64url').toString(), 'é?>~');
  assert.doesNotMatch(memoParam('???>>>~~~ab'), /[+/=]/);
  assert.equal(memoParam('x'.repeat(513)), null);
  assert.equal(paymentUri('utest1abc', 0n), null);
  assert.equal(paymentUri('utest1 abc', 1n), null);
  assert.equal(paymentUri('utest1abc', 1n, 'x'.repeat(513)), null);
});
