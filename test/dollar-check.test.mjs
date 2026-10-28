import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPayment } from '../src/dollar-check.mjs';
import { openLoan, step } from '../src/loan.mjs';
import { newKeeperKey, signReading } from '../src/signed-price.mjs';
import { ZAT_PER_ZEC } from '../src/money.mjs';

const MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const LENDER = 'FMbu8WyM9RrFYDBqSLHDZZjWHit4dfzCeseXx22AWQx4';
const BORROWER = '8A8mfYzzFY4xgpE32FoM7TpVY7SCShejHWMp6g9yowo5';
const SIG = '5sig';
const T0 = 1_000_000;

// Shaped like getTransaction(jsonParsed): token balances before and after, per owner and mint.
const bal = (accountIndex, owner, amount, mint = MINT) => ({ accountIndex, mint, owner, uiTokenAmount: { amount: String(amount), decimals: 6 } });
const STRANGER = '9xStrangerWallet1111111111111111111111111111';
// accountKeys and the spl-memo instruction are shaped like jsonParsed output too.
const tx = ({ from = LENDER, to = BORROWER, amount = 200_000_000, toBefore = 0, at = T0 + 95, err = null, mint = MINT, signer = from, memo = 'L1' } = {}) => ({
  blockTime: at, slot: 1,
  meta: { err, preTokenBalances: [bal(1, from, 500_000_000, mint), bal(2, to, toBefore, mint)], postTokenBalances: [bal(1, from, 500_000_000 - amount, mint), bal(2, to, toBefore + amount, mint)] },
  transaction: {
    signatures: [SIG],
    message: {
      accountKeys: [{ pubkey: signer, signer: true, writable: true }, { pubkey: to, signer: false, writable: true }],
      instructions: memo === null ? [] : [{ program: 'spl-memo', parsed: memo }],
    },
  },
});
const opts = (o = {}) => ({ signature: SIG, mint: MINT, senderOwner: LENDER, recipientOwner: BORROWER, loanId: 'L1', minAmount: 200_000_000n, notBefore: T0, notAfter: T0 + 3600, usedRefs: new Set(), ...o });

test('a full transfer to the borrower becomes a loanPaid event', () => {
  const r = checkPayment(tx(), opts());
  assert.equal(r.ok, true);
  assert.deepEqual(r.event, { type: 'loanPaid', at: T0 + 95, amount: 200_000_000n, ref: SIG });
});

test('counts only what the recipient gained, not its old balance', () => {
  const r = checkPayment(tx({ toBefore: 1_000_000_000, amount: 150_000_000 }), opts());
  assert.equal(r.ok, false);
  assert.match(r.reason, /below the amount owed/);
});

for (const [name, t, o, why] of [
  ['missing transaction', null, {}, /not found/],
  ['failed transaction', tx({ err: { InstructionError: [0, 'x'] } }), {}, /failed on chain/],
  ['short amount', tx({ amount: 199_999_999 }), {}, /below the amount owed/],
  ['wrong token', tx({ mint: 'So11111111111111111111111111111111111111112' }), {}, /received nothing/],
  ['wrong recipient', tx({ to: LENDER, from: BORROWER }), {}, /received nothing/],
  ['before the loan', tx({ at: T0 - 1 }), {}, /older than the loan/],
  ['after the window', tx({ at: T0 + 3601 }), {}, /after the window/],
  ['signature mismatch', tx(), { signature: 'other' }, /does not match/],
  ['reused transfer', tx(), { usedRefs: new Set([SIG]) }, /already counted/],
  ['unknown type', tx(), { type: 'gift' }, /unknown event type/],
  ['a stranger paid the borrower', tx({ from: STRANGER }), {}, /did not sign/],
  ['lender signed but a stranger\'s tokens moved', tx({ from: STRANGER, signer: LENDER }), {}, /did not come from the expected sender/],
  ['no memo', tx({ memo: null }), {}, /loan id as a memo/],
  ['memo for another loan', tx({ memo: 'L2' }), {}, /loan id as a memo/],
  ['sender pays itself', tx(), { recipientOwner: LENDER }, /two different wallets/],
  ['no loan id', tx(), { loanId: '' }, /loan id is required/],
]) {
  test(`refuses: ${name}`, () => {
    const r = checkPayment(t, opts(o));
    assert.equal(r.ok, false);
    assert.match(r.reason, why);
  });
}

