// Loan state machine. Pure: step(loan, event) returns a new loan plus the effects a human or the keeper must carry out.
// It never touches a chain. Who may sign a release is policy written here, NOT enforced by Zcash: any 2 of the 3
// vault keys can spend (see README "What this does not stop").
import { collateralValue, interestDue, ltvBps, ZAT_PER_ZEC } from './money.mjs';
import { verifyReading } from './signed-price.mjs';

export const STATES = ['proposed', 'collateral_locked', 'active', 'repaid', 'defaulted', 'aborted',
  'expired', 'closed_repaid', 'closed_defaulted', 'closed_aborted'];

const fail = (msg) => { throw new Error(msg); };

/** terms: bigint amounts; seconds are plain numbers converted to bigint here. */
export function openLoan({ id, createdAt, terms }) {
  const t = { ...terms };
  for (const k of ['collateralZat', 'principal', 'aprBps', 'liqLtvBps', 'maxStartLtvBps', 'penaltyBps']) t[k] = BigInt(t[k]);
  for (const k of ['termSeconds', 'graceSeconds', 'fundWindow', 'payWindow', 'maxPriceAge']) t[k] = BigInt(t[k]);
  if (!t.keeperPubKey) fail('terms.keeperPubKey missing');
  if (t.liqLtvBps <= t.maxStartLtvBps) fail('liquidation line must sit above the opening limit');
  if (t.principal <= 0n || t.collateralZat <= 0n) fail('amounts must be positive');
  return { id, terms: t, state: 'proposed', createdAt: BigInt(createdAt), lastPriceTs: 0n, lastAt: BigInt(createdAt), history: [] };
}

export function debtAt(loan, at) {
  const { principal, aprBps } = loan.terms;
  return principal + interestDue(principal, aprBps, BigInt(at) - loan.activeAt);
}

const need = (loan, ...states) => { if (!states.includes(loan.state)) fail(`cannot do this in state ${loan.state}`); };
const mark = (loan, state, ev, extra = {}) => ({ ...loan, ...extra, state, history: [...loan.history, { state, at: BigInt(ev.at), ev: ev.type }] });

/** A reading counts only if the keeper signed it for THIS loan, it is fresh, and it is newer than any reading used before. */
function checkReading(loan, r, at) {
  if (!r || !verifyReading(r, loan.terms.keeperPubKey)) fail('price reading signature invalid');
  if (r.loanId !== loan.id) fail('price reading is for another loan');
  const age = BigInt(at) - BigInt(r.ts);
  if (age < 0n) fail('price reading is from the future');
  if (age > loan.terms.maxPriceAge) fail('price reading is stale');
  if (BigInt(r.ts) <= loan.lastPriceTs) fail('price reading is not newer than the last one used');
  if (BigInt(r.priceMicroUsd) <= 0n) fail('price must be positive');
  return BigInt(r.priceMicroUsd);
}

/** On default the lender is made whole (debt + penalty, priced at the signed reading); the rest goes back to the borrower. */
export function settleDefault(loan, at, priceMicroUsd) {
  const owed = debtAt(loan, at) * (10_000n + loan.terms.penaltyBps) / 10_000n;
  const lenderWanted = (owed * ZAT_PER_ZEC + priceMicroUsd - 1n) / priceMicroUsd;
  const lenderZat = lenderWanted > loan.terms.collateralZat ? loan.terms.collateralZat : lenderWanted;
  const covered = collateralValue(lenderZat, priceMicroUsd);
  return { lenderZat, borrowerZat: loan.terms.collateralZat - lenderZat, shortfallMicroUsd: owed > covered ? owed - covered : 0n };
}

const release = (to, signers, extra = {}) => ({ type: 'release', to, signers, ...extra });

function declareDefault(loan, ev, reason, price) {
  const settlement = settleDefault(loan, ev.at, price);
  const next = mark(loan, 'defaulted', ev, { lastPriceTs: BigInt(ev.reading.ts), defaultReason: reason, settlement });
  return { loan: next, effects: [release('lender+borrower', ['lender', 'keeper'], { settlement, reason })] };
}

