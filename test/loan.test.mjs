import test from 'node:test';
import assert from 'node:assert/strict';
import { openLoan, step, debtAt } from '../src/loan.mjs';
import { newKeeperKey, signReading } from '../src/signed-price.mjs';
import { ZAT_PER_ZEC, ltvBps } from '../src/money.mjs';

const key = newKeeperKey();
const T0 = 1_000_000;
const terms = () => ({
  collateralZat: 10n * ZAT_PER_ZEC, principal: 200_000_000n, aprBps: 1000, liqLtvBps: 8000, maxStartLtvBps: 5000,
  penaltyBps: 500, termSeconds: 30 * 86400, graceSeconds: 3600, fundWindow: 3600, payWindow: 3600, maxPriceAge: 300,
  keeperPubKey: key.publicKeyHex,
});
// 10 ZEC at $50 = $500; debt $200 => 40% LTV
const rd = (loanId, price, ts) => signReading({ loanId, priceMicroUsd: BigInt(price), ts, source: 't' }, key.privateKeyPem);
const fresh = () => openLoan({ id: 'L1', createdAt: T0, terms: terms() });
const locked = () => step(fresh(), { type: 'collateralLocked', at: T0 + 10, zat: 10n * ZAT_PER_ZEC, txid: 'a' }).loan;
const active = () => step(locked(), { type: 'loanPaid', at: T0 + 100, ref: 'p', reading: rd('L1', 50_000_000, T0 + 90) }).loan;
const throwsMsg = (f, re) => assert.throws(f, re);