test('refuses a transaction with no block time', () => {
  const t = tx(); delete t.blockTime;
  assert.match(checkPayment(t, opts()).reason, /no block time/);
});

test('refuses to run without the registry of counted transfers', () => {
  const { usedRefs, ...rest } = opts();
  assert.throws(() => checkPayment(tx(), rest), /usedRefs/);
});

// A real Solana devnet transfer of 5 test USDC, lender to borrower, memo trove-L1 (2026-10-28).
const REAL = JSON.parse(readFileSync(new URL('./fixtures/devnet-usdc-pay.json', import.meta.url)));
const REAL_SIG = REAL.transaction.signatures[0];
const real = (o = {}) => checkPayment(REAL, { signature: REAL_SIG, mint: MINT, senderOwner: LENDER, recipientOwner: BORROWER, loanId: 'trove-L1', minAmount: 5_000_000n, usedRefs: new Set(), ...o });

test('a real devnet transfer counts as loanPaid', () => {
  const r = real();
  assert.equal(r.ok, true);
  assert.equal(r.event.amount, 5_000_000n);
  assert.equal(r.event.ref, REAL_SIG);
});

for (const [name, o, why] of [
  ['another loan id', { loanId: 'trove-L2' }, /loan id as a memo/],
  ['one unit short', { minAmount: 5_000_001n }, /below the amount owed/],
  ['the borrower named as payer', { senderOwner: BORROWER, recipientOwner: LENDER }, /received nothing/],
  ['already counted', { usedRefs: new Set([REAL_SIG]) }, /already counted/],
]) {
  test(`the real devnet transfer is refused for ${name}`, () => {
    const r = real(o);
    assert.equal(r.ok, false);
    assert.match(r.reason, why);
  });
}

test('a checked transfer drives the loan to active, then repaid', () => {
  const key = newKeeperKey();
  const terms = { collateralZat: 10n * ZAT_PER_ZEC, principal: 200_000_000n, aprBps: 1000, liqLtvBps: 8000, maxStartLtvBps: 5000, penaltyBps: 500, termSeconds: 30 * 86400, graceSeconds: 3600, fundWindow: 3600, payWindow: 3600, maxPriceAge: 300, keeperPubKey: key.publicKeyHex };
  const rd = (price, ts) => signReading({ loanId: 'L1', priceMicroUsd: BigInt(price), ts, source: 't' }, key.privateKeyPem);
  let loan = openLoan({ id: 'L1', createdAt: T0, terms });
  loan = step(loan, { type: 'collateralLocked', at: T0 + 10, zat: 10n * ZAT_PER_ZEC, txid: 'a', reading: rd(50_000_000, T0 + 5) }).loan;

  const paid = checkPayment(tx({ at: T0 + 100 }), opts({ notBefore: loan.lockedAt, notAfter: loan.lockedAt + loan.terms.payWindow }));
  assert.equal(paid.ok, true);
  loan = step(loan, { ...paid.event, reading: rd(50_000_000, T0 + 90) }).loan;
  assert.equal(loan.state, 'active');
  assert.equal(loan.payRef, SIG);

  const repay = tx({ from: BORROWER, to: LENDER, amount: 210_000_000, at: T0 + 86400 });
  repay.transaction.signatures = ['5back'];
  const back = checkPayment(repay,
    { type: 'repaid', signature: '5back', mint: MINT, senderOwner: BORROWER, recipientOwner: LENDER, loanId: 'L1', minAmount: 0n, notBefore: loan.activeAt, usedRefs: new Set([loan.payRef]) });
  assert.equal(back.ok, true);
  const r = step(loan, back.event);
  assert.equal(r.loan.repayRef, '5back');
  assert.notEqual(r.loan.state, 'active');
});
