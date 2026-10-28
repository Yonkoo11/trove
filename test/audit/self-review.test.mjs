import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLoan, step } from '../../src/loan.mjs';
import { newKeeperKey, signReading } from '../../src/signed-price.mjs';
import { ZAT_PER_ZEC } from '../../src/money.mjs';

const key = newKeeperKey(); const T0 = 1_000_000;
const terms = () => ({ collateralZat: 10n * ZAT_PER_ZEC, principal: 200_000_000n, aprBps: 1000, liqLtvBps: 8000, maxStartLtvBps: 5000,
  penaltyBps: 500, termSeconds: 30 * 86400, graceSeconds: 3600, fundWindow: 3600, payWindow: 3600, maxPriceAge: 300, keeperPubKey: key.publicKeyHex });
const rd = (price, ts) => signReading({ loanId: 'L1', priceMicroUsd: BigInt(price), ts, source: 't' }, key.privateKeyPem);
const fresh = () => openLoan({ id: 'L1', createdAt: T0, terms: terms() });

test('self-review: a borrower who locks more than agreed is judged on the whole vault', () => {
  const l = step(fresh(), { type: 'collateralLocked', at: T0 + 10, zat: 20n * ZAT_PER_ZEC, txid: 'a', reading: rd(50_000_000, T0 + 5) }).loan;
  const a = step(l, { type: 'loanPaid', at: T0 + 100, ref: 'p', amount: 200_000_000n, reading: rd(50_000_000, T0 + 90) }).loan;
  // $200 against 20 ZEC at $25 is 40%: no default, though 10 ZEC alone would be 80%.
  assert.equal(step(a, { type: 'price', at: T0 + 200, reading: rd(25_000_000, T0 + 195) }).loan.state, 'active');
  const d = step(a, { type: 'price', at: T0 + 200, reading: rd(12_400_000, T0 + 195) }).loan;
  assert.equal(d.state, 'defaulted');
  assert.equal(d.settlement.lenderZat + d.settlement.borrowerZat, 20n * ZAT_PER_ZEC);
});

test('self-review: a stray deposit after a closed refund can still be refunded, state stays closed', () => {
  let l = step(fresh(), { type: 'depositSeen', at: T0 + 10, zat: 3n * ZAT_PER_ZEC, txid: 'x' }).loan;
  l = step(l, { type: 'refundDeposit', at: T0 + 11, txid: 'x' }).loan;
  l = step(l, { type: 'releaseConfirmed', at: T0 + 12, txid: 'rx' }).loan;
  assert.equal(l.state, 'closed_aborted');
  l = step(l, { type: 'depositSeen', at: T0 + 13, zat: 4n * ZAT_PER_ZEC, txid: 'y' }).loan;
  const r = step(l, { type: 'refundDeposit', at: T0 + 14, txid: 'y' });
  assert.equal(r.loan.state, 'closed_aborted');
  assert.equal(r.effects[0].zat, 4n * ZAT_PER_ZEC);
  assert.deepEqual(r.effects[0].signers, ['borrower', 'keeper']);
});
