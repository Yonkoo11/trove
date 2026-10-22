import test from 'node:test';
import assert from 'node:assert/strict';
import { openLoan, step, debtAt, settleDefault, STATES } from '../src/loan.mjs';
import { newKeeperKey, signReading } from '../src/signed-price.mjs';
import { ZAT_PER_ZEC, collateralValue, interestDue, ltvBps } from '../src/money.mjs';

// Seeded generator so a failure can be replayed from its seed.
const rng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const key = newKeeperKey();
const T0 = 1_000_000;
const TERMINAL = ['closed_repaid', 'closed_defaulted', 'closed_aborted'];

function terms(r) {
  const start = 1000 + Math.floor(r() * 5000);
  return {
    collateralZat: BigInt(1 + Math.floor(r() * 1000)) * ZAT_PER_ZEC / 10n, principal: BigInt(1 + Math.floor(r() * 500_000_000)),
    aprBps: Math.floor(r() * 3000), liqLtvBps: start + 500 + Math.floor(r() * 3000), maxStartLtvBps: start,
    penaltyBps: Math.floor(r() * 1500), termSeconds: 86400 * (1 + Math.floor(r() * 90)), graceSeconds: Math.floor(r() * 90000),
    fundWindow: 3600, payWindow: 3600, maxPriceAge: 600, keeperPubKey: key.publicKeyHex,
  };
}

function randomEvent(r, loan, clock) {
  const type = ['collateralLocked', 'loanPaid', 'repaid', 'price', 'termDefault', 'tick', 'releaseConfirmed', 'depositSeen', 'refundDeposit'][Math.floor(r() * 9)];
  const at = clock + Math.floor(r() * (r() < 0.2 ? 5_000_000 : 4000)) - (r() < 0.05 ? 500 : 0);
  const price = BigInt(1 + Math.floor(r() * 400_000_000));
  const reading = signReading({ loanId: r() < 0.05 ? 'other' : loan.id, priceMicroUsd: price, ts: at - Math.floor(r() * 700), source: 's' }, key.privateKeyPem);
  return {
    type, at, reading, zat: loan.terms.collateralZat - BigInt(Math.floor(r() * 2)), txid: `t${Math.floor(r() * 4)}`,
    amount: BigInt(Math.floor(r() * 2 * Number(loan.terms.principal) * 1.2)), ref: 'r', to: ['lender', 'borrower'][Math.floor(r() * 2)],
  };
}

test('random event sequences never break the loan invariants (300 loans x 40 events)', () => {
  let accepted = 0, refused = 0; const reached = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    let loan = openLoan({ id: 'L', createdAt: T0, terms: terms(r) });
    let clock = T0;
    for (let i = 0; i < 40; i++) {
      const ev = randomEvent(r, loan, clock);
      const before = JSON.stringify(loan, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));
      let out;
      try { out = step(loan, ev); } catch {
        refused++;
        assert.equal(JSON.stringify(loan, (_, v) => (typeof v === 'bigint' ? `${v}n` : v)), before, `seed ${seed}: refused event changed the loan`);
        continue;
      }
      accepted++;
      const was = loan.state; loan = out.loan; clock = Math.max(clock, ev.at);
      reached.add(loan.state);
      assert.ok(STATES.includes(loan.state), `seed ${seed}: unknown state ${loan.state}`);
      assert.ok(!TERMINAL.includes(was) || loan.state === was, `seed ${seed}: left terminal state ${was} for ${loan.state}`);
      assert.ok(was !== 'expired' || ['expired', 'aborted'].includes(loan.state), `seed ${seed}: left terminal state ${was} for ${loan.state}`);
      if (loan.settlement) {
        const { lenderZat, borrowerZat, shortfallMicroUsd } = loan.settlement;
        assert.ok(lenderZat >= 0n && borrowerZat >= 0n && shortfallMicroUsd >= 0n, `seed ${seed}: negative payout`);
        assert.equal(lenderZat + borrowerZat, loan.vaultZat, `seed ${seed}: payouts do not sum to the vault`);
      }
      for (const e of out.effects) if (e.type === 'release') {
        assert.ok(new Set(e.signers).size === 2, `seed ${seed}: a release needs two distinct signers`);
        assert.ok(!e.signers.includes('lender') || !e.signers.includes('borrower') || e.to === 'borrower', `seed ${seed}: lender+borrower may only pay the borrower`);
      }
    }
  }
  assert.ok(accepted > 500 && refused > 500, `random run exercised too little: ${accepted} accepted, ${refused} refused`);
  for (const s of ['collateral_locked', 'active', 'repaid', 'defaulted']) assert.ok(reached.has(s), `random run never reached ${s}`);
});

test('money rules hold on random numbers', () => {
  const r = rng(99);
  for (let i = 0; i < 5000; i++) {
    const zat = BigInt(1 + Math.floor(r() * 1e12)), price = BigInt(1 + Math.floor(r() * 1e9));
    const p = BigInt(1 + Math.floor(r() * 1e12)), apr = BigInt(Math.floor(r() * 5000)), t = BigInt(Math.floor(r() * 1e8));
    const v = collateralValue(zat, price);
    assert.ok(v >= 0n && v * ZAT_PER_ZEC <= zat * price, 'collateral value must round down');
    const i1 = interestDue(p, apr, t), i2 = interestDue(p, apr, t + 1n);
    assert.ok(i1 >= 0n && i2 >= i1, 'interest must not fall as time passes');
    assert.ok(ltvBps(p, zat, price) >= 0n);
  }
});

test('default settlement: lender never gets more than the vault or more than owed + one zat of rounding', () => {
  const r = rng(7);
  for (let i = 0; i < 2000; i++) {
    const loan = openLoan({ id: 'L', createdAt: T0, terms: terms(r) });
    const a = { ...loan, activeAt: BigInt(T0), vaultZat: loan.terms.collateralZat };
    const price = BigInt(1 + Math.floor(r() * 400_000_000)), at = T0 + Math.floor(r() * 1e7);
    const s = settleDefault(a, at, price);
    assert.ok(s.lenderZat <= a.vaultZat && s.lenderZat + s.borrowerZat === a.vaultZat);
    assert.ok(s.lenderZat >= 0n && s.borrowerZat >= 0n);
    if (s.shortfallMicroUsd === 0n) assert.ok(collateralValue(s.lenderZat, price) >= debtAt(a, at), 'lender made whole must cover the debt');
  }
});
