import test from 'node:test';
import assert from 'node:assert/strict';
import { newKeeperKey, signReading, verifyReading } from '../src/signed-price.mjs';

const k = newKeeperKey();
const r = { loanId: 'L1', priceMicroUsd: 50_000_000n, ts: 1000, source: 'test' };

test('good signature verifies', () => assert.equal(verifyReading(signReading(r, k.privateKeyPem), k.publicKeyHex), true));
test('changed price fails', () => {
  const s = signReading(r, k.privateKeyPem);
  assert.equal(verifyReading({ ...s, priceMicroUsd: 1n }, k.publicKeyHex), false);
});
test('changed loan id fails', () => {
  const s = signReading(r, k.privateKeyPem);
  assert.equal(verifyReading({ ...s, loanId: 'L2' }, k.publicKeyHex), false);
});
test('other key fails', () => {
  const s = signReading(r, k.privateKeyPem);
  assert.equal(verifyReading(s, newKeeperKey().publicKeyHex), false);
});
test('garbage does not throw', () => assert.equal(verifyReading({ ...r, sig: 'zz' }, 'nope'), false));
