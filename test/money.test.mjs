import test from 'node:test';
import assert from 'node:assert/strict';
import { collateralValue, interestDue, ltvBps, ZAT_PER_ZEC } from '../src/money.mjs';

test('collateral value rounds down', () => {
  assert.equal(collateralValue(ZAT_PER_ZEC, 50_000_000n), 50_000_000n);
  assert.equal(collateralValue(1n, 1n), 0n);
});
test('interest rounds up and ignores negative time', () => {
  assert.equal(interestDue(1_000_000n, 1000n, 0n), 0n);
  assert.equal(interestDue(1_000_000n, 1000n, -50n), 0n);
  assert.equal(interestDue(1_000_000n, 1000n, 31_536_000n), 100_000n);
  assert.equal(interestDue(1n, 1n, 1n) >= 1n, true);
});
test('ltv rounds up and guards zero value', () => {
  assert.equal(ltvBps(50n, ZAT_PER_ZEC, 100n), 5000n);
  assert.equal(ltvBps(1n, 0n, 100n), 1_000_000n);
});
