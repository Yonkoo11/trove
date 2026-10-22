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
