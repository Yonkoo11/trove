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
