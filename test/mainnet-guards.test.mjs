import test from 'node:test';
import assert from 'node:assert/strict';
import { openLoan, step, debtAt } from '../src/loan.mjs';
import { newKeeperKey, signReading } from '../src/signed-price.mjs';
import { ZAT_PER_ZEC } from '../src/money.mjs';

const key = newKeeperKey();
const T0 = 1_000_000;
const terms = () => ({
  collateralZat: 10n * ZAT_PER_ZEC, principal: 200_000_000n, aprBps: 1000, liqLtvBps: 8000, maxStartLtvBps: 5000,
  penaltyBps: 500, termSeconds: 30 * 86400, graceSeconds: 3600, fundWindow: 3600, payWindow: 3600, maxPriceAge: 300,
  keeperPubKey: key.publicKeyHex,
});
const rd = (price, ts) => signReading({ loanId: 'L1', priceMicroUsd: BigInt(price), ts, source: 't' }, key.privateKeyPem);
const fresh = () => openLoan({ id: 'L1', createdAt: T0, terms: terms() });
const lockEv = (zat = 10n * ZAT_PER_ZEC) => ({ type: 'collateralLocked', at: T0 + 10, zat, txid: 'a', reading: rd(50_000_000, T0 + 5) });
const PAUSED = { paused: true };

test('pause refuses a new lock', () => {
  assert.throws(() => step(fresh(), lockEv(), PAUSED), /desk is paused/);
});
test('pause never strands a loan already locked: pay, repay and payout still go through', () => {
  let { loan } = step(fresh(), lockEv());
  ({ loan } = step(loan, { type: 'loanPaid', at: T0 + 100, ref: 'p', amount: 200_000_000n, reading: rd(50_000_000, T0 + 90) }, PAUSED));
  assert.equal(loan.state, 'active');
  const at = T0 + 100 + 86400;
  ({ loan } = step(loan, { type: 'repaid', at, amount: debtAt(loan, at), ref: 'r' }, PAUSED));
  assert.equal(step(loan, { type: 'releaseConfirmed', at: at + 100, txid: 'x' }, PAUSED).loan.state, 'closed_repaid');
});
test('pause never strands a locked loan the lender never pays: the abort refund still runs', () => {
  const { loan } = step(fresh(), lockEv());
  const r = step(loan, { type: 'tick', at: T0 + 10 + 3601 }, PAUSED);
  assert.notEqual(r.loan.state, 'collateral_locked');
  assert.ok(r.effects.some(e => e.to === 'borrower'), 'collateral goes back to the borrower');
});
test('collateral cap: one zatoshi over is refused, exactly at the cap is accepted', () => {
  const cap = { maxCollateralZat: 10n * ZAT_PER_ZEC };
  assert.throws(() => step(fresh(), lockEv(10n * ZAT_PER_ZEC + 1n), { cap }), /collateral above the funds cap/);
  assert.equal(step(fresh(), lockEv(), { cap }).loan.state, 'collateral_locked');
});
test('principal cap refuses a loan bigger than the cap', () => {
  assert.throws(() => step(fresh(), lockEv(), { cap: { maxPrincipal: 199_999_999n } }), /loan above the funds cap/);
  assert.equal(step(fresh(), lockEv(), { cap: { maxPrincipal: 200_000_000n } }).loan.state, 'collateral_locked');
});
test('a party cannot lift the pause or cap from inside its own event', () => {
  const ev = { ...lockEv(), paused: false, cap: {}, guard: {} };
  assert.throws(() => step(fresh(), ev, PAUSED), /desk is paused/);
});
test('a junk cap value fails closed instead of letting the loan through', () => {
  assert.throws(() => step(fresh(), lockEv(), { cap: { maxCollateralZat: 'lots' } }));
});
test('no guard passed: behaviour is unchanged', () => {
  assert.equal(step(fresh(), lockEv()).loan.state, 'collateral_locked');
});