test('happy path: repay releases to borrower, signed by borrower+lender', () => {
  const a = active();
  const due = debtAt(a, T0 + 100 + 86400);
  const { loan, effects } = step(a, { type: 'repaid', at: T0 + 100 + 86400, amount: due, ref: 'r' });
  assert.equal(loan.state, 'repaid');
  assert.deepEqual(effects[0].signers, ['borrower', 'lender']);
  assert.equal(effects[0].to, 'borrower');
  assert.equal(step(loan, { type: 'releaseConfirmed', at: T0 + 200000, txid: 'x' }).loan.state, 'closed_repaid');
});
test('underpayment rejected', () => {
  const a = active();
  throwsMsg(() => step(a, { type: 'repaid', at: T0 + 100 + 86400, amount: a.terms.principal, ref: 'r' }), /below the debt/);
});
test('opening LTV above limit rejected', () => {
  throwsMsg(() => step(locked(), { type: 'loanPaid', at: T0 + 100, ref: 'p', reading: rd('L1', 10_000_000, T0 + 90) }), /opening LTV/);
});
test('price trigger at the boundary defaults, one below does not', () => {
  const a = active();
  const at = T0 + 200;
  // debt includes 100s of interest; trigger when value*80% <= debt, value = 10 ZEC * price
  // LTV rounds up, so the line is the smallest price whose LTV is below 8000 bps
  const debt = debtAt(a, at);
  let edge = debt * 10_000n / 8000n / 10n;
  while (ltvBps(debt, a.terms.collateralZat, edge) >= 8000n) edge += 1n;
  edge -= 1n; // highest price that still defaults
  const ok = step(a, { type: 'price', at, reading: rd('L1', edge + 1n, at - 5) });
  assert.equal(ok.loan.state, 'active');
  const hit = step(a, { type: 'price', at, reading: rd('L1', edge, at - 5) });
  assert.equal(hit.loan.state, 'defaulted');
  assert.equal(hit.loan.defaultReason, 'price');
  assert.deepEqual(hit.effects[0].signers, ['lender', 'keeper']);
});
test('default pays lender debt+penalty, rest to borrower, sums to collateral', () => {
  const a = active();
  const hit = step(a, { type: 'price', at: T0 + 200, reading: rd('L1', 24_000_000, T0 + 195) }).loan;
  const s = hit.settlement;
  assert.equal(s.lenderZat + s.borrowerZat, hit.terms.collateralZat);
  assert.equal(s.shortfallMicroUsd, 0n);
});
test('crash below debt leaves a shortfall and the lender takes everything', () => {
  const a = active();
  const hit = step(a, { type: 'price', at: T0 + 200, reading: rd('L1', 5_000_000, T0 + 195) }).loan;
  assert.equal(hit.settlement.borrowerZat, 0n);
  assert.ok(hit.settlement.shortfallMicroUsd > 0n);
});
test('term default only after term + grace', () => {
  const a = active();
  const early = a.dueAt + 3600n;
  throwsMsg(() => step(a, { type: 'termDefault', at: Number(early), reading: rd('L1', 50_000_000, Number(early) - 5) }), /have not ended/);
  const late = Number(a.dueAt) + 3601;
  const r = step(a, { type: 'termDefault', at: late, reading: rd('L1', 50_000_000, late - 5) });
  assert.equal(r.loan.defaultReason, 'term');
});
test('forged, stale, wrong-loan, future and replayed readings rejected', () => {
  const a = active();
  const at = T0 + 200;
  const other = newKeeperKey();
  const forged = signReading({ loanId: 'L1', priceMicroUsd: 1n, ts: at - 5, source: 't' }, other.privateKeyPem);
  throwsMsg(() => step(a, { type: 'price', at, reading: forged }), /signature invalid/);
  throwsMsg(() => step(a, { type: 'price', at, reading: rd('L1', 50_000_000, at - 301) }), /stale/);
  throwsMsg(() => step(a, { type: 'price', at, reading: rd('L2', 50_000_000, at - 5) }), /another loan/);
  throwsMsg(() => step(a, { type: 'price', at, reading: rd('L1', 50_000_000, at + 5) }), /future/);
  const used = step(a, { type: 'price', at, reading: rd('L1', 50_000_000, at - 5) }).loan;
  throwsMsg(() => step(used, { type: 'price', at: at + 1, reading: rd('L1', 20_000_000, at - 5) }), /not newer/);
  throwsMsg(() => step(a, { type: 'price', at, reading: { ...rd('L1', 50_000_000, at - 5), priceMicroUsd: 1n } }), /signature invalid/);
});
test('illegal transitions rejected', () => {
  throwsMsg(() => step(fresh(), { type: 'repaid', at: T0, amount: 1n, ref: 'x' }), /cannot do this/);
  throwsMsg(() => step(locked(), { type: 'collateralLocked', at: T0 + 20, zat: 10n * ZAT_PER_ZEC, txid: 'b' }), /cannot do this/);
  throwsMsg(() => step(active(), { type: 'releaseConfirmed', at: T0 + 300, txid: 'x' }), /nothing to release/);
  throwsMsg(() => step(fresh(), { type: 'nope', at: 1 }), /unknown event/);
  throwsMsg(() => step(fresh(), { type: 'tick' }), /needs a time/);
});
test('short collateral and late collateral rejected', () => {
  throwsMsg(() => step(fresh(), { type: 'collateralLocked', at: T0 + 10, zat: 1n, txid: 'a' }), /below the agreed/);
  throwsMsg(() => step(fresh(), { type: 'collateralLocked', at: T0 + 3601, zat: 10n * ZAT_PER_ZEC, txid: 'a' }), /funding window/);
});
test('tick: unfunded expires; unpaid loan aborts back to borrower via borrower+keeper', () => {
  assert.equal(step(fresh(), { type: 'tick', at: T0 + 3601 }).loan.state, 'expired');
  const r = step(locked(), { type: 'tick', at: T0 + 10 + 3601 });
  assert.equal(r.loan.state, 'aborted');
  assert.deepEqual(r.effects[0].signers, ['borrower', 'keeper']);
  assert.equal(step(locked(), { type: 'tick', at: T0 + 100 }).loan.state, 'collateral_locked');
});
test('step does not mutate its input', () => {
  const a = active();
  const snap = JSON.stringify(a, (_, v) => (typeof v === 'bigint' ? String(v) : v));
  step(a, { type: 'price', at: T0 + 200, reading: rd('L1', 20_000_000, T0 + 195) });
  assert.equal(JSON.stringify(a, (_, v) => (typeof v === 'bigint' ? String(v) : v)), snap);
});
test('bad terms rejected', () => {
  throwsMsg(() => openLoan({ id: 'x', createdAt: 0, terms: { ...terms(), liqLtvBps: 5000 } }), /above the opening/);
  throwsMsg(() => openLoan({ id: 'x', createdAt: 0, terms: { ...terms(), keeperPubKey: '' } }), /keeperPubKey/);
});
