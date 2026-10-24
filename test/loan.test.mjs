import test from 'node:test';
import assert from 'node:assert/strict';
import { openLoan, step, debtAt, keeperMayCosignDefault } from '../src/loan.mjs';
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
const locked = () => step(fresh(), { type: 'collateralLocked', at: T0 + 10, zat: 10n * ZAT_PER_ZEC, txid: 'a', reading: rd('L1', 50_000_000, T0 + 5) }).loan;
const active = () => step(locked(), { type: 'loanPaid', at: T0 + 100, ref: 'p', amount: 200_000_000n, reading: rd('L1', 50_000_000, T0 + 90) }).loan;
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
  throwsMsg(() => step(locked(), { type: 'loanPaid', at: T0 + 100, ref: 'p', amount: 200_000_000n, reading: rd('L1', 10_000_000, T0 + 90) }), /opening LTV/);
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
  throwsMsg(() => step(locked(), { type: 'collateralLocked', at: T0 + 20, zat: 10n * ZAT_PER_ZEC, txid: 'b', reading: rd('L1', 50_000_000, T0 + 15) }), /cannot do this/);
  throwsMsg(() => step(active(), { type: 'releaseConfirmed', at: T0 + 300, txid: 'x' }), /nothing to release/);
  throwsMsg(() => step(fresh(), { type: 'nope', at: 1 }), /unknown event/);
  throwsMsg(() => step(fresh(), { type: 'tick' }), /needs a time/);
});
test('short collateral and late collateral rejected', () => {
  throwsMsg(() => step(fresh(), { type: 'collateralLocked', at: T0 + 10, zat: 1n, txid: 'a', reading: rd('L1', 50_000_000, T0 + 5) }), /below the agreed/);
  throwsMsg(() => step(fresh(), { type: 'collateralLocked', at: T0 + 3601, zat: 10n * ZAT_PER_ZEC, txid: 'a', reading: rd('L1', 50_000_000, T0 + 3600) }), /funding window/);
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
test('back-dated event time is rejected (cannot reuse an old price to dodge a default)', () => {
  const a = active();
  const seen = step(a, { type: 'price', at: T0 + 1000, reading: rd('L1', 50_000_000, T0 + 995) }).loan;
  throwsMsg(() => step(seen, { type: 'price', at: T0 + 500, reading: rd('L1', 20_000_000, T0 + 499) }), /earlier than the last/);
  throwsMsg(() => step(seen, { type: 'repaid', at: T0 + 101, amount: 10n ** 12n, ref: 'r' }), /earlier than the last/);
});
test('loan payment below principal or without amount rejected', () => {
  const ev = { type: 'loanPaid', at: T0 + 100, ref: 'p', reading: rd('L1', 50_000_000, T0 + 90) };
  throwsMsg(() => step(locked(), ev), /below the principal/);
  throwsMsg(() => step(locked(), { ...ev, amount: 199_999_999n }), /below the principal/);
});

test('lender is not asked to pay when the opening price already fails the limit', () => {
  throwsMsg(() => step(fresh(), { type: 'collateralLocked', at: T0 + 10, zat: 10n * ZAT_PER_ZEC, txid: 'a', reading: rd('L1', 30_000_000, T0 + 5) }), /opening LTV/);
  throwsMsg(() => step(fresh(), { type: 'collateralLocked', at: T0 + 10, zat: 10n * ZAT_PER_ZEC, txid: 'a' }), /signature invalid/);
});
test('a default closes only after both payouts are confirmed, each to its own party', () => {
  const at = T0 + 3600;
  const d = step(active(), { type: 'price', at, reading: rd('L1', 22_000_000, at - 10) }).loan;
  assert.deepEqual(d.pending, ['lender', 'borrower']);
  throwsMsg(() => step(d, { type: 'releaseConfirmed', at: at + 1, txid: 'x', to: 'keeper' }), /no pending payout/);
  const half = step(d, { type: 'releaseConfirmed', at: at + 1, txid: 't1', to: 'lender' }).loan;
  assert.equal(half.state, 'defaulted');
  throwsMsg(() => step(half, { type: 'releaseConfirmed', at: at + 2, txid: 't1b', to: 'lender' }), /no pending payout/);
  assert.equal(step(half, { type: 'releaseConfirmed', at: at + 2, txid: 't2', to: 'borrower' }).loan.state, 'closed_defaulted');
});
test('nonsense terms rejected', () => {
  const bad = (o) => throwsMsg(() => openLoan({ id: 'X', createdAt: T0, terms: { ...terms(), ...o } }), /./);
  bad({ liqLtvBps: 12000 }); bad({ termSeconds: -1 }); bad({ aprBps: -5 }); bad({ penaltyBps: -1 }); bad({ maxPriceAge: 0 });
});

import { LoanBook } from '../src/loan.mjs';
test('A2: a late deposit is refunded in full to the borrower, signed by borrower+keeper', () => {
  const f = fresh();
  throwsMsg(() => step(f, { type: 'collateralLocked', at: T0 + 7200, zat: 10n * ZAT_PER_ZEC, txid: 'late', reading: rd('L1', 50_000_000, T0 + 7190) }), /funding window/);
  const seen = step(f, { type: 'depositSeen', at: T0 + 7200, zat: 10n * ZAT_PER_ZEC, txid: 'late' }).loan;
  const { loan, effects } = step(seen, { type: 'refundDeposit', at: T0 + 7200, txid: 'late' });
  assert.equal(loan.state, 'aborted');
  assert.equal(effects[0].zat, 10n * ZAT_PER_ZEC);
  assert.deepEqual(effects[0].signers, ['borrower', 'keeper']);
  assert.equal(step(loan, { type: 'releaseConfirmed', at: T0 + 7300, txid: 'x' }).loan.state, 'closed_aborted');
});
test('A2: a short deposit is refunded for the amount actually sent', () => {
  const seen = step(fresh(), { type: 'depositSeen', at: T0 + 10, zat: 3n * ZAT_PER_ZEC, txid: 's' }).loan;
  const { effects } = step(seen, { type: 'refundDeposit', at: T0 + 10, txid: 's', zat: 99n * ZAT_PER_ZEC });
  assert.equal(effects[0].zat, 3n * ZAT_PER_ZEC);
});
test('A2: a refund needs a recorded deposit and ignores a caller-supplied amount', () => {
  throwsMsg(() => step(fresh(), { type: 'refundDeposit', at: T0 + 10, txid: 'never-seen', zat: 5n * ZAT_PER_ZEC }), /no recorded deposit/);
  const seen = step(fresh(), { type: 'depositSeen', at: T0 + 10, zat: 3n * ZAT_PER_ZEC, txid: 's' }).loan;
  throwsMsg(() => step(seen, { type: 'depositSeen', at: T0 + 11, zat: 3n * ZAT_PER_ZEC, txid: 's' }), /already recorded/);
  const done = step(seen, { type: 'refundDeposit', at: T0 + 12, txid: 's' }).loan;
  throwsMsg(() => step(done, { type: 'refundDeposit', at: T0 + 13, txid: 's' }), /already refunded/);
});
test('A2: two stray deposits are each refunded once', () => {
  let l = step(fresh(), { type: 'depositSeen', at: T0 + 10, zat: 3n * ZAT_PER_ZEC, txid: 'a' }).loan;
  l = step(l, { type: 'depositSeen', at: T0 + 11, zat: 4n * ZAT_PER_ZEC, txid: 'b' }).loan;
  const r1 = step(l, { type: 'refundDeposit', at: T0 + 12, txid: 'a' });
  const r2 = step(r1.loan, { type: 'refundDeposit', at: T0 + 13, txid: 'b' });
  assert.equal(r2.effects[0].zat, 4n * ZAT_PER_ZEC);
  throwsMsg(() => step(r2.loan, { type: 'refundDeposit', at: T0 + 14, txid: 'a' }), /already refunded/);
});
test('A2: a refund is refused once the loan is open', () => {
  throwsMsg(() => step(locked(), { type: 'refundDeposit', at: T0 + 20, txid: 'z' }), /cannot do this/);
});
test('A3: over-locked collateral comes back on repay, abort and default', () => {
  const extra = 12n * ZAT_PER_ZEC;
  const l = step(fresh(), { type: 'collateralLocked', at: T0 + 10, zat: extra, txid: 'a', reading: rd('L1', 50_000_000, T0 + 5) }).loan;
  assert.equal(step(l, { type: 'tick', at: T0 + 10 + 3601 }).effects[0].zat, extra);
  const a = step(l, { type: 'loanPaid', at: T0 + 100, ref: 'p', amount: 200_000_000n, reading: rd('L1', 50_000_000, T0 + 90) }).loan;
  assert.equal(step(a, { type: 'repaid', at: T0 + 200, amount: debtAt(a, T0 + 200), ref: 'r' }).effects[0].zat, extra);
  const d = step(a, { type: 'price', at: T0 + 200, reading: rd('L1', 1_000_000, T0 + 195) });
  assert.equal(d.loan.settlement.lenderZat + d.loan.settlement.borrowerZat, extra);
});
test('A9: a loan id cannot be opened twice', () => {
  const book = new LoanBook();
  book.open({ id: 'L1', createdAt: T0, terms: terms() });
  throwsMsg(() => book.open({ id: 'L1', createdAt: T0, terms: terms() }), /already exists/);
});

test('overpayment is surfaced as a refund owed, exact payment is not', () => {
  const exact = step(locked(), { type: 'loanPaid', at: T0 + 100, ref: 'p', amount: 200_000_000n, reading: rd('L1', 50_000_000, T0 + 90) });
  assert.deepEqual(exact.effects, []);
  const over = step(locked(), { type: 'loanPaid', at: T0 + 100, ref: 'p', amount: 230_000_000n, reading: rd('L1', 50_000_000, T0 + 90) });
  assert.deepEqual(over.effects, [{ type: 'excess', refundTo: 'lender', amount: 30_000_000n }]);
  const a = active(), at = T0 + 100 + 86400, due = debtAt(a, at);
  const rep = step(a, { type: 'repaid', at, amount: due + 5n, ref: 'r' });
  assert.deepEqual(rep.effects[1], { type: 'excess', refundTo: 'borrower', amount: 5n });
});

test('A7: the keeper refuses to co-sign a price default when a newer price is back under the line', () => {
  const a = active(); // 10 ZEC, debt about $200, liquidation at 80% LTV = price below about $25
  const at = T0 + 1000;
  // the lender held back the cheap reading at ts at-200 ($20) and submits it while it is still fresh
  const d = step(a, { type: 'price', at, reading: rd('L1', 20_000_000, at - 200) }).loan;
  assert.equal(d.state, 'defaulted');
  // the keeper's own reading, taken now, shows $50 again: refuse
  throwsMsg(() => keeperMayCosignDefault(d, rd('L1', 50_000_000, at + 10), at + 20), /back under the liquidation line/);
  // still under the line but higher than the lender's pick ($24): the split favours the lender, refuse
  throwsMsg(() => keeperMayCosignDefault(d, rd('L1', 24_000_000, at + 10), at + 20), /payout split uses a lower price/);
  // a reading taken before the default was declared is refused
  throwsMsg(() => keeperMayCosignDefault(d, rd('L1', 20_000_000, at - 100), at + 20), /not newer|after the default/);
  // the price really is still down: co-sign
  assert.equal(keeperMayCosignDefault(d, rd('L1', 20_000_000, at + 10), at + 20), true);
  // an old reading cannot be replayed to approve it, and a reading for another loan is refused
  throwsMsg(() => keeperMayCosignDefault(d, rd('L1', 20_000_000, at - 300), at + 20), /not newer|stale/);
  throwsMsg(() => keeperMayCosignDefault(d, rd('OTHER', 20_000_000, at + 10), at + 20), /another loan/);
  throwsMsg(() => keeperMayCosignDefault(a, rd('L1', 20_000_000, at + 10), at + 20), /no default to co-sign/);
});

test('A7: a term default needs only a valid newer reading to co-sign', () => {
  const a = active();
  const late = a.dueAt + 3601n;
  const d = step(a, { type: 'termDefault', at: Number(late), reading: rd('L1', 50_000_000, Number(late) - 30) }).loan;
  assert.equal(keeperMayCosignDefault(d, rd('L1', 50_000_000, Number(late) + 10), Number(late) + 20), true);
});