const handlers = {
  collateralLocked(loan, ev) {
    need(loan, 'proposed');
    if (BigInt(ev.at) > loan.createdAt + loan.terms.fundWindow) fail('collateral arrived after the funding window');
    if (BigInt(ev.zat) < loan.terms.collateralZat) fail('collateral below the agreed amount');
    return { loan: mark(loan, 'collateral_locked', ev, { lockedAt: BigInt(ev.at), lockTx: ev.txid }), effects: [{ type: 'ask-lender-to-pay' }] };
  },
  loanPaid(loan, ev) {
    need(loan, 'collateral_locked');
    if (BigInt(ev.at) > loan.lockedAt + loan.terms.payWindow) fail('loan payment arrived after the pay window');
    if (ev.amount === undefined || BigInt(ev.amount) < loan.terms.principal) fail('loan payment is below the principal');
    const price = checkReading(loan, ev.reading, ev.at);
    const ltv = ltvBps(loan.terms.principal, loan.terms.collateralZat, price);
    if (ltv > loan.terms.maxStartLtvBps) fail(`opening LTV ${ltv} bps is above the limit ${loan.terms.maxStartLtvBps}`);
    const next = mark(loan, 'active', ev, { activeAt: BigInt(ev.at), dueAt: BigInt(ev.at) + loan.terms.termSeconds, payRef: ev.ref, paidAmount: BigInt(ev.amount), lastPriceTs: BigInt(ev.reading.ts) });
    return { loan: next, effects: [] };
  },
  repaid(loan, ev) {
    need(loan, 'active');
    const due = debtAt(loan, ev.at);
    if (BigInt(ev.amount) < due) fail(`repayment ${ev.amount} is below the debt ${due}`);
    const next = mark(loan, 'repaid', ev, { repayRef: ev.ref, paidAmount: BigInt(ev.amount), repaidDebt: due });
    return { loan: next, effects: [release('borrower', ['borrower', 'lender'], { zat: loan.terms.collateralZat })] };
  },
  price(loan, ev) {
    need(loan, 'active');
    const price = checkReading(loan, ev.reading, ev.at);
    const ltv = ltvBps(debtAt(loan, ev.at), loan.terms.collateralZat, price);
    if (ltv < loan.terms.liqLtvBps) return { loan: { ...loan, lastPriceTs: BigInt(ev.reading.ts) }, effects: [{ type: 'ok', ltvBps: ltv }] };
    return declareDefault(loan, ev, 'price', price);
  },
  termDefault(loan, ev) {
    need(loan, 'active');
    if (BigInt(ev.at) <= loan.dueAt + loan.terms.graceSeconds) fail('term and grace period have not ended');
    return declareDefault(loan, ev, 'term', checkReading(loan, ev.reading, ev.at));
  },
  tick(loan, ev) {
    const at = BigInt(ev.at);
    if (loan.state === 'proposed' && at > loan.createdAt + loan.terms.fundWindow) return { loan: mark(loan, 'expired', ev), effects: [] };
    if (loan.state === 'collateral_locked' && at > loan.lockedAt + loan.terms.payWindow) {
      return { loan: mark(loan, 'aborted', ev), effects: [release('borrower', ['borrower', 'keeper'], { zat: loan.terms.collateralZat })] };
    }
    return { loan, effects: [] };
  },
  releaseConfirmed(loan, ev) {
    const to = { repaid: 'closed_repaid', defaulted: 'closed_defaulted', aborted: 'closed_aborted' }[loan.state];
    if (!to) fail(`nothing to release in state ${loan.state}`);
    return { loan: mark(loan, to, ev, { releaseTx: ev.txid }), effects: [] };
  },
};

export function step(loan, ev) {
  const h = handlers[ev.type];
  if (!h) fail(`unknown event ${ev.type}`);
  if (ev.at === undefined) fail('event needs a time (at)');
  // Time comes from the driver's trusted clock or block time, never from a party, and may only move forward.
  if (BigInt(ev.at) < loan.lastAt) fail('event time is earlier than the last accepted event');
  const out = h(loan, ev);
  return { ...out, loan: { ...out.loan, lastAt: BigInt(ev.at) } };
}
